import type React from "react";
import clsx from "clsx";

import type {SchemaPointer, SchemaResponse} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import type {EditValue} from "@/features/dataExplorer/state/editsStore";
import {Select, type SelectOption} from "@/ui/Select";

// A junction (through-type) property's inline input in link-edit mode — one
// per checked row, next to its checkbox. Unlike DataEditorCell (opened on
// double-click, commits once on blur/Enter/Escape then unmounts), this stays
// permanently mounted for the row's lifetime as a checked link target, so it
// just reports every change immediately — there's no separate open/commit
// step since the whole row is already "in edit mode" by virtue of being
// checked. No precedent in gel-ui to mirror here (Gel's studio never
// supported editing link properties at all — see the plan).
interface LinkPropertyCellProps {
  pointer: SchemaPointer;
  schema: SchemaResponse;
  value: EditValue | undefined;
  disabled: boolean;
  onChange: (value: EditValue) => void;
}

const valueToRawText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const toEditValue = (raw: string, castType: string | null): EditValue => {
  const error = validateCastValue(raw, castType);
  return error ? {valid: false, raw, error} : {valid: true, value: coerceParamValue(raw, castType)};
};

export const LinkPropertyCell: React.FC<LinkPropertyCellProps> = ({pointer, schema, value, disabled, onChange}) => {
  if (disabled) return <span className="text-fg-muted">—</span>;

  if (pointer.kind === "enum") {
    const [module, name] = (pointer.target ?? "").split("::");
    const members = schema.enums.find((e) => e.module === module && e.name === name)?.members ?? [];
    const options: SelectOption[] = members.map((m) => ({value: m, label: m}));
    const current = value?.valid && typeof value.value === "string" ? (options.find((o) => o.value === value.value) ?? null) : null;
    return (
      <Select
        options={options}
        value={current}
        onChange={(opt) => onChange({valid: true, value: opt?.value ?? null})}
        placeholder=""
      />
    );
  }

  if (pointer.typeName === "std::bool") {
    const current = value?.valid ? value.value : null;
    return (
      <div className="flex gap-1">
        {(["true", "false"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({valid: true, value: v === "true"})}
            className={clsx(
              "rounded px-1.5 py-0.5 text-2xs",
              current === (v === "true") ? "bg-accent text-accent-fg" : "bg-surface-hover text-fg-muted hover:text-fg"
            )}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }

  const castType = pointer.typeName ?? null;
  const raw = value ? (value.valid ? valueToRawText(value.value) : value.raw) : "";
  const isInvalid = value !== undefined && !value.valid;

  return (
    <input
      type="text"
      value={raw}
      placeholder={pointer.name}
      onChange={(e) => onChange(toEditValue(e.target.value, castType))}
      className={clsx(
        "w-full rounded border bg-surface px-1.5 py-0.5 font-mono text-2xs",
        isInvalid ? "border-red-500" : "border-border focus:border-accent"
      )}
    />
  );
};
