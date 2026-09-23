//
// This source file is part of the Pylon open source project.
//
// Copyright (c) 2026 Jaldis B.V.
//
// Licensed under the MIT OR Apache-2.0 license (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://opensource.org/licenses/MIT
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type React from "react";
import {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {useHotkeys} from "react-hotkeys-hook";
import {ArrowLeft, Filter, Link2, RefreshCw} from "lucide-react";
import clsx from "clsx";

import {api, type SchemaPointer} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {useTheme} from "@/lib/theme/useTheme";
import {DataGrid, type LinkEditMode, type SortDir} from "@/features/dataExplorer/DataGrid";
import {FilterPanel} from "@/features/dataExplorer/FilterPanel";
import {concreteSubtypes, InsertRowButton} from "@/features/dataExplorer/InsertRowButton";
import {ObjectTypeSelect} from "@/features/dataExplorer/ObjectTypeSelect";
import {parseInsertIndex, stackToPath, type StackEntry} from "@/features/dataExplorer/stack";
import {useDataEditsStore} from "@/features/dataExplorer/state/editsStore";
import {qualname} from "@/lib/schema/inheritance";
import {linksObjects} from "@/lib/schema/pointers";

type Row = Record<string, unknown>;

interface DataExplorerViewProps {
  stack: StackEntry[];
  basePath: string; // e.g. "/main/data"
  hasPendingEdits: boolean;
  onOpenReview: () => void;
}

// Builds the shape fragment for a SELECT — links/multi-links are
// requested as `{id}` only (the grid just needs a count + the id to
// navigate), verified against the real backend rather than assumed.
// `linkPropNames` (only meaningful when this shape is itself nested inside a
// specific multi-link traversal — see the "nested view of a real parent"
// query branch below) appends `@name` read references for the junction
// type's own properties, e.g. `@weight` — confirmed working directly against
// pylon-core: a bare `@name` in a nested shape reads the link property off
// that specific edge, no different from `@name := expr` on the write side.
const buildShape = (pointers: SchemaPointer[], linkPropNames: string[] = []) =>
  [
    // An object-valued pointer is read as ids only — the grid shows a count
    // and walks into it for the rest. Left bare, a computed one comes back as
    // whole objects (Pylon gives an unshaped object pointer an implicit
    // `{ id }`), which the cell then has nothing better to do with than print.
    ...pointers.map((p) => (linksObjects(p) ? `${p.name}: {id}` : p.name)),
    ...linkPropNames.map((name) => `@${name}`),
  ].join(", ");

// One nested-view level: header (type picker or back-button breadcrumb),
// row count/refresh, filter toggle, and the grid itself. Re-mounted (see the
// `key` on DataExplorerTab's usage) whenever the view identity changes, so
// sort/filter state resets between levels instead of needing manual resets.
export const DataExplorerView: React.FC<DataExplorerViewProps> = ({stack, basePath, hasPendingEdits, onOpenReview}) => {
  const navigate = useNavigate();
  const {branch} = useParams();
  const {data: schema} = useSchema();
  const {resolvedTheme} = useTheme();

  const current = stack[stack.length - 1];
  const schemaType = schema?.types.find((t) => `${t.module}::${t.name}` === current.pylonType);
  const pointers = schemaType?.pointers ?? [];
  // A junction type (@pylon.junction) backs a through-typed multi-link's own
  // link-property storage — entirely compiler-managed, never browsed
  // directly — so the root type picker excludes them (link-property editing
  // elsewhere still looks them up directly off schema.types by name).
  const browsableTypes = useMemo(() => schema?.types.filter((t) => !t.junction) ?? [], [schema]);

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("ASC");
  const [filterExpr, setFilterExpr] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  // "Edit links" mode for a nested link view — while on, the grid shows
  // every object of the target type (not just currently-linked ones) with a
  // checkbox/radio per row: the link picker *is* the grid.
  const [linkEditModeOn, setLinkEditModeOn] = useState(false);
  // Ends "Edit links" mode once a commit (or "Discard all") clears every
  // pending edit — a true->false transition specifically, not just "no
  // pending edits" on its own, since that's also the state right after
  // *entering* the mode before anything's been checked yet.
  const hadPendingEditsRef = useRef(hasPendingEdits);
  useEffect(() => {
    if (hadPendingEditsRef.current && !hasPendingEdits) setLinkEditModeOn(false);
    hadPendingEditsRef.current = hasPendingEdits;
  }, [hasPendingEdits]);
  const [typeSelectOpen, setTypeSelectOpen] = useState(false);
  const createNewRow = useDataEditsStore((s) => s.createNewRow);
  const insertEdits = useDataEditsStore((s) => s.insertEdits);

  // A pending (not-yet-saved) insert row has no persisted uuid to nest under
  // — its position among same-type pending inserts (0, 1, 2, ...) addresses
  // it in the URL instead (see
  // navigateInsertLink below, and stack.ts's parseInsertIndex). Resolved
  // back to the pending insert's real temp id here, since that's what the
  // edits store actually keys link edits by.
  const parentInsertIndex = current.parent ? parseInsertIndex(current.parent.id) : null;
  const isInsertParent = parentInsertIndex !== null;
  const parentTempId =
    parentInsertIndex !== null && current.parent
      ? Array.from(insertEdits.values()).filter((ins) => ins.objectTypeName === current.parent!.parentType)[parentInsertIndex]?.id
      : undefined;

  // Stale/invalid reference (e.g. the pending insert it pointed to was
  // removed since this URL was generated) — bounce back a level rather than
  // rendering against a missing owner, mirroring how parseStack itself stops
  // at the first invalid segment instead of crashing.
  useEffect(() => {
    if (isInsertParent && parentTempId === undefined) {
      navigate(`${basePath}/${stackToPath(stack.slice(0, -1))}`, {replace: true});
    }
  }, [isInsertParent, parentTempId, basePath, navigate, stack]);

  // The parent's own pointer for this link (only set when nested) — tells us
  // whether it's a single-link (radio, exclusive) or multi-link (checkbox),
  // and gates the "Edit links" toggle (hidden for computed backlinks).
  const parentSchemaType = schema?.types.find((t) => `${t.module}::${t.name}` === current.parent?.parentType);
  const parentPointer = parentSchemaType?.pointers.find((p) => p.name === current.parent?.fieldName);
  const isSingleLink = parentPointer?.kind === "link";
  // The junction (through-type)'s own properties (e.g. ProductTag.weight),
  // if any — powers the inline per-row property inputs in "Edit links" mode.
  const throughType = parentPointer?.through
    ? schema?.types.find((t) => `${t.module}::${t.name}` === parentPointer.through)
    : undefined;
  const throughPointers = throughType?.pointers.filter((p) => p.name !== "id");
  // Lets a through-property column be edited in place outside "Edit links"
  // mode too (every row here is already the linked target) — same scope as
  // the nested-parent query branch below, the one shape that actually
  // fetches `@name` values inline for a real persisted parent.
  const viewLinkContext =
    current.parent && !isInsertParent && !linkEditModeOn
      ? {
          parentId: current.parent.id,
          parentObjectTypeName: current.parent.parentType,
          pointerName: current.parent.fieldName,
          linkTypeName: current.pylonType,
        }
      : undefined;

  const query = useMemo(() => {
    if (pointers.length === 0) return null;
    const shape = buildShape(pointers);
    // With no explicit column sort, fall back to creation order (id is a
    // uuidv7, so it's chronological) rather than omitting ORDER BY entirely —
    // an unordered SELECT returns Postgres's physical heap-scan order, which
    // is stable for untouched rows but relocates a row to wherever its new
    // tuple version lands after an UPDATE, making edited rows appear to jump
    // to the end of the list on refresh.
    const orderClause = sortField ? ` order by .${sortField} ${sortDir}` : " order by .id asc";
    const filterClause = filterExpr ? ` filter ${filterExpr}` : "";

    if (current.parent && !isInsertParent && !linkEditModeOn) {
      // Nested view of a real, persisted parent (not editing links): fetch
      // the parent by id with the link field's shape embedded — simpler and
      // verified-working, vs. trying to make the *target* type the
      // top-level SELECT subject via a reverse filter. Link properties (see
      // throughPointers) are only meaningful here — this is the one query
      // shape that's actually scoped to a specific parent-child edge.
      const linkPropNames = throughPointers?.map((p) => p.name) ?? [];
      const nestedShape = linkPropNames.length > 0 ? buildShape(pointers, linkPropNames) : shape;
      return {
        pyql: `select ${current.parent.parentType} { ${current.parent.fieldName}: { ${nestedShape} }${filterClause}${orderClause} limit 500 } filter .id = <uuid>$parentId`,
        params: {parentId: current.parent.id},
        extractField: current.parent.fieldName,
      };
    }
    // Root view, a nested view in "Edit links" mode, or a nested view whose
    // parent is a pending insert row (nothing persisted to fetch by id) —
    // all three want the full target type as a normal top-level SELECT, so
    // link candidates aren't limited to what's already linked.
    return {
      pyql: `SELECT ${current.pylonType} { ${shape} }${filterClause}${orderClause} offset 0 limit 500`,
      params: undefined,
      extractField: null as string | null,
    };
  }, [pointers, sortField, sortDir, filterExpr, current, linkEditModeOn, isInsertParent, throughPointers]);

  const dataQuery = useQuery({
    queryKey: ["dataExplorer", "objects", branch, current, sortField, sortDir, filterExpr, linkEditModeOn],
    queryFn: async () => {
      const res = await api.runQuery(query!.pyql, query!.params);
      if (!query!.extractField) return res.objects as Row[];
      // A single-link field (e.g. "company") extracts to one object or null,
      // not an array like a multi-link does — normalize both cases to Row[].
      const extracted = (res.objects[0] as Row | undefined)?.[query!.extractField];
      return (Array.isArray(extracted) ? extracted : extracted ? [extracted] : []) as Row[];
    },
    enabled: query !== null,
  });

  // Nested views (not editing links) approximate the total count from the
  // fetched objects (no separate count query — a deliberate v1
  // simplification, see the plan); root views and edit-links mode (which is
  // really just a root view of the target type) get a real count via count().
  const countQuery = useQuery({
    queryKey: ["dataExplorer", "count", branch, current.pylonType, filterExpr],
    queryFn: async () => {
      const filterClause = filterExpr ? ` filter ${filterExpr}` : "";
      const res = await api.runQuery(`select count((select ${current.pylonType}${filterClause}))`);
      return res.objects[0] as number;
    },
    enabled: !current.parent || linkEditModeOn || isInsertParent,
  });

  // Which target ids are already linked on the server, plus their current
  // link-property values (e.g. ProductTag.weight) — only needed in "Edit
  // links" mode for a real (persisted) parent, to seed each row's
  // checkbox/radio and property-input starting state. A pending insert row
  // never has anything linked on the server yet, so this is skipped
  // entirely for it.
  const linkedIdsQuery = useQuery({
    queryKey: [
      "dataExplorer",
      "linkedIds",
      branch,
      current.parent?.parentType,
      current.parent?.id,
      current.parent?.fieldName,
    ],
    queryFn: async () => {
      const parent = current.parent!;
      const linkPropNames = throughPointers?.map((p) => p.name) ?? [];
      const propsShape = linkPropNames.length > 0 ? `, ${linkPropNames.map((n) => `@${n}`).join(", ")}` : "";
      const res = await api.runQuery(
        `select ${parent.parentType} { ${parent.fieldName}: {id${propsShape}} } filter .id = <uuid>$parentId`,
        {parentId: parent.id}
      );
      const extracted = (res.objects[0] as Row | undefined)?.[parent.fieldName];
      const items = (Array.isArray(extracted) ? extracted : extracted ? [extracted] : []) as Row[];
      const properties = new Map<string, Record<string, unknown>>();
      for (const item of items) {
        const values: Record<string, unknown> = {};
        for (const name of linkPropNames) values[name] = item[`@${name}`];
        properties.set(item.id as string, values);
      }
      return {ids: new Set(items.map((item) => item.id as string)), properties};
    },
    enabled: !!current.parent && linkEditModeOn && !isInsertParent,
  });

  const linkEditMode: LinkEditMode | undefined =
    current.parent && (linkEditModeOn || isInsertParent) && (!isInsertParent || parentTempId !== undefined)
      ? {
          parentId: isInsertParent ? parentTempId! : current.parent.id,
          parentObjectTypeName: current.parent.parentType,
          pointerName: current.parent.fieldName,
          linkTypeName: current.pylonType,
          single: isSingleLink,
          linkedIds: isInsertParent ? new Set() : (linkedIdsQuery.data?.ids ?? new Set()),
          linkedProperties: isInsertParent ? new Map() : (linkedIdsQuery.data?.properties ?? new Map()),
          throughPointers: throughPointers && throughPointers.length > 0 ? throughPointers : undefined,
        }
      : undefined;

  const objectCount =
    current.parent && !linkEditModeOn && !isInsertParent ? (dataQuery.data?.length ?? null) : (countQuery.data ?? null);

  const goBack = () => navigate(`${basePath}/${stackToPath(stack.slice(0, -1))}`);

  const navigateLink = (row: Row, pointer: {name: string}) => {
    const id = (row.id as string | undefined) ?? "";
    navigate(`${basePath}/${stackToPath(stack)}/${id}/${pointer.name}`);
  };

  // Same nested-view navigation as navigateLink, but for a pending insert
  // row — addressed by its position among same-type pending inserts rather
  // than a (nonexistent) persisted id.
  const navigateInsertLink = (tempId: number, pointer: SchemaPointer) => {
    const sameType = Array.from(insertEdits.values()).filter((ins) => ins.objectTypeName === current.pylonType);
    const index = sameType.findIndex((ins) => ins.id === tempId);
    if (index === -1) return;
    navigate(`${basePath}/${stackToPath(stack)}/${index}/${pointer.name}`);
  };

  const toggleSort = (fieldName: string) => {
    if (sortField !== fieldName) {
      setSortField(fieldName);
      setSortDir("ASC");
    } else if (sortDir === "ASC") {
      setSortDir("DESC");
    } else {
      setSortField(null);
    }
  };

  // Same condition InsertRowButton is rendered under below — reused by the
  // Mod+I hotkey to decide whether inserting even makes sense right now.
  // Only offered at the root view (directly managing a type) — a nested
  // view (whether just viewing linked targets or actively picking/editing
  // them in "Edit links" mode) is browsing *in relation to* a parent
  // object, not managing the target type itself.
  const canInsert = !current.parent && !!schema && !!schemaType;

  const handleInsert = (concreteTypeName: string) => {
    createNewRow(
      concreteTypeName,
      current.parent && (linkEditModeOn || isInsertParent) && (!isInsertParent || parentTempId !== undefined)
        ? {
            parentId: isInsertParent ? parentTempId! : current.parent.id,
            parentObjectTypeName: current.parent.parentType,
            pointerName: current.parent.fieldName,
            linkTypeName: current.pylonType,
            single: isSingleLink,
          }
        : undefined
    );
  };

  // Mod+P object-type quick-switcher — only meaningful at the root view,
  // where ObjectTypeSelect itself is shown.
  useHotkeys(
    "mod+p",
    (event) => {
      if (current.parent) return;
      event.preventDefault();
      setTypeSelectOpen(true);
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Inserts directly when there's exactly one concrete type to insert; an
  // interface with several concrete implementers can't be disambiguated by a
  // single keystroke, so this is a no-op then — use the Insert… dropdown.
  useHotkeys(
    "mod+i",
    (event) => {
      if (!canInsert || !schema || !schemaType) return;
      const options = concreteSubtypes(schema, schemaType);
      if (options.length !== 1) return;
      event.preventDefault();
      handleInsert(qualname(options[0]));
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Mod+F is the browser's own find-in-page and can't be reclaimed — see
  // TopBar.tsx's note on why Mod+Alt+<key> isn't a safe substitute either.
  // Mod+Shift+<key> is the combo that's actually left alone.
  useHotkeys(
    "mod+shift+f",
    (event) => {
      event.preventDefault();
      setFilterOpen((o) => !o);
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Not Mod+Shift+R: that's Safari's own "Show Reader" shortcut, reserved the
  // same way Mod+, is (see TopBar.tsx) — fires natively regardless of any
  // page-level preventDefault. Mod+Shift+U ("Update") dodges it.
  useHotkeys(
    "mod+shift+u",
    (event) => {
      event.preventDefault();
      dataQuery.refetch();
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Output
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 bg-header border-b border-border px-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {current.parent ? (
            <>
              <button
                type="button"
                onClick={goBack}
                className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </button>
              <div className="font-mono text-sm">
                <div className="text-fg-muted">
                  {current.parent.parentType}
                  {isInsertParent && " (new)"}
                </div>
                <div className="text-2xs text-fg-muted/70">.{current.parent.fieldName}</div>
              </div>
            </>
          ) : schema ? (
            <ObjectTypeSelect
              types={browsableTypes}
              selected={schemaType ?? null}
              onSelect={(type) => navigate(`${basePath}/${type.module}::${type.name}`)}
              open={typeSelectOpen}
              onOpenChange={setTypeSelectOpen}
            />
          ) : null}
        </div>

        {/* Flanked by two flex-1 siblings so it sits at the true center of
            the bar regardless of how wide the left/right groups are. */}
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-2sm text-fg-muted">
          {objectCount !== null ? (
            <>
              {objectCount} object{objectCount === 1 ? "" : "s"}
              <button
                type="button"
                onClick={() => dataQuery.refetch()}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-hover hover:text-fg"
              >
                <RefreshCw size={16} strokeWidth={1.75} />
              </button>
            </>
          ) : (
            "loading…"
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {current.parent && !isInsertParent && parentPointer && parentPointer.kind !== "computed" && (
            <button
              type="button"
              onClick={() => setLinkEditModeOn((o) => !o)}
              className={clsx(
                "flex h-8.5 items-center gap-1 rounded-md px-2 border-1 text-sm",
                linkEditModeOn ? "bg-surface-hover border-accent text-accent" : "border-border text-fg-muted hover:bg-surface-hover",
                "transition duration-300"
              )}
            >
              <Link2 size={16} strokeWidth={1.75} />
              Edit links
            </button>
          )}

          {hasPendingEdits && (
            <button
              type="button"
              onClick={onOpenReview}
              className="rounded-md bg-orange-500 h-8.5 px-3 py-1 text-sm font-medium text-white transition duration-300 hover:opacity-90 dark:bg-orange-600"
            >
              Review Changes
            </button>
          )}

          {canInsert && schema && schemaType && (
            <InsertRowButton schema={schema} schemaType={schemaType} onInsert={handleInsert} />
          )}

          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className={clsx(
              "flex h-8.5 items-center gap-1 rounded-md px-2 text-sm",
              filterOpen || filterExpr ? "bg-surface-hover text-accent" : "text-fg-muted hover:bg-surface-hover",
              "transition duration-300"
            )}
          >
            <Filter size={16} strokeWidth={1.75} />
            Filter
          </button>
        </div>
      </div>

      {filterOpen && (
        <FilterPanel
          defaultValue={filterExpr}
          hasActiveFilter={!!filterExpr}
          error={dataQuery.error instanceof Error ? dataQuery.error.message : null}
          dark={resolvedTheme === "dark"}
          onApply={(expr) => setFilterExpr(expr)}
          onClear={() => setFilterExpr("")}
        />
      )}

      {schemaType ? (
        <DataGrid
          pylonType={current.pylonType}
          pointers={pointers}
          rows={dataQuery.data ?? []}
          schema={schema}
          sortField={sortField}
          sortDir={sortField ? sortDir : null}
          onSort={toggleSort}
          onNavigateLink={navigateLink}
          onNavigateInsertLink={navigateInsertLink}
          linkEditMode={linkEditMode}
          viewThroughPointers={throughPointers}
          viewLinkContext={viewLinkContext}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
          {schema ? "Select an object type" : "Loading schema…"}
        </div>
      )}
    </>
  );
};
