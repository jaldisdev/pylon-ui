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

import type {SchemaPointer} from "@/lib/api/client";

// A pointer whose values are objects: a stored link, or a computed selecting
// them (`Computed[MultiLink[Account], '.memberships.member']`), which reports
// the type it selects as `target` exactly as a stored link does. Both are
// fetched, displayed and walked into the same way — a computed one is just
// never editable, which every call site already decides separately (see
// isEditableCell).
export const linksObjects = (pointer: SchemaPointer): boolean =>
  pointer.kind === "link" || pointer.kind === "multiLink" || (pointer.kind === "computed" && pointer.target !== undefined);

// ...and holds a set of them rather than at most one.
export const linksManyObjects = (pointer: SchemaPointer): boolean =>
  pointer.kind === "multiLink" || (pointer.kind === "computed" && pointer.target !== undefined && pointer.multi === true);
