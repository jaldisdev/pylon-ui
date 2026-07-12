import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";

// Detects whether a query-param's raw cast text names a tuple type — nominal
// (a registered named-tuple class, e.g. "default::Point") or structural (an
// inline `tuple<...>` cast text, e.g. "tuple<street: str, zip: str>") — and
// resolves its member list so ParamsPanel can render a TupleEditor instead of
// a plain text input. Returns null for any other (plain scalar/enum) cast.
export const resolveTupleParamMembers = (
  castType: string | null,
  schema: SchemaResponse | undefined
): NamedTupleMember[] | null => {
  if (!castType || !schema) return null;
  const trimmed = castType.trim();
  if (/^tuple\s*</i.test(trimmed)) return parseStructuralTupleCast(trimmed, schema);

  const [module, name] = trimmed.includes("::") ? trimmed.split("::") : ["default", trimmed];
  const nt = schema.namedTuples.find((n) => n.module === module && n.name === name);
  return nt ? nt.members : null;
};

// Same detection as resolveTupleParamMembers, for a query param cast to
// `array<T>` — resolves T's own member-shape descriptor so ParamsPanel can
// render an ArrayEditor instead of a plain text input. Returns null for any
// other cast (including tuple/enum/scalar, handled above).
export const resolveArrayParamElement = (
  castType: string | null,
  schema: SchemaResponse | undefined
): NamedTupleMember | null => {
  if (!castType || !schema) return null;
  const trimmed = castType.trim();
  if (!/^array\s*</i.test(trimmed) || !trimmed.endsWith(">")) return null;
  const inner = trimmed.slice(trimmed.indexOf("<") + 1, -1).trim();
  if (!inner) return null;
  return parseTypeText(inner, schema);
};

// Splits a `tuple<...>` cast's inner element-list text on top-level commas —
// tracking `<...>` nesting depth so a nested tuple element's own internal
// commas aren't mistaken for top-level separators.
const splitTopLevel = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
};

const parseStructuralTupleCast = (text: string, schema: SchemaResponse): NamedTupleMember[] | null => {
  const openIdx = text.indexOf("<");
  if (openIdx === -1 || !text.endsWith(">")) return null;
  const inner = text.slice(openIdx + 1, -1);
  const elementTexts = splitTopLevel(inner, ",");
  if (elementTexts.length === 0) return null;
  return elementTexts.map((elemText) => parseTupleElement(elemText, schema));
};

const parseTupleElement = (text: string, schema: SchemaResponse): NamedTupleMember => {
  const colonIdx = splitTopLevel(text, ":").length > 1 ? text.indexOf(":") : -1;
  const name = colonIdx === -1 ? null : text.slice(0, colonIdx).trim();
  const typeText = (colonIdx === -1 ? text : text.slice(colonIdx + 1)).trim();
  return parseTypeText(typeText, schema, name);
};

// Classifies a bare type-reference string (no "name:" prefix) into a member
// descriptor — shared by a tuple element's own type (after stripping any
// "name:" prefix) and an array's element type (which never has one).
const parseTypeText = (typeText: string, schema: SchemaResponse, name: string | null = null): NamedTupleMember => {
  if (/^tuple\s*</i.test(typeText)) {
    const members = parseStructuralTupleCast(typeText, schema) ?? [];
    return {name, kind: "namedTuple", members};
  }

  const [module, tname] = typeText.includes("::") ? typeText.split("::") : ["default", typeText];
  const enumType = schema.enums.find((e) => e.module === module && e.name === tname);
  if (enumType) return {name, kind: "enum", target: `${enumType.module}::${enumType.name}`};

  const nt = schema.namedTuples.find((n) => n.module === module && n.name === tname);
  if (nt) return {name, kind: "namedTuple", target: `${nt.module}::${nt.name}`};

  return {name, kind: "scalar", typeName: typeText};
};
