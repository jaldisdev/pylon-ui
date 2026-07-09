import type {SyntaxNode} from "@lezer/common";

// Generic Lezer tree-walking helpers (nothing PyQL-specific), copied from
// gel-ui's shared/studio/utils/syntaxTree.ts.

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
