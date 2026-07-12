import type {NamedTupleMember, SchemaResponse, ValueShapeTag} from "@/lib/api/client";
import {resolveTupleMembers} from "@/ui/dataEditor/TupleEditor";

// A pointer's inferred display type, resolved from real schema data (not a
// value-shape guess) — used by JsonTree/ScalarValue to show `<uuid>`/
// `<std::datetime>` tags, `module::Enum.Member` labels, and
// `(key := value, ...)` tuple literals the way Gel's inspector does.
export type PointerTypeTag =
  | {kind: "scalar"; tag: string}
  | {kind: "enum"; module: string; name: string}
  | {kind: "namedTuple"; members: NamedTupleMember[]};

// Only these typeNames get a `<tag>` prefix on their value — plain str/int/
// bool/json are self-evident from their JS type already. Tag text matches
// the (slightly inconsistent, short-vs-qualified) style seen in Gel's own
// inspector: `<uuid>` but `<std::datetime>`.
const TAG_BY_TYPE_NAME: Record<string, string> = {
  "std::uuid": "uuid",
  "std::datetime": "std::datetime",
  "cal::local_datetime": "cal::local_datetime",
  "cal::local_date": "cal::local_date",
  "cal::local_time": "cal::local_time",
  "std::duration": "std::duration",
};

// A schema pointer's own type tag — factored out of lookupPointerTypeTag so
// call sites that already have the resolved SchemaPointer in hand (e.g.
// generateStatements.ts building a param's display tag) don't need to
// re-look it up by object-type + pointer name.
export const pointerTypeTag = (
  pointer: {kind: string; target?: string; typeName?: string; members?: NamedTupleMember[]},
  schema: SchemaResponse
): PointerTypeTag | null => {
  if (pointer.kind === "enum" && pointer.target) {
    const [enumModule, enumName] = pointer.target.split("::");
    return {kind: "enum", module: enumModule, name: enumName};
  }

  if (pointer.kind === "namedTuple") {
    return {kind: "namedTuple", members: resolveTupleMembers(pointer, schema)};
  }

  const tag = pointer.typeName ? TAG_BY_TYPE_NAME[pointer.typeName] : undefined;
  return tag ? {kind: "scalar", tag} : null;
};

// Every object id is a plain std::uuid — used to tag id-only params
// (delete/link filters) that have no SchemaPointer of their own to look up.
export const UUID_TYPE_TAG: PointerTypeTag = {kind: "scalar", tag: "uuid"};

export const lookupPointerTypeTag = (
  schema: SchemaResponse | undefined,
  pylonType: string | undefined,
  pointerName: string
): PointerTypeTag | null => {
  if (!schema || !pylonType) return null;

  const [module, name] = pylonType.split("::");
  const type = schema.types.find((t) => t.module === module && t.name === name);
  const pointer = type?.pointers.find((p) => p.name === pointerName);
  if (!pointer) return null;

  return pointerTypeTag(pointer, schema);
};

// Same member-shape lookup as lookupPointerTypeTag, but for a member *within*
// a tuple/named-tuple value (recursing for a nested tuple member) rather
// than a top-level schema pointer — used by ScalarValue when rendering one
// member's own value.
export const memberTypeTag = (member: NamedTupleMember, schema: SchemaResponse): PointerTypeTag | null => {
  if (member.kind === "enum" && member.target) {
    const [module, name] = member.target.split("::");
    return {kind: "enum", module, name};
  }
  if (member.kind === "namedTuple") {
    return {kind: "namedTuple", members: resolveTupleMembers(member, schema)};
  }
  const tag = member.typeName ? TAG_BY_TYPE_NAME[member.typeName] : undefined;
  return tag ? {kind: "scalar", tag} : null;
};

// Converts a compiled query's own value-shape tag (see client.ts's
// ValueShapeTag, sent alongside /api/query's response body) into the same
// PointerTypeTag shape ScalarValue already knows how to render — used by
// JsonTree for values that aren't a known schema pointer (a bare top-level
// cast, or a tuple nested inside a free object), where the pointer-name-
// based lookupPointerTypeTag above has nothing to go on. Only "enum" and
// "namedTuple" shapes are themselves a type tag; "object"/"array" shapes are
// structural (JsonTree recurses into them via valueShapeChild below instead).
export const valueShapeToPointerTypeTag = (shape: ValueShapeTag): PointerTypeTag | null => {
  if (!shape) return null;
  if (shape.kind === "enum") {
    const [module, name] = shape.enumType.split("::");
    return {kind: "enum", module, name};
  }
  if (shape.kind === "namedTuple") {
    return {kind: "namedTuple", members: (shape.members ?? []).map(valueShapeMemberToNamedTupleMember)};
  }
  return null;
};

const valueShapeMemberToNamedTupleMember = (m: {key: string | null; shape: ValueShapeTag}): NamedTupleMember => {
  const shape = m.shape;
  if (shape?.kind === "enum") {
    return {name: m.key, kind: "enum", target: shape.enumType};
  }
  if (shape?.kind === "namedTuple") {
    return {
      name: m.key,
      kind: "namedTuple",
      members: (shape.members ?? []).map(valueShapeMemberToNamedTupleMember),
    };
  }
  return {name: m.key, kind: "scalar"};
};

// The child value-shape for one object pointer / array element — `undefined`
// (not `null`) when the parent shape doesn't cover this value at all (e.g.
// no shape was sent), vs. `null` meaning "this specific value has no tag".
export const valueShapeChild = (
  shape: ValueShapeTag | undefined,
  key: string
): ValueShapeTag | undefined => {
  if (!shape) return undefined;
  if (shape.kind === "object") return shape.pointers[key] ?? undefined;
  if (shape.kind === "array") return shape.element;
  return undefined;
};
