import type {SchemaResponse} from "@/lib/api/client";

export interface StackEntry {
  pylonType: string; // "module::Name"
  parent?: {id: string; fieldName: string; parentType: string};
}

const findType = (schema: SchemaResponse, qualname: string) => {
  const [module, name] = qualname.split("::");
  return schema.types.find((t) => t.module === module && t.name === name);
};

// Parses the URL's nested-path tail (rootType/id/field/id/field/...) into a
// stack of views, resolving each level's target type via the schema — the
// same deep-linkable scheme gel-ui uses, confirmed against a real gel-ui URL:
// /main/data/account::Account/<id>/contacts/<id>/default_address
export const parseStack = (schema: SchemaResponse, splat: string): StackEntry[] | null => {
  const parts = splat.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const [rootType, ...rest] = parts;
  if (!findType(schema, rootType)) return null;

  const stack: StackEntry[] = [{pylonType: rootType}];
  for (let i = 0; i + 1 < rest.length; i += 2) {
    const id = rest[i];
    const fieldName = rest[i + 1];
    const currentType = stack[stack.length - 1].pylonType;
    const field = findType(schema, currentType)?.fields.find((f) => f.name === fieldName);
    if (!field?.target) break; // invalid/stale path segment — stop here rather than crash
    stack.push({pylonType: field.target, parent: {id, fieldName, parentType: currentType}});
  }
  return stack;
};

export const stackToPath = (stack: StackEntry[]): string =>
  [stack[0].pylonType, ...stack.slice(1).flatMap((e) => [e.parent!.id, e.parent!.fieldName])].join("/");
