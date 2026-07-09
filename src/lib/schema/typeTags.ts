import type {SchemaResponse} from "@/lib/api/client";

// A field's inferred display type, resolved from real schema data (not a
// value-shape guess) — used by JsonTree to show `<uuid>`/`<std::datetime>`
// tags and `module::Enum.Member` labels the way Gel's inspector does.
export type FieldTypeTag = {kind: "scalar"; tag: string} | {kind: "enum"; module: string; name: string};

const SCALAR_TAG_BY_PG_TYPE: Record<string, string> = {
  uuid: "uuid",
  "timestamp with time zone": "std::datetime",
  timestamptz: "std::datetime",
  "timestamp without time zone": "cal::local_datetime",
  timestamp: "cal::local_datetime",
  date: "cal::local_date",
  json: "json",
  jsonb: "json",
};

// Postgres's format_type() wraps custom type names (e.g. enums) in double quotes.
const unquotePgType = (pgType: string) => pgType.replace(/^"(.*)"$/, "$1");

export const lookupFieldTypeTag = (
  schema: SchemaResponse | undefined,
  pylonType: string | undefined,
  fieldName: string
): FieldTypeTag | null => {
  if (!schema || !pylonType) return null;

  const [module, name] = pylonType.split("::");
  const type = schema.types.find((t) => t.module === module && t.name === name);
  const field = type?.fields.find((f) => f.name === fieldName);
  if (!field) return null;

  const enumDef = schema.enums.find((e) => e.name === unquotePgType(field.type));
  if (enumDef) return {kind: "enum", module: enumDef.module, name: enumDef.name};

  const scalarTag = SCALAR_TAG_BY_PG_TYPE[field.type];
  return scalarTag ? {kind: "scalar", tag: scalarTag} : null;
};
