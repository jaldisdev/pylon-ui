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
}

// Renders one scalar value with schema-derived type tags (`<uuid>`,
// `module::Enum.Member`) — shared by JsonTree (REPL/Query Editor results) and
// the Data Explorer grid, so every surface renders values identically.
export const ScalarValue: React.FC<ScalarValueProps> = ({value, typeTag, compact, schema}) => {
  if (value === null || value === undefined) {
    return <span className="text-fg-muted">{"{}"}</span>;
  }

  if (typeTag?.kind === "namedTuple") {
    // Gel's own tuple literal syntax: `(x := 1, y := 2)` for named members,
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
    return <span className="text-(--syntax-number)">{value}</span>;
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
