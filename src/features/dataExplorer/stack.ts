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
// stack of views, resolving each level's target type via the schema — a
// deep-linkable scheme, e.g.:
// /main/data/account::Account/<id>/contacts/<id>/default_address
export const parseStack = (schema: SchemaResponse, splat: string): StackEntry[] | null => {
  const parts = splat.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const [rootType, ...rest] = parts;
  const rootTypeDesc = findType(schema, rootType);
  // A junction type (@pylon.junction) backs a through-typed multi-link's own
  // link-property storage — entirely compiler-managed, never browsed
  // directly (see SchemaType.junction) — treated as unresolvable here, same
  // as a genuinely unknown type, so a direct URL to one 404s instead of
  // silently rendering it.
  if (!rootTypeDesc || rootTypeDesc.junction) return null;

  const stack: StackEntry[] = [{pylonType: rootType}];
  for (let i = 0; i + 1 < rest.length; i += 2) {
    const id = rest[i];
    const fieldName = rest[i + 1];
    const currentType = stack[stack.length - 1].pylonType;
    const pointer = findType(schema, currentType)?.pointers.find((p) => p.name === fieldName);
    if (!pointer?.target) break; // invalid/stale path segment — stop here rather than crash
    stack.push({pylonType: pointer.target, parent: {id, fieldName, parentType: currentType}});
  }
  return stack;
};

export const stackToPath = (stack: StackEntry[]): string =>
  [stack[0].pylonType, ...stack.slice(1).flatMap((e) => [e.parent!.id, e.parent!.fieldName])].join("/");

// A pending (not-yet-saved) insert row has no persisted uuid to address by —
// e.g. /main/data/account::Individual/0/emails — its position among
// same-type pending inserts (0, 1, 2, ...) is used as the URL segment
// instead. A real object's id is always a hyphenated uuid, so this is
// unambiguous.
export const parseInsertIndex = (id: string): number | null => (/^\d+$/.test(id) ? Number(id) : null);
