import type {CompletionContext, CompletionResult} from "@codemirror/autocomplete";
import {syntaxTree} from "@codemirror/language";
import type {Text} from "@codemirror/state";
import type {SyntaxNode} from "@lezer/common";

import type {SchemaResponse, SchemaType} from "@/lib/api/client";

// Type-name autocomplete after select/insert/update/delete (grammar shape:
// Script > Statement > Keyword/Name, confirmed by inspecting our own parse
// tree). Deliberately scoped to just this one branch for now — completing
// property/link names inside `{ }` shape braces too is a separate, larger
// feature not asked for here.

const sliceDoc = (doc: Text, range: {from: number; to: number}) => doc.sliceString(range.from, range.to);

const isKeyword = (doc: Text, node: SyntaxNode | null, keywords: string[]): boolean =>
  node?.name === "Keyword" && keywords.includes(sliceDoc(doc, node).toLowerCase());

const label = (type: SchemaType): string => `${type.module}::${type.name}`;

export const getTypeCompletions = (schema: SchemaResponse) => {
  const options = schema.types.map((type) => ({label: label(type)}));

  return function completions(context: CompletionContext): CompletionResult | null {
    const doc = context.state.doc;
    const pos = context.pos;

    let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(pos, -1);
    if (node?.name === "Script") node = node.childBefore(pos);
    if (node?.name === "Statement") node = node.childBefore(pos);

    const afterKeyword =
      (isKeyword(doc, node, ["select", "insert", "update", "delete"]) && node!.to < pos) ||
      (node?.name === "Name" && isKeyword(doc, node.prevSibling, ["select", "insert", "update", "delete"]));

    if (!afterKeyword) return null;

    return {
      from: node?.name === "Keyword" ? pos : node!.from,
      options,
      validFor: (_text, _from, to, state) => syntaxTree(state).resolveInner(to, -1)?.name === "Name",
    };
  };
};
