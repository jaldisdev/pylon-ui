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

import type React from "react";

import type {SchemaResponse} from "@/lib/api/client";
import {memberTypeTag, type PointerTypeTag} from "@/lib/schema/typeTags";

interface ScalarValueProps {
  value: unknown;
  typeTag: PointerTypeTag | null;
  // Drops the `module::Enum.` prefix, the `<tag>` type prefix, and the quotes
  // around strings — used by the Data Explorer grid, where the column header
  // already names the type, so repeating it per cell would just be noise.
  // JsonTree keeps the full, unabbreviated form.
  compact?: boolean;
  // Only needed to resolve a namedTuple member's own type tag recursively
  // (e.g. an enum or nested-tuple member) — omit it and a tuple still
  // renders correctly, just without those members' own tags/hydration.
  schema?: SchemaResponse;
  // True when this value's *original* JSON text had a decimal point/exponent
  // (see floatMarkers.ts) — a whole-number float/decimal (e.g. 1.0) is
  // otherwise indistinguishable from a plain int once JSON.parse collapses
  // both to the same JS number, so `value` alone can't tell them apart.
  forceFloat?: boolean;
}

// Renders one scalar value with schema-derived type tags (`<uuid>`,
// `module::Enum.Member`) — shared by JsonTree (REPL/Query Editor results) and
// the Data Explorer grid, so every surface renders values identically.
export const ScalarValue: React.FC<ScalarValueProps> = ({value, typeTag, compact, schema, forceFloat}) => {
  if (value === null || value === undefined) {
    return <span className="text-fg-muted">{"{}"}</span>;
  }

  if (typeTag?.kind === "namedTuple") {
    // PyQL's own tuple literal syntax: `(x := 1, y := 2)` for named members,
    // `(1, 2)` for positional ones — never JSON braces/brackets.
    const members = typeTag.members;
    const positional = members.every((m) => m.name === null);
    const memberValue = (m: (typeof members)[number], index: number): unknown =>
      positional
        ? Array.isArray(value)
          ? value[index]
          : undefined
        : (value as Record<string, unknown> | null | undefined)?.[m.name!];
    return (
      <span>
        (
        {members.map((m, i) => (
          <span key={m.name ?? i}>
            {i > 0 && ", "}
            {m.name !== null && <span className="text-(--syntax-name)">{m.name} := </span>}
            <ScalarValue
              value={memberValue(m, i)}
              typeTag={schema ? memberTypeTag(m, schema) : null}
              // Never propagate the outer `compact` down into a member's own
              // value — compact means "this value's type is obvious from
              // context" (a grid column header, a cast just before it), which
              // is true for the tuple/array as a whole but not for any one
              // member buried inside it. Stripping a member's quotes there
              // would make a string member indistinguishable from a bare
              // identifier or number.
              schema={schema}
            />
          </span>
        ))}
        )
      </span>
    );
  }

  if (typeTag?.kind === "decimal" && (typeof value === "number" || typeof value === "string")) {
    // Always at least one fractional digit (a bare "1399" reads as an int)
    // and a trailing "n" marking it decimal, not float — schema/shape info
    // already tells us this is a decimal for certain, so this doesn't need
    // forceFloat's heuristic the way a plain float does. A pending Data
    // Explorer edit's own value is a string (see extractParams.ts's
    // coerceParamValue) — a fetched result value is still a plain number.
    const text = typeof value === "string" ? (value.includes(".") ? value : `${value}.0`) : Number.isInteger(value) ? `${value}.0` : String(value);
    return (
      <span className="text-(--syntax-number)">
        {text}
        <span className="text-(--syntax-name)">n</span>
      </span>
    );
  }

  if (typeTag?.kind === "enum" && typeof value === "string") {
    return (
      <span>
        {!compact && (
          <span className="text-fg-muted">
            {typeTag.module}::{typeTag.name}.
          </span>
        )}
        <span className="font-semibold text-fg">{value}</span>
      </span>
    );
  }

  const tag =
    typeTag?.kind === "scalar" && !compact ? <span className="text-fg-muted">{`<${typeTag.tag}>`}</span> : null;

  if (typeof value === "string") {
    return (
      <span>
        {tag}
        <span className="text-(--syntax-string)">
          {compact ? value : `'${value}'`}
        </span>
      </span>
    );
  }
  if (typeof value === "number") {
    // A whole-number float/decimal (e.g. 1.0) is otherwise indistinguishable
    // from a plain int once JSON.parse collapses both to the same JS number
    // — force the trailing ".0" back on when we know (via forceFloat) that
    // the original literal had one, matching PyQL's own float display.
    const text = forceFloat && Number.isInteger(value) ? `${value}.0` : String(value);
    return <span className="text-(--syntax-number)">{text}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-(--syntax-number)">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    // Per-element type tag when this array's own element type is known
    // (a schema array<T> property/param) — an enum/namedTuple element still
    // needs its own tag to render correctly (e.g. member names, tuple
    // literal syntax), not just the default JSON-ish fallback.
    const elementTag = typeTag?.kind === "array" && schema ? memberTypeTag(typeTag.element, schema) : null;
    return (
      <span>
        [
        {value.map((item, i) => (
          <span key={i}>
            {i > 0 && ", "}
            {/* Same reasoning as the tuple-member case above: an array
                element has no context of its own to make an unquoted string
                unambiguous, so `compact` never propagates down to it. */}
            <ScalarValue value={item} typeTag={elementTag} schema={schema} />
          </span>
        ))}
        ]
      </span>
    );
  }
  if (typeof value === "object") {
    // NamedTuple/JSON-typed properties (e.g. Person.location: Point) are
    // still "scalar" properties schema-wise, but their JS value is an object —
    // a compact JSON preview beats the default `[object Object]`.
    return <span className="text-fg-muted">{JSON.stringify(value)}</span>;
  }
  return <span>{String(value)}</span>;
};
