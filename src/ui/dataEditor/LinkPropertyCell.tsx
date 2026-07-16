import type React from "react";

import type {SchemaPointer, SchemaResponse} from "@/lib/api/client";
import {validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import type {EditValue} from "@/features/dataExplorer/state/editsStore";
import {ScalarMemberInput} from "@/ui/dataEditor/ScalarMemberInput";

// A junction (through-type) property's inline input in link-edit mode — one
// per checked row, next to its checkbox. Unlike DataEditorCell (opened on
// double-click, commits once on blur/Enter/Escape then unmounts), this stays
// permanently mounted for the row's lifetime as a checked link target, so it
// just reports every change immediately — there's no separate open/commit
// step since the whole row is already "in edit mode" by virtue of being
// checked. Delegates to the same ScalarMemberInput widget DataEditorCell's
// own scalar/bool/enum editors use (dense mode), so a link-property cell
// looks identical to a regular editable cell instead of a smaller, bordered,
// visually distinct input.
interface LinkPropertyCellProps {
  pointer: SchemaPointer;
  schema: SchemaResponse;
  value: EditValue | undefined;
  disabled: boolean;
  onChange: (value: EditValue) => void;
}

export const LinkPropertyCell: React.FC<LinkPropertyCellProps> = ({pointer, schema, value, disabled, onChange}) => {
  if (disabled) return <span className="text-fg-muted">—</span>;

  const enumOptions =
    pointer.kind === "enum"
      ? (() => {
          const [module, name] = (pointer.target ?? "").split("::");
          return schema.enums.find((e) => e.module === module && e.name === name)?.members ?? [];
        })()
      : null;

  const castType = pointer.typeName ?? null;
  const currentValue = value === undefined ? null : value.valid ? value.value : value.raw;

  return (
    <ScalarMemberInput
      dense
      value={currentValue}
      castType={castType}
      enumOptions={enumOptions}
      error={value && !value.valid ? value.error : null}
      onChange={(raw, coerced, valid) =>
        onChange(valid ? {valid: true, value: coerced} : {valid: false, raw, error: validateCastValue(raw, castType) ?? ""})
      }
    />
  );
};
