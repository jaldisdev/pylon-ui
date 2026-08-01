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

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import type {ExtractedParam} from "@/lib/editor/lang-pyql/extractParams";
import {defaultTupleValue, TupleEditor} from "@/ui/dataEditor/TupleEditor";
import {ArrayEditor} from "@/ui/dataEditor/ArrayEditor";
import {ScalarMemberInput} from "@/ui/dataEditor/ScalarMemberInput";
import {resolveArrayParamElement, resolveTupleParamMembers} from "@/lib/schema/tupleTypeCast";

interface ParamsPanelProps {
  params: ExtractedParam[];
  values: Record<string, string>;
  // name -> error message, or null when the current value is valid/empty.
  errors: Record<string, string | null>;
  schema: SchemaResponse | undefined;
  onChange: (name: string, raw: string) => void;
  // Bumped whenever `values` is replaced wholesale from outside a keystroke
  // (loading a history entry) — folded into each field's key below so it
  // remounts and re-seeds from the new `values`, since ScalarMemberInput only
  // reads its `value` prop once, on mount.
  resetKey?: number;
}

// A cast's typeName is "module::Name" (or just "Name" for the default
// module — see extractParams.ts); enums are looked up the same way schema
// fields resolve their enum tags elsewhere in the app.
const findEnum = (schema: SchemaResponse | undefined, castType: string | null) => {
  if (!schema || !castType) return null;
  const [module, name] = castType.includes("::") ? castType.split("::") : ["default", castType];
  return schema.enums.find((e) => e.module === module && e.name === name) ?? null;
};

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// Embedded (no popover, always visible) tuple param editor — the query
// editor's params panel is itself always-visible, so a tuple param renders
// its TupleEditor inline rather than behind a click-to-open popover like
// the Data Explorer's grid cells.
const TupleParamEditor: React.FC<{
  name: string;
  members: NamedTupleMember[];
  raw: string;
  schema: SchemaResponse;
  onChange: (name: string, raw: string) => void;
}> = ({name, members, raw, schema, onChange}) => {
  const parsed = raw ? safeParseJson(raw) : undefined;
  const value = parsed ?? defaultTupleValue(members, schema);
  return (
    <TupleEditor members={members} schema={schema} value={value} onChange={(next) => onChange(name, JSON.stringify(next))} />
  );
};

// Same embedded-inline pattern as TupleParamEditor, for an array<T> param —
// an empty array is a perfectly valid default draft (unlike a tuple, which
// needs every member populated), so there's no defaultArrayValue equivalent.
const ArrayParamEditor: React.FC<{
  name: string;
  element: NamedTupleMember;
  raw: string;
  schema: SchemaResponse;
  onChange: (name: string, raw: string) => void;
}> = ({name, element, raw, schema, onChange}) => {
  const parsed = raw ? safeParseJson(raw) : undefined;
  const value = Array.isArray(parsed) ? parsed : [];
  return (
    <ArrayEditor element={element} schema={schema} value={value} onChange={(next) => onChange(name, JSON.stringify(next))} />
  );
};

// One labeled input per $name parameter detected in the query text — a
// floating cast-type tag in the input's top right corner, which turns red
// (along with the input's border) once the value is invalid, or the field
// is required and still empty. Enum-cast params get a Select of the enum's
// members instead of free text — clearable when the param is optional, so
// it can be reset to unset. Only rendered when the query actually has
// parameters.
export const ParamsPanel: React.FC<ParamsPanelProps> = ({params, values, errors, schema, onChange, resetKey = 0}) => {
  if (params.length === 0) return null;

  // Output
  return (
    <div className="max-h-48 shrink-0 overflow-auto border-t border-border p-2">
      <div className="mb-1.5 text-xs font-medium text-fg-muted">Query Parameters</div>
      <div className="flex flex-col gap-2">
        {params.map((param) => {
          const raw = values[param.name] ?? "";
          // A cast conflict (same $name used with two different casts
          // elsewhere in the query) is a structural query problem, not a
          // bad value — shown regardless of what's typed, and takes
          // precedence over the value's own validation error.
          const error = param.castConflict ?? errors[param.name];
          const tupleMembers = resolveTupleParamMembers(param.castType, schema);
          const arrayElement = resolveArrayParamElement(param.castType, schema);
          // A tuple/array param always renders with a valid default draft
          // (a fully-populated tuple, or an empty array — see
          // TupleParamEditor/ArrayParamEditor) — never "missing", unlike a
          // blank scalar input.
          const isMissingRequired = !tupleMembers && !arrayElement && param.required && raw.trim() === "";
          const invalid = !!error || isMissingRequired;
          const paramEnum = findEnum(schema, param.castType);

          return (
            <div key={param.name} className="flex items-start gap-2">
              <span className="w-20 shrink-0 pt-2.5 font-mono text-2xs text-fg-muted">${param.name}</span>
              <div className="min-w-0 flex-1">
                {tupleMembers && schema ? (
                  <TupleParamEditor key={resetKey} name={param.name} members={tupleMembers} raw={raw} schema={schema} onChange={onChange} />
                ) : arrayElement && schema ? (
                  <ArrayParamEditor key={resetKey} name={param.name} element={arrayElement} raw={raw} schema={schema} onChange={onChange} />
                ) : (
                  <ScalarMemberInput
                    key={resetKey}
                    value={raw}
                    castType={param.castType}
                    enumOptions={paramEnum?.members ?? null}
                    isClearable={!param.required}
                    disabled={!!param.castConflict}
                    placeholder={param.required ? "required" : "optional"}
                    error={invalid ? (error ?? "") : null}
                    onChange={(nextRaw) => onChange(param.name, nextRaw)}
                  />
                )}
                {error && <div className="mt-1 text-2xs text-(--syntax-operator)">{error}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
