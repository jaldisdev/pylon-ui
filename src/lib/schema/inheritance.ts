import type {SchemaResponse, SchemaType} from "@/lib/api/client";

export const qualname = (t: SchemaType) => `${t.module}::${t.name}`;

// Whether `type` is `ancestorQualname` itself, or descends from it through
// Pylon's real inheritance (@pylon.abstract/@pylon.interface) — walks
// `bases` transitively rather than assuming a single level. Shared by
// InsertRowButton.tsx (which concrete types can satisfy an insert on an
// abstract/interface type) and DataGrid.tsx (whether a pending insert of a
// concrete subtype should also show up on an ancestor type's own grid view).
export const isSelfOrDescendant = (schema: SchemaResponse, type: SchemaType, ancestorQualname: string): boolean =>
  qualname(type) === ancestorQualname ||
  type.bases.some((baseQualname) => {
    const base = schema.types.find((t) => qualname(t) === baseQualname);
    return base ? isSelfOrDescendant(schema, base, ancestorQualname) : false;
  });
