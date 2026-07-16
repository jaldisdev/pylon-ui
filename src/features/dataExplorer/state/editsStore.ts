import {create} from "zustand";

// Data Explorer edit-tracking state — a plain-Zustand port of gel-ui's
// DataEditingManager (shared/studio/tabs/dataview/state/edits.ts). gel-ui
// wraps this in a MobX-keystone model purely for context injection
// (findParent/dbCtx) — the actual data (four Maps/Sets) is plain MobX state
// with no keystone-specific behavior, so it ports mechanically here.
//
// A module-level singleton (not component state) so it survives
// DataExplorerTab's remount-via-`key` pattern on stack navigation — edits
// made on one type must still be visible after drilling into/back out of a
// nested link view. Never persisted (matches gel-ui: reload loses pending
// edits, same as leaving the page in Gel's own studio).

// The value of one pending property edit — either a successfully parsed/cast
// value ready to bind as a query param, or the raw text plus why it failed,
// kept around so the cell can show it (and the Review Changes modal can
// surface the error) rather than silently reverting.
export type EditValue = {valid: true; value: unknown} | {valid: false; raw: string; error: string};

export interface UpdatePropertyEdit {
  objectId: string;
  objectTypeName: string; // "module::Name"
  pointerName: string;
  value: EditValue;
}

export interface ActivePropertyEdit {
  objectId: string | number; // number = a pending-insert row's temp id
  objectTypeName: string;
  pointerName: string;
}

export type LinkChangeKind = "add" | "remove";

export interface LinkChange {
  kind: LinkChangeKind;
  id: string;
  typename: string;
  // Junction (through-type) property values for this target — only
  // meaningful for kind "add" on a through-typed multi-link. Keyed by the
  // through-type's own pointer name (e.g. "weight").
  properties?: Record<string, EditValue>;
}

export interface UpdateLinkEdit {
  objectId: string | number; // number = a pending-insert row's temp id
  objectTypeName: string;
  pointerName: string;
  linkTypeName: string;
  setNull: boolean;
  changes: Map<string, LinkChange>; // keyed by target object id
  inserts: Set<number>; // temp ids of same-batch pending inserts linked here
  // Junction property values for same-batch pending-insert targets, keyed by
  // temp id — parallels `changes`' per-LinkChange `properties` (a Set has no
  // place to attach them directly).
  insertProperties: Map<number, Record<string, EditValue>>;
}

export interface InsertObjectEdit {
  id: number; // temp id, unique within a session
  objectTypeName: string;
  data: Record<string, EditValue | undefined>;
}

export interface DeleteObjectEdit {
  objectId: string;
  objectTypeName: string;
}

interface DataEditsState {
  propertyEdits: Map<string, UpdatePropertyEdit>; // key `${objectId}__${pointerName}`
  activePropertyEdit: ActivePropertyEdit | null;
  linkEdits: Map<string, UpdateLinkEdit>; // key `${objectId}__${pointerName}`
  insertEdits: Map<number, InsertObjectEdit>; // key = temp id
  deleteEdits: Map<string, DeleteObjectEdit>; // key = real uuid

  startEditingCell: (edit: ActivePropertyEdit) => void;
  discardActiveEdit: () => void;
  commitPropertyEdit: (value: EditValue) => void;
  clearPropertyEdit: (objectId: string | number, pointerName: string) => void;

  createNewRow: (
    objectTypeName: string,
    autoLink?: {
      parentId: string | number;
      parentObjectTypeName: string;
      pointerName: string;
      linkTypeName: string;
      single: boolean;
    }
  ) => number;
  removeInsertedRow: (tempId: number) => void;
  toggleRowDelete: (objectId: string, objectTypeName: string) => void;

  setLinkNull: (objectId: string | number, objectTypeName: string, pointerName: string, linkTypeName: string) => void;
  addLinkUpdate: (
    objectId: string | number,
    objectTypeName: string,
    pointerName: string,
    linkTypeName: string,
    target: {id: string; typename: string},
    single: boolean,
    // True when `target` was already this single-link's server-side value
    // before any edits this session — re-selecting it nets to zero change,
    // so it discards the whole pending edit instead of recording a
    // spurious "add". Irrelevant (never triggers a discard) for a
    // multi-link — see addLinkUpdate's own comment.
    wasOriginallyLinked?: boolean
  ) => void;
  removeLinkUpdate: (
    objectId: string | number,
    objectTypeName: string,
    pointerName: string,
    linkTypeName: string,
    targetId: string
  ) => void;
  toggleLinkInsert: (
    objectId: string | number,
    objectTypeName: string,
    pointerName: string,
    linkTypeName: string,
    tempId: number,
    single: boolean
  ) => void;
  // Set one junction (through-type) property value for a checked link
  // target — `targetId` is either a real target uuid (an existing-object
  // add, tracked in `changes`) or a same-batch pending insert's temp id
  // (tracked in `insertProperties`). No-op if the target isn't currently an
  // "add" (e.g. unchecked, or a plain "remove").
  setLinkTargetProperty: (
    objectId: string | number,
    objectTypeName: string,
    pointerName: string,
    linkTypeName: string,
    targetId: string | number,
    propName: string,
    value: EditValue
  ) => void;

  clearAllPendingEdits: () => void;
}

const editKey = (objectId: string | number, pointerName: string) => `${objectId}__${pointerName}`;

// True once an edit has cancelled itself out entirely (e.g. add-then-remove,
// or remove-then-re-add, of the same target) — the pointer is back to its
// original state and the map entry should be dropped, not kept as a
// zero-op edit that would still flip the row to "touched".
const isEmptyLinkEdit = (edit: UpdateLinkEdit): boolean =>
  !edit.setNull && edit.changes.size === 0 && edit.inserts.size === 0;

const emptyLinkEdit = (
  objectId: string | number,
  objectTypeName: string,
  pointerName: string,
  linkTypeName: string
): UpdateLinkEdit => ({
  objectId,
  objectTypeName,
  pointerName,
  linkTypeName,
  setNull: false,
  changes: new Map(),
  inserts: new Set(),
  insertProperties: new Map(),
});

// Temp ids for not-yet-saved inserted objects — negative and decreasing so
// they can never collide with a real row's numeric-looking uuid segment or
// with array indices used elsewhere in the grid.
let nextTempId = -1;

export const useDataEditsStore = create<DataEditsState>()((set, get) => ({
  propertyEdits: new Map(),
  activePropertyEdit: null,
  linkEdits: new Map(),
  insertEdits: new Map(),
  deleteEdits: new Map(),

  startEditingCell: (edit) => set({activePropertyEdit: edit}),
  discardActiveEdit: () => set({activePropertyEdit: null}),

  commitPropertyEdit: (value) => {
    const active = get().activePropertyEdit;
    if (!active) return;
    const {objectId, objectTypeName, pointerName} = active;

    if (typeof objectId === "number") {
      // Pending-insert row: write straight into the insert's own data — no
      // separate diff entry needed since its insert statement is generated
      // fresh from `data` every time.
      set((s) => {
        const insertEdits = new Map(s.insertEdits);
        const existing = insertEdits.get(objectId);
        if (existing) insertEdits.set(objectId, {...existing, data: {...existing.data, [pointerName]: value}});
        return {insertEdits, activePropertyEdit: null};
      });
      return;
    }

    set((s) => {
      const propertyEdits = new Map(s.propertyEdits);
      propertyEdits.set(editKey(objectId, pointerName), {objectId, objectTypeName, pointerName, value});
      return {propertyEdits, activePropertyEdit: null};
    });
  },

  clearPropertyEdit: (objectId, pointerName) => {
    if (typeof objectId === "number") {
      set((s) => {
        const insertEdits = new Map(s.insertEdits);
        const existing = insertEdits.get(objectId);
        if (existing) {
          const data = {...existing.data};
          delete data[pointerName];
          insertEdits.set(objectId, {...existing, data});
        }
        return {insertEdits};
      });
      return;
    }
    set((s) => {
      const propertyEdits = new Map(s.propertyEdits);
      propertyEdits.delete(editKey(objectId, pointerName));
      return {propertyEdits};
    });
  },

  createNewRow: (objectTypeName, autoLink) => {
    const id = nextTempId--;
    set((s) => {
      const insertEdits = new Map(s.insertEdits);
      insertEdits.set(id, {id, objectTypeName, data: {}});
      return {insertEdits};
    });
    if (autoLink) {
      get().toggleLinkInsert(
        autoLink.parentId,
        autoLink.parentObjectTypeName,
        autoLink.pointerName,
        autoLink.linkTypeName,
        id,
        autoLink.single
      );
    }
    return id;
  },

  removeInsertedRow: (tempId) => {
    set((s) => {
      const insertEdits = new Map(s.insertEdits);
      insertEdits.delete(tempId);

      const linkEdits = new Map(s.linkEdits);
      for (const [key, edit] of s.linkEdits) {
        if (!edit.inserts.has(tempId)) continue;
        const inserts = new Set(edit.inserts);
        inserts.delete(tempId);
        if (isEmptyLinkEdit({...edit, inserts})) {
          linkEdits.delete(key);
        } else {
          linkEdits.set(key, {...edit, inserts});
        }
      }
      return {insertEdits, linkEdits};
    });
  },

  toggleRowDelete: (objectId, objectTypeName) => {
    set((s) => {
      const deleteEdits = new Map(s.deleteEdits);
      if (deleteEdits.has(objectId)) {
        deleteEdits.delete(objectId);
      } else {
        deleteEdits.set(objectId, {objectId, objectTypeName});
      }
      return {deleteEdits};
    });
  },

  setLinkNull: (objectId, objectTypeName, pointerName, linkTypeName) => {
    set((s) => {
      const linkEdits = new Map(s.linkEdits);
      linkEdits.set(editKey(objectId, pointerName), {
        ...emptyLinkEdit(objectId, objectTypeName, pointerName, linkTypeName),
        setNull: true,
      });
      return {linkEdits};
    });
  },

  addLinkUpdate: (objectId, objectTypeName, pointerName, linkTypeName, target, single, wasOriginallyLinked) => {
    set((s) => {
      const linkEdits = new Map(s.linkEdits);
      const key = editKey(objectId, pointerName);
      // Single-link only: re-selecting the target that was already linked
      // on the server before any edits this session is a true no-op (the
      // pointer's pending edit — whatever it was, a different target's
      // "add" or a setNull — is entirely superseded by picking the
      // original value back) — discard it outright rather than recording
      // an "add" that would otherwise generate a no-op commit statement.
      if (single && wasOriginallyLinked) {
        linkEdits.delete(key);
        return {linkEdits};
      }
      const existing = linkEdits.get(key) ?? emptyLinkEdit(objectId, objectTypeName, pointerName, linkTypeName);
      // A single-link can only reference one target — selecting a new one
      // always clears any other pending change/insert for this pointer first.
      const changes = single ? new Map<string, LinkChange>() : new Map(existing.changes);
      // Re-adding a target that was only pending *removal* this session (not
      // yet committed) just cancels the pending remove — back to its
      // original still-linked state — mirroring how removeLinkUpdate cancels
      // a pending add below.
      if (changes.get(target.id)?.kind === "remove") {
        changes.delete(target.id);
      } else {
        changes.set(target.id, {kind: "add", id: target.id, typename: target.typename});
      }
      const inserts = single ? new Set<number>() : existing.inserts;
      const next = {...existing, setNull: false, changes, inserts};
      if (isEmptyLinkEdit(next)) linkEdits.delete(key);
      else linkEdits.set(key, next);
      return {linkEdits};
    });
  },

  removeLinkUpdate: (objectId, objectTypeName, pointerName, linkTypeName, targetId) => {
    set((s) => {
      const linkEdits = new Map(s.linkEdits);
      const key = editKey(objectId, pointerName);
      const existing = linkEdits.get(key) ?? emptyLinkEdit(objectId, objectTypeName, pointerName, linkTypeName);
      const changes = new Map(existing.changes);
      // Unchecking a target that was only *added* this session (not yet
      // committed) just cancels the pending add — no need to record a remove.
      if (changes.get(targetId)?.kind === "add") {
        changes.delete(targetId);
      } else {
        changes.set(targetId, {kind: "remove", id: targetId, typename: linkTypeName});
      }
      const next = {...existing, changes};
      if (isEmptyLinkEdit(next)) linkEdits.delete(key);
      else linkEdits.set(key, next);
      return {linkEdits};
    });
  },

  toggleLinkInsert: (objectId, objectTypeName, pointerName, linkTypeName, tempId, single) => {
    set((s) => {
      const linkEdits = new Map(s.linkEdits);
      const key = editKey(objectId, pointerName);
      const existing = linkEdits.get(key) ?? emptyLinkEdit(objectId, objectTypeName, pointerName, linkTypeName);

      let inserts: Set<number>;
      let changes = existing.changes;
      if (existing.inserts.has(tempId)) {
        inserts = new Set(existing.inserts);
        inserts.delete(tempId);
      } else if (single) {
        inserts = new Set([tempId]);
        changes = new Map(); // single-link: picking a pending insert clears any other pending target
      } else {
        inserts = new Set(existing.inserts);
        inserts.add(tempId);
      }
      const next = {...existing, setNull: false, changes, inserts};
      if (isEmptyLinkEdit(next)) linkEdits.delete(key);
      else linkEdits.set(key, next);
      return {linkEdits};
    });
  },

  setLinkTargetProperty: (objectId, objectTypeName, pointerName, linkTypeName, targetId, propName, value) => {
    set((s) => {
      const linkEdits = new Map(s.linkEdits);
      const key = editKey(objectId, pointerName);
      const existing = linkEdits.get(key) ?? emptyLinkEdit(objectId, objectTypeName, pointerName, linkTypeName);

      if (typeof targetId === "number") {
        if (!existing.inserts.has(targetId)) return {}; // not a checked target — no-op
        const insertProperties = new Map(existing.insertProperties);
        insertProperties.set(targetId, {...insertProperties.get(targetId), [propName]: value});
        linkEdits.set(key, {...existing, insertProperties});
        return {linkEdits};
      }

      const change = existing.changes.get(targetId);
      if (change?.kind === "remove") return {}; // explicitly being unlinked — no-op
      const changes = new Map(existing.changes);
      // No explicit "add" yet means this target is already linked on the
      // server and just hasn't been toggled — editing its property value is
      // still a meaningful pending edit (re-affirms the link so the
      // generated `+=` reaches the compiler's ON CONFLICT DO UPDATE upsert,
      // rather than being silently dropped).
      changes.set(targetId, {
        kind: "add",
        id: targetId,
        typename: linkTypeName,
        properties: {...change?.properties, [propName]: value},
      });
      linkEdits.set(key, {...existing, changes});
      return {linkEdits};
    });
  },

  clearAllPendingEdits: () =>
    set({
      propertyEdits: new Map(),
      activePropertyEdit: null,
      linkEdits: new Map(),
      insertEdits: new Map(),
      deleteEdits: new Map(),
    }),
}));

// Gates the Review Changes button's *existence* (not just its enabled
// state), matching gel-ui's `hasPendingEdits` computed exactly.
export const useHasPendingEdits = (): boolean =>
  useDataEditsStore(
    (s) => s.propertyEdits.size > 0 || s.linkEdits.size > 0 || s.insertEdits.size > 0 || s.deleteEdits.size > 0
  );
