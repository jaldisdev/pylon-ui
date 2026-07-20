import type {NamedTupleMember, SchemaPointer, SchemaResponse, SchemaType} from "@/lib/api/client";
import {pointerTypeTag, UUID_TYPE_TAG, type PointerTypeTag} from "@/lib/schema/typeTags";
import type {DeleteObjectEdit, EditValue, InsertObjectEdit, UpdateLinkEdit, UpdatePropertyEdit} from "./editsStore";

// Ports gel-ui's generateStatements() (shared/studio/tabs/dataview/state/edits.ts)
// to PyQL: groups pending edits by object, emits one insert/update/delete
// statement per affected object, topologically sorts inserts so a same-batch
// forward reference (e.g. a new Post linking a new Tag) is ordered after its
// dependency, and wraps everything as a single `with ... select {...}` query
// — one atomic round trip via the existing /api/query endpoint.
//
// Two deliberate deviations from gel-ui's literal EdgeQL, both because PyQL's
// compiler currently rejects the exact syntax gel-ui uses (confirmed compiler
// gaps against the "PyQL ≡ EdgeQL" contract, not permanent constraints — see
// the plan file):
//   1. No `assert_exists(...)` wrapper — it can't wrap insert/update/delete
//      today. A policy-filtered write would silently no-op instead of
//      erroring, but Pylon has no access-policy feature yet, so this has no
//      live trigger condition.
//   2. Bare `{a, b}` set literals are rejected as a link assignment RHS —
//      every multi-target expression here is a parenthesised subquery/union
//      instead (e.g. `(select Type filter .id = $a or .id = $b)`, never
//      `{$a, $b}` or `distinct {insert0}`).

export interface GeneratedStatement {
  varName: string; // "insert0" | "update1" | "delete1"
  code: string;
  error?: string; // missing required pointer / invalid pending value
}

export interface GeneratedEdits {
  statements: GeneratedStatement[];
  params: Record<string, unknown>; // "pN" -> bound value, referenced in code as <type>$pN
  // "pN" -> the same type tag ScalarValue already renders elsewhere — lets the
  // Review Changes modal show each inlined param value with real formatting
  // (enum labels, tuple literals, etc.) instead of a plain JSON stringify.
  paramTypeTags: Record<string, PointerTypeTag | null>;
  finalQuery: string | null; // the full `with ... select {...}` wrapper, or null if nothing pending
  error?: string; // top-level error (e.g. a cyclic dependency between pending inserts)
}

// The subset of DataEditsState this module needs — kept narrow (no store
// actions) so it stays a pure function over plain data, easy to unit-test
// without touching the Zustand store itself.
export interface EditsSnapshot {
  propertyEdits: Map<string, UpdatePropertyEdit>;
  linkEdits: Map<string, UpdateLinkEdit>;
  insertEdits: Map<number, InsertObjectEdit>;
  deleteEdits: Map<string, DeleteObjectEdit>;
}

class ParamAllocator {
  params: Record<string, unknown> = {};
  typeTags: Record<string, PointerTypeTag | null> = {};
  private counter = 0;

  add(value: unknown, typeTag: PointerTypeTag | null): string {
    const name = `p${this.counter++}`;
    this.params[name] = value;
    this.typeTags[name] = typeTag;
    return name;
  }
}

const findType = (schema: SchemaResponse, qualname: string): SchemaType | undefined => {
  const [module, name] = qualname.split("::");
  return schema.types.find((t) => t.module === module && t.name === name);
};

// The cast type text for one member/element's own type — a nominal
// namedTuple member's own qualified name ({target}), or a reconstructed
// `tuple<...>`/`array<...>` for a structural one, recursing for nesting
// (an array element can't itself be another array — see NamedTupleMember's
// kind union — so this only ever recurses through namedTuple). Mirrors how
// an enum pointer already casts to its own qualified name
// (`<default::Gender>`) rather than a generic escape hatch.
const elementCastText = (m: NamedTupleMember): string =>
  m.kind === "namedTuple" ? tupleCastText(m) : m.kind === "enum" ? m.target! : (m.typeName ?? "str");

// The cast text for one named-tuple member/pointer's own type — the target
// type's qualified name for a nominal member ({target}), or the reconstructed
// `tuple<...>` text for a structural one ({members}).
const tupleCastText = (node: {target?: string; members?: NamedTupleMember[]}): string => {
  if (node.target) return node.target;
  const members = node.members ?? [];
  const positional = members.every((m) => m.name === null);
  return `tuple<${members.map((m) => (positional ? elementCastText(m) : `${m.name}: ${elementCastText(m)}`)).join(", ")}>`;
};

// The cast text for an array pointer's own element type — e.g. `array<str>`,
// `array<default::Gender>`, or `array<tuple<x: std::float64, y: std::float64>>`.
const arrayCastText = (element: NamedTupleMember): string => `array<${elementCastText(element)}>`;

// The PyQL cast type for a property/enum/namedTuple/array pointer's value —
// e.g. "std::str", the enum's own qualified name for an enum cast
// (`<default::Gender>$p0`), the named tuple's own qualified name (nominal)
// / reconstructed `tuple<...>` text (structural) for a namedTuple cast, or
// `array<...>` for an array cast.
const castTypeFor = (pointer: SchemaPointer): string =>
  pointer.kind === "enum"
    ? pointer.target!
    : pointer.kind === "namedTuple"
      ? tupleCastText(pointer)
      : pointer.kind === "array" && pointer.element
        ? arrayCastText(pointer.element)
        : (pointer.typeName ?? "str");

const groupLinkEditsByObjectId = (linkEdits: Map<string, UpdateLinkEdit>): Map<string | number, UpdateLinkEdit[]> => {
  const byId = new Map<string | number, UpdateLinkEdit[]>();
  for (const edit of linkEdits.values()) {
    const list = byId.get(edit.objectId) ?? [];
    list.push(edit);
    byId.set(edit.objectId, list);
  }
  return byId;
};

// Builds the RHS expression (and assignment operator) for one link/multi-link
// edit. `isInsert` forces a full `:=` replace (an insert has no prior state
// to merge with); a single-link always does too (it can only ever reference
// one target). Returns null when there's nothing left to write (e.g. every
// pending Add target was also in this batch's deleteEdits).
//
// A through-typed multi-link can carry per-target junction properties
// (`@prop := <type>$pN`, e.g. Product.tags's ProductTag.weight — see
// pylon-core's link-property write support). Since a shape attaches to one
// target-selecting expression and applies uniformly to every row it yields,
// a target with its own property values can't be folded into the shared
// `.id = $a or .id = $b` batch — it gets its own individually-shaped
// `(select Type filter .id = $x) { @prop := $v }`, combined with any batched
// (property-less) adds via `union`.
const buildLinkExpr = (
  edit: UpdateLinkEdit,
  pointer: SchemaPointer,
  isInsert: boolean,
  insertVarNames: Map<number, string>,
  deletedIds: Set<string>,
  alloc: ParamAllocator,
  schema: SchemaResponse
): {parts: {op: ":=" | "+=" | "-="; expr: string}[]; error?: string} | null => {
  const targetType = edit.linkTypeName;
  // `+=`/`-=` (partial update) only ever apply to a true multi-link — a
  // junction-backed single link (`pointer.kind === "link"` with
  // `pointer.through` set) is still cardinality-one, so it always gets a
  // full `:=` replace below, same as a plain FK-backed single link.
  const isMulti = pointer.kind === "multiLink";

  // `TargetType{}` is a shape query (needs a real FROM-like context, not
  // valid as a bare assignment expression) — the correct way to unset a
  // link is a cast of the empty set literal, `<TargetType>{}`.
  if (edit.setNull) return {parts: [{op: ":=", expr: `<${targetType}>{}`}]};

  // Link properties (`@prop := ...`) apply to any junction-backed pointer,
  // single or multi — decoupled from `isMulti`, which only governs
  // +=/-= vs := below.
  const throughPointers =
    pointer.through ? findType(schema, pointer.through)?.pointers.filter((p) => p.name !== "id") : undefined;

  let error: string | undefined;

  // ` { @prop := <type>$pN, ... }` for one target's junction property
  // values, or "" if there's nothing to write. Flags a missing required
  // (no-default) property the same way a regular insert does.
  const shapeFor = (properties: Record<string, EditValue> | undefined): string => {
    if (!throughPointers) return "";
    const assignments: string[] = [];
    for (const tp of throughPointers) {
      const value = properties?.[tp.name];
      if (value === undefined) {
        if (tp.required && !tp.hasDefault) error = `missing required link property '${tp.name}'`;
        continue;
      }
      if (!value.valid) {
        error = `invalid value for link property '${tp.name}': ${value.error}`;
        continue;
      }
      assignments.push(`@${tp.name} := <${castTypeFor(tp)}>$${alloc.add(value.value, pointerTypeTag(tp, schema))}`);
    }
    return assignments.length > 0 ? ` { ${assignments.join(", ")} }` : "";
  };

  const batchAddConds: string[] = []; // adds with no properties -> batched OR (common case)
  const shapedAddParts: string[] = []; // adds with properties -> individually-shaped selects
  const removeIds: string[] = [];
  for (const change of edit.changes.values()) {
    if (change.kind === "add") {
      if (deletedIds.has(change.id)) continue; // can't link to something also being deleted this batch
      if (throughPointers && change.properties && Object.keys(change.properties).length > 0) {
        const idParam = alloc.add(change.id, UUID_TYPE_TAG);
        shapedAddParts.push(`(select ${targetType} filter .id = <uuid>$${idParam})${shapeFor(change.properties)}`);
      } else {
        batchAddConds.push(`.id = <uuid>$${alloc.add(change.id, UUID_TYPE_TAG)}`);
      }
    } else {
      removeIds.push(change.id);
    }
  }

  const addExprParts: string[] = [];
  if (batchAddConds.length > 0) addExprParts.push(`(select ${targetType} filter ${batchAddConds.join(" or ")})`);
  addExprParts.push(...shapedAddParts);
  for (const tempId of edit.inserts) {
    const varName = insertVarNames.get(tempId);
    if (!varName) continue;
    addExprParts.push(`(select ${varName})${shapeFor(edit.insertProperties.get(tempId))}`);
  }

  const hasAdds = addExprParts.length > 0;
  const hasRemoves = removeIds.length > 0;
  if (!hasAdds && !hasRemoves) return null;

  if (!isMulti || isInsert) {
    // Single-link, or any insert's own link field: always a full replace.
    // `<TargetType>{}` (not a bare `TargetType{}` shape query) when there's
    // nothing to link — see the setNull branch above for why.
    return {parts: [{op: ":=", expr: addExprParts[0] ?? `<${targetType}>{}`}], error};
  }

  if (hasAdds && !hasRemoves) return {parts: [{op: "+=", expr: addExprParts.join(" union ")}], error};

  if (hasRemoves && !hasAdds) {
    const removeConds = removeIds.map((id) => `.id = <uuid>$${alloc.add(id, UUID_TYPE_TAG)}`).join(" or ");
    return {parts: [{op: "-=", expr: `(select ${targetType} filter ${removeConds})`}], error};
  }

  // Mixed add + remove on an existing multi-link: two independent shape
  // elements for the *same* pointer in one SET clause — `tags += (...)` and
  // `tags -= (...)` — rather than one `:=` recomputing the full set via
  // `except` (confirmed directly against the compiler: `except` isn't
  // supported as a general expression operator, but two shape elements for
  // one pointer in the same SET clause compiles and executes correctly,
  // since each becomes its own independent junction CTE sharing the same
  // row source).
  const removeConds = removeIds.map((id) => `.id = <uuid>$${alloc.add(id, UUID_TYPE_TAG)}`).join(" or ");
  return {
    parts: [
      {op: "+=", expr: addExprParts.join(" union ")},
      {op: "-=", expr: `(select ${targetType} filter ${removeConds})`},
    ],
    error,
  };
};

const insertDependencies = (insertId: number, linkEditsByObjectId: Map<string | number, UpdateLinkEdit[]>): number[] => {
  const deps: number[] = [];
  for (const edit of linkEditsByObjectId.get(insertId) ?? []) deps.push(...edit.inserts);
  return deps;
};

// Orders pending inserts so a forward-referenced insert (e.g. a new Tag
// linked from a new Post) is emitted before whatever references it — plain
// `with` bindings compile to Postgres CTEs, which can't forward-reference a
// later-defined one. Throws on a cycle (surfaced as a top-level error, not a
// per-statement one, matching gel-ui).
const topoSortInserts = (
  insertList: InsertObjectEdit[],
  linkEditsByObjectId: Map<string | number, UpdateLinkEdit[]>
): InsertObjectEdit[] => {
  const byId = new Map(insertList.map((ins) => [ins.id, ins]));
  const visited = new Set<number>();
  const inProgress = new Set<number>();
  const sorted: InsertObjectEdit[] = [];

  const visit = (id: number) => {
    if (visited.has(id)) return;
    if (inProgress.has(id)) throw new Error("Cyclic dependency between pending inserts");
    const insert = byId.get(id);
    if (!insert) return;
    inProgress.add(id);
    for (const dep of insertDependencies(id, linkEditsByObjectId)) visit(dep);
    inProgress.delete(id);
    visited.add(id);
    sorted.push(insert);
  };

  for (const ins of insertList) visit(ins.id);
  return sorted;
};

const buildInsertStatement = (
  insert: InsertObjectEdit,
  varName: string,
  schema: SchemaResponse,
  linkEditsByObjectId: Map<string | number, UpdateLinkEdit[]>,
  insertVarNames: Map<number, string>,
  deletedIds: Set<string>,
  alloc: ParamAllocator
): GeneratedStatement => {
  const type = findType(schema, insert.objectTypeName);
  const linkEdits = linkEditsByObjectId.get(insert.id) ?? [];
  const lines: string[] = [];
  let error: string | undefined;

  for (const pointer of type?.pointers ?? []) {
    if (pointer.name === "id") continue;

    // "property" is the common case, but an enum or (nominal/structural)
    // named-tuple pointer is stored in insert.data exactly the same way —
    // castTypeFor/pointerTypeTag already know how to cast/tag each kind, so
    // narrowing this check to just "property" only meant those two kinds
    // were silently dropped from the generated insert entirely.
    if (pointer.kind === "property" || pointer.kind === "enum" || pointer.kind === "namedTuple") {
      const value = insert.data[pointer.name];
      if (value === undefined) {
        if (pointer.required && !pointer.hasDefault) error = `missing required property '${pointer.name}'`;
        continue;
      }
      if (!value.valid) {
        error = `invalid value for '${pointer.name}': ${value.error}`;
        continue;
      }
      lines.push(`${pointer.name} := <${castTypeFor(pointer)}>$${alloc.add(value.value, pointerTypeTag(pointer, schema))}`);
      continue;
    }

    if (pointer.kind === "link" || pointer.kind === "multiLink") {
      const edit = linkEdits.find((e) => e.pointerName === pointer.name);
      if (!edit) {
        if (pointer.kind === "link" && pointer.required && !pointer.hasDefault) {
          error = `missing required link '${pointer.name}'`;
        }
        continue;
      }
      const built = buildLinkExpr(edit, pointer, true, insertVarNames, deletedIds, alloc, schema);
      if (built) {
        if (built.error) error = built.error;
        for (const part of built.parts) lines.push(`${pointer.name} ${part.op} ${part.expr}`);
      }
    }
  }

  const body = lines.length > 0 ? ` {\n    ${lines.join(",\n    ")}\n}` : "";
  return {varName, code: `insert ${insert.objectTypeName}${body}`, error};
};

const buildUpdateStatements = (
  edits: EditsSnapshot,
  schema: SchemaResponse,
  linkEditsByObjectId: Map<string | number, UpdateLinkEdit[]>,
  insertVarNames: Map<number, string>,
  deletedIds: Set<string>,
  alloc: ParamAllocator
): GeneratedStatement[] => {
  const groups = new Map<string, {objectTypeName: string; propertyEdits: UpdatePropertyEdit[]}>();

  for (const edit of edits.propertyEdits.values()) {
    if (deletedIds.has(edit.objectId)) continue; // delete wins over update on the same object
    const g = groups.get(edit.objectId) ?? {objectTypeName: edit.objectTypeName, propertyEdits: []};
    g.propertyEdits.push(edit);
    groups.set(edit.objectId, g);
  }
  for (const [objectId, list] of linkEditsByObjectId) {
    if (typeof objectId !== "string" || deletedIds.has(objectId) || groups.has(objectId)) continue;
    groups.set(objectId, {objectTypeName: list[0].objectTypeName, propertyEdits: []});
  }

  const statements: GeneratedStatement[] = [];
  let i = 0;
  for (const [objectId, group] of groups) {
    const varName = `update${i++}`;
    const type = findType(schema, group.objectTypeName);
    const lines: string[] = [];
    let error: string | undefined;

    for (const edit of group.propertyEdits) {
      if (!edit.value.valid) {
        error = `invalid value for '${edit.pointerName}': ${edit.value.error}`;
        continue;
      }
      const pointer = type?.pointers.find((p) => p.name === edit.pointerName);
      const castType = pointer ? castTypeFor(pointer) : "str";
      const typeTag = pointer ? pointerTypeTag(pointer, schema) : null;
      lines.push(`${edit.pointerName} := <${castType}>$${alloc.add(edit.value.value, typeTag)}`);
    }

    for (const edit of linkEditsByObjectId.get(objectId) ?? []) {
      const pointer = type?.pointers.find((p) => p.name === edit.pointerName);
      if (!pointer) continue;
      const built = buildLinkExpr(edit, pointer, false, insertVarNames, deletedIds, alloc, schema);
      if (built) {
        if (built.error) error = built.error;
        for (const part of built.parts) lines.push(`${edit.pointerName} ${part.op} ${part.expr}`);
      }
    }

    const idParam = alloc.add(objectId, UUID_TYPE_TAG);
    const body = lines.length > 0 ? ` {\n    ${lines.join(",\n    ")}\n}` : " {}";
    statements.push({varName, code: `update ${group.objectTypeName}\nfilter .id = <uuid>$${idParam}\nset${body}`, error});
  }
  return statements;
};

const buildDeleteStatements = (edits: EditsSnapshot, alloc: ParamAllocator): GeneratedStatement[] => {
  let i = 0;
  return Array.from(edits.deleteEdits.values(), (del) => {
    const varName = `delete${i++}`;
    const idParam = alloc.add(del.objectId, UUID_TYPE_TAG);
    return {varName, code: `delete ${del.objectTypeName} filter .id = <uuid>$${idParam}`};
  });
};

const buildFinalQuery = (statements: GeneratedStatement[]): string => {
  const withLines = statements.map((s) => `${s.varName} := (${s.code})`).join(",\n");
  const selectExpr =
    statements.length === 1 ? statements[0].varName : `{ ${statements.map((s) => s.varName).join(", ")} }`;
  return `with\n${withLines}\nselect ${selectExpr}`;
};

export function generateStatements(edits: EditsSnapshot, schema: SchemaResponse): GeneratedEdits {
  const alloc = new ParamAllocator();
  const deletedIds = new Set(edits.deleteEdits.keys());
  const linkEditsByObjectId = groupLinkEditsByObjectId(edits.linkEdits);
  const insertList = Array.from(edits.insertEdits.values());

  let sortedInserts: InsertObjectEdit[];
  try {
    sortedInserts = topoSortInserts(insertList, linkEditsByObjectId);
  } catch (e) {
    return {statements: [], params: {}, paramTypeTags: {}, finalQuery: null, error: e instanceof Error ? e.message : String(e)};
  }

  const insertVarNames = new Map<number, string>();
  sortedInserts.forEach((ins, i) => insertVarNames.set(ins.id, `insert${i}`));

  const insertStatements = sortedInserts.map((ins) =>
    buildInsertStatement(ins, insertVarNames.get(ins.id)!, schema, linkEditsByObjectId, insertVarNames, deletedIds, alloc)
  );
  const updateStatements = buildUpdateStatements(edits, schema, linkEditsByObjectId, insertVarNames, deletedIds, alloc);
  const deleteStatements = buildDeleteStatements(edits, alloc);

  const statements = [...insertStatements, ...updateStatements, ...deleteStatements];
  const finalQuery = statements.length > 0 ? buildFinalQuery(statements) : null;

  return {statements, params: alloc.params, paramTypeTags: alloc.typeTags, finalQuery};
}
