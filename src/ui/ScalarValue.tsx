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
            {m.name !== null && <span className="text-[var(--syntax-name)]">{m.name} := </span>}
            <ScalarValue
              value={memberValue(m, i)}
              typeTag={schema ? memberTypeTag(m, schema) : null}
              compact={compact}
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
        <span className="text-[var(--syntax-string)]">
          {compact ? value : `'${value}'`}
        </span>
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="text-[var(--syntax-number)]">{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-[var(--syntax-number)]">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span>
        [
        {value.map((item, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <ScalarValue value={item} typeTag={null} compact={compact} />
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
