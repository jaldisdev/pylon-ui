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

import {pyqlLanguage} from "@/lib/editor/lang-pyql/pyql";
import {getAllChildren, getNodeText} from "@/lib/editor/lang-pyql/syntaxTree";

export interface ExtractedParam {
  name: string;
  // Raw cast-type text (e.g. "int64", "str", "uuid") when the param has a
  // leading cast (`<int64>$age`), else null. Not resolved against a
  // schema-scalar registry — it's just enough to pick a reasonable coercion
  // rule (see coerceParamValue below). Reflects the *first* occurrence of
  // this param name in the query.
  castType: string | null;
  // A bare cast (`<uuid>$x`) or no cast at all is implicitly required;
  // only an explicit `<optional ...>` makes it optional.
  required: boolean;
  // Set when this param name is used with a different cast (type or
  // optionality) elsewhere in the same query, e.g.
  // `.id = <uuid>$account or .id = <optional uuid>$account` — a single
  // bound value can't satisfy two different casts at once.
  castConflict: string | null;
}

interface CastForm {
  keyword: string | null; // "optional" | "required" | null (bare = required)
  typeName: string | null;
}

// Cast { Keyword? Name } is the shape produced by the grammar for
// `<optional int64>$age` / `<str>$name` — confirmed by inspecting the actual
// parse tree, since the grammar's inlined "castStart"/">" tokens don't
// appear as nodes. A *qualified* type name (`<default::Gender>`) splits
// across multiple sibling nodes (Keyword "default", an error-recovery "::"
// token, then Name "Gender") — confirmed the same way — so the type name is
// reconstructed by spanning from the first remaining node to the last, not
// read off a single node. This also means "default" (the module prefix)
// parses as a Keyword just like "optional"/"required" do, so the leading
// keyword is only consumed when its *text* actually matches one of those.
const extractCastForm = (query: string, cast: SyntaxNode): CastForm => {
  let node: SyntaxNode | null = cast.firstChild;
  let keyword: string | null = null;
  if (node?.type.is("Keyword")) {
    const text = getNodeText(query, node).toLowerCase();
    if (text === "optional" || text === "required") {
      keyword = text;
      node = node.nextSibling;
    }
  }
  if (!node) return {keyword, typeName: null};
  let last = node;
  while (last.nextSibling) last = last.nextSibling;
  return {keyword, typeName: query.slice(node.from, last.to)};
};

// Fallback for when the tree doesn't produce a clean Cast node before this
// param at all — confirmed to happen specifically for `<optional
// module::Name>` (e.g. `<optional default::Gender>`): the module prefix
// ("default") lexes as a Keyword, and having *two* keyword-like tokens in a
// row (the "optional" keyword slot, then the module-as-keyword) breaks the
// grammar's error recovery badly enough that no Cast node is produced at
// all. The raw text is unambiguous even when the tree isn't, so this reads
// the cast straight off the substring immediately before the parameter
// instead of walking the (malformed) tree.
const CAST_TEXT_RE = /<\s*(optional|required)?\s*([^<>]+?)\s*>\s*$/i;

const extractCastFormFromText = (query: string, paramStart: number): CastForm => {
  const match = CAST_TEXT_RE.exec(query.slice(0, paramStart));
  if (!match) return {keyword: null, typeName: null};
  return {keyword: match[1] ? match[1].toLowerCase() : null, typeName: match[2].trim()};
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
    const form = cast ? extractCastForm(query, cast) : extractCastFormFromText(query, node.from);
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
// Same shape as FLOAT_RE, plus PyQL's own decimal-literal suffix (`9.99n`) —
// the Data Explorer's read-only ScalarValue renders decimal values with a
// trailing "n" to match that literal syntax, so typed input has to accept
// (and strip, in coerceParamValue below) the same suffix instead of
// rejecting it or letting it fall through into the bound parameter value.
const DECIMAL_RE = /^-?\d+(\.\d+)?n?$/;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
// Loose Postgres interval shape ("1 day 2 hours", "45 minutes") — permissive
// on purpose: unlike the other patterns here, this one hasn't been verified
// against a real round trip (pylon-demo's schema has no Duration property to
// test against), so it only rejects obviously-empty input rather than
// asserting a precise grammar we haven't confirmed the backend expects.
const DURATION_RE = /\S/;

// castType may be the short form used by query-editor casts (`<int64>$x`,
// already unqualified) or a schema pointer's fully-qualified typeName (e.g.
// "std::int64", "cal::local_date") — strip any module prefix so both callers
// hit the same switch cases.
const shortCastType = (castType: string | null): string | null => (castType ? (castType.split("::").pop() ?? null) : null);

// Validates a raw input string against the shape a cast/scalar type expects
// — same short tokens coerceParamValue switches on — returning a
// human-readable error, or null when valid. Used wherever a value is typed
// in outside the query editor itself (e.g. the globals modal, the Data
// Explorer's inline cell editor), where there's no PyQL parser/backend round
// trip to catch a malformed value up front.
export const validateCastValue = (raw: string, castType: string | null): string | null => {
  switch (shortCastType(castType)) {
    case "uuid":
      return UUID_RE.test(raw) ? null : "Expected a UUID, e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
    case "int16":
    case "int32":
    case "int64":
      return INT_RE.test(raw) ? null : "Expected an integer";
    case "float32":
    case "float64":
      return FLOAT_RE.test(raw) ? null : "Expected a number";
    case "decimal":
      return DECIMAL_RE.test(raw) ? null : "Expected a number";
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
    case "duration":
      return DURATION_RE.test(raw) ? null : "Expected a duration, e.g. '1 hour 30 minutes'";
    case "bytes":
      return raw.length > 0 ? null : "Expected a value";
    default:
      return null;
  }
};

// Light client-side coercion from a raw input string to a value asyncpg can
// bind, based on the detected cast keyword — not a full type system, just
// covers the common scalar cases.
export const coerceParamValue = (raw: string, castType: string | null): unknown => {
  switch (shortCastType(castType)) {
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
    // duration/bytes: passed through as the raw string — unverified against
    // a real round trip (see the DURATION_RE comment above), so no coercion
    // is applied beyond what every other unrecognized cast type already gets.
    default:
      return raw;
  }
};
