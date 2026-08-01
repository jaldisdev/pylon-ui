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

  // Empty here means "never touched this session" (value undefined) or
  // "touched but cleared back to nothing" — either way, a required property
  // with no default needs a value before commit can succeed (matches
  // generateStatements.ts's own missing-required-link-property check), so
  // this needs its own flagging: ScalarMemberInput's internal validation
  // only catches a malformed *typed* value, not "required and still blank".
  const isEmpty = value === undefined || (value.valid && (value.value === null || value.value === undefined || value.value === ""));
  const requiredEmptyError = pointer.required && !pointer.hasDefault && isEmpty ? "Required" : null;

  return (
    <ScalarMemberInput
      dense
      value={currentValue}
      castType={castType}
      enumOptions={enumOptions}
      error={value && !value.valid ? value.error : requiredEmptyError}
      onChange={(raw, coerced, valid) =>
        onChange(valid ? {valid: true, value: coerced} : {valid: false, raw, error: validateCastValue(raw, castType) ?? ""})
      }
    />
  );
};
