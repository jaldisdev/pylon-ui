import type {SyntaxNode} from "@lezer/common";

import {pyqlLanguage} from "@/lib/editor/lang-pyql/pyql";
import {getAllChildren, getNodeText} from "@/lib/editor/lang-pyql/syntaxTree";

export interface ExtractedParam {
  name: string;
  // Raw cast-type text (e.g. "int64", "str", "uuid") when the param has a
  // leading cast (`<int64>$age`), else null. Unlike gel-ui's equivalent, this
  // isn't resolved against a schema-scalar registry — it's just enough to
  // pick a reasonable coercion rule (see coerceParamValue below). Reflects
  // the *first* occurrence of this param name in the query.
  castType: string | null;
  // A bare cast (`<uuid>$x`) or no cast at all is implicitly required in
  // PyQL/EdgeQL; only an explicit `<optional ...>` makes it optional.
  required: boolean;
  // Set when this param name is used with a different cast (type or
  // optionality) elsewhere in the same query, e.g.
  // `.id = <uuid>$account or .id = <optional uuid>$account` — matches Gel's
  // own validation error for this case, since a single bound value can't
  // satisfy two different casts at once.
  castConflict: string | null;
}

interface CastForm {
  keyword: string | null; // "optional" | "required" | null (bare = required)
  typeName: string | null;
}

// Cast { Keyword? Name } is the shape produced by the grammar for
// `<optional int64>$age` / `<str>$name` — confirmed by inspecting the actual
// parse tree, since the grammar's inlined "castStart"/">" tokens don't
// appear as nodes.
const extractCastForm = (query: string, cast: SyntaxNode): CastForm => {
  let node: SyntaxNode | null = cast.firstChild;
  let keyword: string | null = null;
  if (node?.type.is("Keyword")) {
    keyword = getNodeText(query, node).toLowerCase();
    node = node.nextSibling;
  }
  return {keyword, typeName: node ? getNodeText(query, node) : null};
};

const describeCastForm = (form: CastForm): string =>
  `<${form.keyword === "optional" ? "optional " : ""}${form.typeName ?? "?"}>`;

const sameCastForm = (a: CastForm, b: CastForm): boolean =>
  a.typeName === b.typeName && (a.keyword === "optional") === (b.keyword === "optional");

export const extractParams = (query: string): ExtractedParam[] => {
  const tree = pyqlLanguage.parser.parse(query);
  const paramNodes = getAllChildren(tree.topNode, "QueryParameterName");

  const forms = new Map<string, CastForm[]>();
  for (const node of paramNodes) {
    const name = getNodeText(query, node).slice(1); // strip leading "$"
    const cast = node.prevSibling?.type.is("Cast") ? node.prevSibling : null;
    const form = cast ? extractCastForm(query, cast) : {keyword: null, typeName: null};
    const list = forms.get(name);
    if (list) list.push(form);
    else forms.set(name, [form]);
  }

  return [...forms.entries()].map(([name, occurrences]) => {
    const first = occurrences[0];
    const conflicting = occurrences.find((f) => !sameCastForm(f, first));
    return {
      name,
      castType: first.typeName,
      required: first.keyword !== "optional",
      castConflict: conflicting
        ? `Used with conflicting casts: ${describeCastForm(first)} and ${describeCastForm(conflicting)}`
        : null,
    };
  });
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d+(\.\d+)?$/;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

// Validates a raw input string against the shape a cast/scalar type expects
// — same short tokens coerceParamValue switches on — returning a
// human-readable error, or null when valid. Used wherever a value is typed
// in outside the query editor itself (e.g. the globals modal), where there's
// no PyQL parser/backend round trip to catch a malformed value up front.
export const validateCastValue = (raw: string, castType: string | null): string | null => {
  switch (castType) {
    case "uuid":
      return UUID_RE.test(raw) ? null : "Expected a UUID, e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
    case "int16":
    case "int32":
    case "int64":
      return INT_RE.test(raw) ? null : "Expected an integer";
    case "float32":
    case "float64":
    case "decimal":
      return FLOAT_RE.test(raw) ? null : "Expected a number";
    case "bool":
      return /^(true|false)$/i.test(raw) ? null : "Expected true or false";
    case "json":
      try {
        JSON.parse(raw);
        return null;
      } catch {
        return "Expected valid JSON";
      }
    case "local_date":
      return LOCAL_DATE_RE.test(raw) ? null : "Expected YYYY-MM-DD";
    case "local_time":
      return LOCAL_TIME_RE.test(raw) ? null : "Expected HH:MM[:SS]";
    case "local_datetime":
      return LOCAL_DATETIME_RE.test(raw) ? null : "Expected YYYY-MM-DDTHH:MM[:SS]";
    case "datetime":
      return DATETIME_RE.test(raw) ? null : "Expected an ISO datetime";
    default:
      return null;
  }
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
