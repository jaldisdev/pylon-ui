import type React from "react";
import {useState} from "react";
import clsx from "clsx";
import {Check, ChevronRight, Copy} from "lucide-react";

import type {SchemaResponse, ValueShapeTag} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {lookupPointerTypeTag, valueShapeChild, valueShapeToPointerTypeTag} from "@/lib/schema/typeTags";
import {ScalarValue} from "@/ui/ScalarValue";

interface JsonTreeProps {
  value: unknown;
  className?: string;
  // The compiled query's own value-shape tag tree (see client.ts), sent
  // alongside /api/query's response — resolves type tags for values that
  // aren't a known schema pointer (a bare top-level cast, a free object's
  // tuple field, ...), which the pointer-name-based lookup below can't
  // reach on its own. Omit it for a context with no compiled-query shape at
  // all (e.g. history replays of an older entry) — falls back to the
  // pointer-name guess everywhere.
  valueShape?: ValueShapeTag;
}

// Recursively strips __pylon_type__ before copying, so "Copy JSON" produces
// clean data rather than our internal polymorphic-type marker.
const stripInternal = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripInternal);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== "__pylon_type__")
        .map(([k, v]) => [k, stripInternal(v)])
    );
  }
  return value;
};

// Collapsible tree view for query results, modeled on Gel's inspector:
// toggleable object/array nodes, a "Copy JSON" button on row hover, and
// `<uuid>`/`<std::datetime>`/`module::Enum.Member` tags resolved from real
// schema data (see src/lib/schema/typeTags.ts) rather than guessed from the
// value's shape.
export const JsonTree: React.FC<JsonTreeProps> = ({value, className, valueShape}) => {
  const {data: schema} = useSchema();

  // Output
  return (
    <div className={clsx("font-mono text-sm", className)}>
      <JsonNode value={value} schema={schema} valueShape={valueShape} />
    </div>
  );
};

const CopyButton: React.FC<{value: unknown}> = ({value}) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(stripInternal(value), null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }}
      className="hidden shrink-0 items-center gap-1 rounded px-1 text-2xs tracking-wide text-fg-muted uppercase hover:text-fg group-hover/row:flex"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
};

interface JsonNodeProps {
  label?: string;
  value: unknown;
  schema: SchemaResponse | undefined;
  parentPylonType?: string;
  valueShape?: ValueShapeTag;
}

const JsonNode: React.FC<JsonNodeProps> = ({label, value, schema, parentPylonType, valueShape}) => {
  const [open, setOpen] = useState(true);

  // A tuple/named-tuple value is JS-object-shaped (a dict or array) but
  // renders as a single Gel-style literal `(x := 1, y := 2)`, not as an
  // expandable tree node — this check must come before the generic
  // object/array branch below, which would otherwise treat it as one.
  if (valueShape?.kind === "namedTuple") {
    return (
      <div className="group/row flex items-center rounded pl-4 hover:bg-surface-hover">
        <div className="flex-1">
          {label !== undefined && <span className="text-[var(--syntax-name)]">{label}: </span>}
          <ScalarValue value={value} typeTag={valueShapeToPointerTypeTag(valueShape)} schema={schema} />
        </div>
        <CopyButton value={value} />
      </div>
    );
  }

  if (value !== null && typeof value === "object") {
    const isArray = Array.isArray(value);
    const pylonType = !isArray ? (value as {__pylon_type__?: string}).__pylon_type__ : undefined;
    const entries = isArray
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>).filter(([k]) => k !== "__pylon_type__");

    // Output
    return (
      <div>
        <div className="group/row flex items-center rounded hover:bg-surface-hover">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-1 text-left">
            <ChevronRight
              size={12}
              className={clsx("shrink-0 text-fg-muted transition-transform", open && "rotate-90")}
            />
            {label !== undefined && <span className="text-[var(--syntax-name)]">{label}: </span>}
            {pylonType && <span className="text-fg-muted">{pylonType} </span>}
            <span className="text-fg-muted">
              {isArray ? "[" : "{"}
              {!open && ` ${entries.length} ${isArray ? "item" : "key"}${entries.length === 1 ? "" : "s"} `}
              {!open && (isArray ? "]" : "}")}
            </span>
          </button>
          <CopyButton value={value} />
        </div>
        {open && (
          <div className="pl-4">
            {entries.map(([k, v]) => (
              <JsonNode
                key={k}
                label={isArray ? undefined : k}
                value={v}
                schema={schema}
                parentPylonType={pylonType ?? parentPylonType}
                valueShape={valueShapeChild(valueShape, isArray ? "0" : k)}
              />
            ))}
            <span className="text-fg-muted">{isArray ? "]" : "}"}</span>
          </div>
        )}
      </div>
    );
  }

  const typeTag = valueShape
    ? valueShapeToPointerTypeTag(valueShape)
    : label !== undefined
      ? lookupPointerTypeTag(schema, parentPylonType, label)
      : null;

  // Output
  return (
    <div className="group/row flex items-center rounded pl-4 hover:bg-surface-hover">
      <div className="flex-1">
        {label !== undefined && <span className="text-[var(--syntax-name)]">{label}: </span>}
        <ScalarValue value={value} typeTag={typeTag} schema={schema} />
      </div>
      <CopyButton value={value} />
    </div>
  );
};
