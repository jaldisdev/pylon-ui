import type {SchemaResponse} from "@/lib/api/client";

// A field's inferred display type, resolved from real schema data (not a
// value-shape guess) — used by JsonTree/ScalarValue to show `<uuid>`/
// `<std::datetime>` tags and `module::Enum.Member` labels the way Gel's
// inspector does.
export type FieldTypeTag = {kind: "scalar"; tag: string} | {kind: "enum"; module: string; name: string};

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

  if (field.kind === "enum" && field.target) {
    const [enumModule, enumName] = field.target.split("::");
    return {kind: "enum", module: enumModule, name: enumName};
  }

  const tag = field.typeName ? TAG_BY_TYPE_NAME[field.typeName] : undefined;
  return tag ? {kind: "scalar", tag} : null;
};
