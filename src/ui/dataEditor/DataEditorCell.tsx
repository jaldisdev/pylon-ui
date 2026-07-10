import type React from "react";
import {useEffect, useRef, useState} from "react";
import clsx from "clsx";
import {X} from "lucide-react";

import type {SchemaPointer, SchemaResponse} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import type {EditValue} from "@/features/dataExplorer/state/editsStore";
import {Select, type SelectOption} from "@/ui/Select";

// Inline per-scalar-type cell editor, mounted in place of a grid cell on
// double-click — mirrors gel-ui's dataEditor component library
// (shared/studio/components/dataEditor/*): bool -> two pill buttons, enum ->
// dropdown, str/json -> auto-growing textarea, everything else -> a plain
// validated text input. No date-picker anywhere, matching gel-ui exactly —
// dates/times are free-text validated against the same regexes the Query
// Editor's params already use.
//
// Pylon properties are single-valued only (no EdgeQL-style multi-cardinality
// scalar properties — confirmed empirically, see the plan) so there's no
// array-editor widget here; multi-valued data only exists via multi-links,
// which are edited through the grid's link-edit mode, not inline.
interface DataEditorCellProps {
  pointer: SchemaPointer;
  schema: SchemaResponse;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
  onDiscard: () => void;
}

const valueToRawText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

// Reuses the Query Editor's own param validator/coercer (extractParams.ts)
// so scalar validation has one canonical implementation across the app.
const toEditValue = (raw: string, castType: string | null): EditValue => {
  const error = validateCastValue(raw, castType);
  return error ? {valid: false, raw, error} : {valid: true, value: coerceParamValue(raw, castType)};
};

export const DataEditorCell: React.FC<DataEditorCellProps> = ({pointer, schema, initialValue, onCommit, onDiscard}) => (
  <div
    className="flex items-center gap-1"
    onKeyDown={(e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDiscard();
      }
    }}
  >
    <div className="min-w-0 flex-1">
      {pointer.kind === "enum" ? (
        <EnumEditor pointer={pointer} schema={schema} initialValue={initialValue} onCommit={onCommit} />
      ) : pointer.typeName === "std::bool" ? (
        <BoolEditor initialValue={initialValue} onCommit={onCommit} />
      ) : (
        <TextEditor pointer={pointer} initialValue={initialValue} onCommit={onCommit} />
      )}
    </div>
    {/* Optional pointers get an explicit "clear to {}" action, matching
        gel-ui's nullable-input wrapping — the only way to blank an optional
        value rather than typing something. */}
    {!pointer.required && (
      <button
        type="button"
        title="Set to {}"
        onClick={() => onCommit({valid: true, value: null})}
        className="shrink-0 text-fg-muted hover:text-fg"
      >
        <X size={12} strokeWidth={1.75} />
      </button>
    )}
  </div>
);

const EnumEditor: React.FC<{
  pointer: SchemaPointer;
  schema: SchemaResponse;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
}> = ({pointer, schema, initialValue, onCommit}) => {
  // Selecting an option and closing the menu without selecting anything both
  // resolve to a commit (gel-ui: dropdown selection is a discrete, final
  // action) — guarded so react-select's onChange-then-onMenuClose sequence
  // for a single-select doesn't fire onCommit twice.
  const committedRef = useRef(false);
  const [module, name] = (pointer.target ?? "").split("::");
  const members = schema.enums.find((e) => e.module === module && e.name === name)?.members ?? [];
  const options: SelectOption[] = members.map((m) => ({value: m, label: m}));
  const initial = typeof initialValue === "string" ? (options.find((o) => o.value === initialValue) ?? null) : null;

  const commitOnce = (value: string | null) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit({valid: true, value});
  };

  return (
    <Select
      autoFocus
      menuIsOpen
      options={options}
      value={initial}
      onChange={(opt) => commitOnce(opt?.value ?? null)}
      onMenuClose={() => commitOnce(initial?.value ?? null)}
    />
  );
};

const BoolEditor: React.FC<{initialValue: unknown; onCommit: (value: EditValue) => void}> = ({initialValue, onCommit}) => {
  const current = initialValue === true ? "true" : initialValue === false ? "false" : null;
  return (
    <div className="flex gap-1">
      {(["true", "false"] as const).map((v) => (
        <button
          key={v}
          type="button"
          autoFocus={v === "true"}
          onClick={() => onCommit({valid: true, value: v === "true"})}
          className={clsx(
            "rounded px-2 py-1 text-2sm",
            current === v ? "bg-accent text-accent-fg" : "bg-surface-hover text-fg-muted hover:text-fg"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
};

const TextEditor: React.FC<{pointer: SchemaPointer; initialValue: unknown; onCommit: (value: EditValue) => void}> = ({
  pointer,
  initialValue,
  onCommit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState(() => valueToRawText(initialValue));
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const committedRef = useRef(false);

  const castType = pointer.typeName ?? null;
  const error = validateCastValue(raw, castType);
  const isMultiline = castType === "std::str" || castType === "std::json";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(e.target as Node) || committedRef.current) return;
      committedRef.current = true;
      onCommit(toEditValue(rawRef.current, castType));
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [castType, onCommit]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(toEditValue(raw, castType));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation();
      commit();
    }
  };

  const inputClassName = clsx(
    "w-full rounded border bg-surface px-1.5 py-1 font-mono text-2sm",
    error ? "border-red-500" : "border-border focus:border-accent"
  );

  return (
    <div ref={containerRef}>
      {isMultiline ? (
        <textarea
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(6, Math.max(1, raw.split("\n").length))}
          className={clsx(inputClassName, "resize-none")}
        />
      ) : (
        <input autoFocus type="text" value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={onKeyDown} className={inputClassName} />
      )}
    </div>
  );
};
