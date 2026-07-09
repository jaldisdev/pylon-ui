import type {SyntaxNode} from "@lezer/common";

import {pyqlLanguage} from "@/lib/editor/lang-pyql/pyql";
import {getAllChildren, getNodeText} from "@/lib/editor/lang-pyql/syntaxTree";

export interface ExtractedParam {
  name: string;
  // Raw cast-type text (e.g. "int64", "str", "uuid") when the param has a
  // leading cast (`<int64>$age`), else null. Unlike gel-ui's equivalent, this
  // isn't resolved against a schema-scalar registry — it's just enough to
  // pick a reasonable coercion rule (see coerceParamValue below).
  castType: string | null;
}

// Walks the parsed query for $name parameters. Cast { Keyword? Name } is the
// shape produced by the grammar for `<optional int64>$age` / `<str>$name` —
// confirmed by inspecting the actual parse tree, since the grammar's inlined
// "castStart"/">" tokens don't appear as nodes.
const extractCastTypeName = (query: string, cast: SyntaxNode): string | null => {
  let node: SyntaxNode | null = cast.firstChild;
  if (node?.type.is("Keyword")) node = node.nextSibling; // skip "optional"/"required"
  return node ? getNodeText(query, node) : null;
};

export const extractParams = (query: string): ExtractedParam[] => {
  const tree = pyqlLanguage.parser.parse(query);
  const paramNodes = getAllChildren(tree.topNode, "QueryParameterName");

  const params = new Map<string, ExtractedParam>();
  for (const node of paramNodes) {
    const name = getNodeText(query, node).slice(1); // strip leading "$"
    if (params.has(name)) continue;
    const cast = node.prevSibling?.type.is("Cast") ? node.prevSibling : null;
    params.set(name, {name, castType: cast ? extractCastTypeName(query, cast) : null});
  }
  return [...params.values()];
};

// Light client-side coercion from a raw input string to a value asyncpg can
// bind, based on the detected cast keyword — not a full type system, just
// covers the common scalar cases.
export const coerceParamValue = (raw: string, castType: string | null): unknown => {
  switch (castType) {
    case "int16":
    case "int32":
    case "int64":
      return parseInt(raw, 10);
    case "float32":
    case "float64":
    case "decimal":
      return parseFloat(raw);
    case "bool":
      return raw.toLowerCase() === "true";
    case "json":
      return JSON.parse(raw);
    default:
      return raw;
  }
};
