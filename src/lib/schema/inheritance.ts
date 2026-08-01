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
