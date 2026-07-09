import type React from "react";
import {useState} from "react";
import clsx from "clsx";
import {Check, ChevronRight, Copy} from "lucide-react";

import type {SchemaResponse} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {lookupFieldTypeTag, type FieldTypeTag} from "@/lib/schema/typeTags";

interface JsonTreeProps {
  value: unknown;
  className?: string;
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
export const JsonTree: React.FC<JsonTreeProps> = ({value, className}) => {
  const {data: schema} = useSchema();

  // Output
  return (
    <div className={clsx("font-mono text-sm", className)}>
      <JsonNode value={value} schema={schema} />
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
      className="hidden shrink-0 items-center gap-1 rounded px-1 text-[10px] tracking-wide text-fg-muted uppercase hover:text-fg group-hover/row:flex"
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
}

const JsonNode: React.FC<JsonNodeProps> = ({label, value, schema, parentPylonType}) => {
  const [open, setOpen] = useState(true);

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
              />
            ))}
            <span className="text-fg-muted">{isArray ? "]" : "}"}</span>
          </div>
        )}
      </div>
    );
  }

  const typeTag = label !== undefined ? lookupFieldTypeTag(schema, parentPylonType, label) : null;

  // Output
  return (
    <div className="group/row flex items-center rounded pl-4 hover:bg-surface-hover">
      <div className="flex-1">
        {label !== undefined && <span className="text-[var(--syntax-name)]">{label}: </span>}
        <ScalarValue value={value} typeTag={typeTag} />
      </div>
      <CopyButton value={value} />
    </div>
  );
};

const ScalarValue: React.FC<{value: unknown; typeTag: FieldTypeTag | null}> = ({value, typeTag}) => {
  if (value === null || value === undefined) {
    return <span className="text-fg-muted">{"{}"}</span>;
  }

  if (typeTag?.kind === "enum" && typeof value === "string") {
    return (
      <span>
        <span className="text-fg-muted">
          {typeTag.module}::{typeTag.name}.
        </span>
        <span className="font-semibold text-fg">{value}</span>
      </span>
    );
  }

  const tag = typeTag?.kind === "scalar" ? <span className="text-fg-muted">{`<${typeTag.tag}>`}</span> : null;

  if (typeof value === "string") {
    return (
      <span>
        {tag}
        <span className="text-[var(--syntax-string)]">'{value}'</span>
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="text-[var(--syntax-number)]">{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-[var(--syntax-number)]">{String(value)}</span>;
  }
  return <span>{String(value)}</span>;
};
