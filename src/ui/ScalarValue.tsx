import type React from "react";

import type {FieldTypeTag} from "@/lib/schema/typeTags";

interface ScalarValueProps {
  value: unknown;
  typeTag: FieldTypeTag | null;
  // Drops the `module::Enum.` prefix, the `<tag>` type prefix, and the quotes
  // around strings — used by the Data Explorer grid, where the column header
  // already names the type, so repeating it per cell would just be noise.
  // JsonTree keeps the full, unabbreviated form.
  compact?: boolean;
}

// Renders one scalar value with schema-derived type tags (`<uuid>`,
// `module::Enum.Member`) — shared by JsonTree (REPL/Query Editor results) and
// the Data Explorer grid, so every surface renders values identically.
export const ScalarValue: React.FC<ScalarValueProps> = ({value, typeTag, compact}) => {
  if (value === null || value === undefined) {
    return <span className="text-fg-muted">{"{}"}</span>;
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
    // still "scalar" fields schema-wise, but their JS value is an object —
    // a compact JSON preview beats the default `[object Object]`.
    return <span className="text-fg-muted">{JSON.stringify(value)}</span>;
  }
  return <span>{String(value)}</span>;
};
