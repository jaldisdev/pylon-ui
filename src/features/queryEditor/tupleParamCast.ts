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
