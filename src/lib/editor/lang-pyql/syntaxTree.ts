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

import type {SyntaxNode} from "@lezer/common";

// Generic Lezer tree-walking helpers (nothing PyQL-specific).

export const getNodeText = (query: string, node: SyntaxNode): string => query.slice(node.from, node.to);

// Depth-first walk collecting every node matching `type`, anywhere under `node`.
export const getAllChildren = (node: SyntaxNode, type: string | number): SyntaxNode[] => {
  const cursor = node.cursor();
  if (!cursor.firstChild()) return [];

  const children: SyntaxNode[] = [];
  let depth = 0;
  while (true) {
    if (cursor.type.is(type)) children.push(cursor.node);
    if (cursor.firstChild()) {
      depth++;
      continue;
    }
    if (cursor.nextSibling()) continue;
    while (true) {
      if (depth === 0) return children;
      cursor.parent();
      depth--;
      if (cursor.nextSibling()) break;
    }
  }
};
