import type React from "react";
import clsx from "clsx";

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import type {ExtractedParam} from "@/lib/editor/lang-pyql/extractParams";
import {Select, type SelectOption} from "@/ui/Select";
import {defaultTupleValue, TupleEditor} from "@/ui/dataEditor/TupleEditor";
import {resolveTupleParamMembers} from "@/features/queryEditor/tupleParamCast";

interface ParamsPanelProps {
  params: ExtractedParam[];
  values: Record<string, string>;
  // name -> error message, or null when the current value is valid/empty.
  errors: Record<string, string | null>;
  schema: SchemaResponse | undefined;
  onChange: (name: string, raw: string) => void;
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
// editor's params panel is itself always-visible, matching gel-ui's own
// param panel, so a tuple param renders its TupleEditor inline rather than
// behind a click-to-open popover like the Data Explorer's grid cells.
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

// One labeled input per $name parameter detected in the query text, styled
// after Gel's own param inputs — a floating cast-type tag in the input's top
// right corner, which turns red (along with the input's border) once the
// value is invalid, or the field is required and still empty. Enum-cast
// params get a Select of the enum's members instead of free text, matching
// Gel — clearable when the param is optional, so it can be reset to unset.
// Only rendered when the query actually has parameters.
export const ParamsPanel: React.FC<ParamsPanelProps> = ({params, values, errors, schema, onChange}) => {
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
          // A tuple param always renders with a fully-populated default
          // draft (see TupleParamEditor) — it's never "missing", unlike a
          // blank scalar input.
          const isMissingRequired = !tupleMembers && param.required && raw.trim() === "";
          const invalid = !!error || isMissingRequired;
          const paramEnum = findEnum(schema, param.castType);

          return (
            <div key={param.name} className="flex items-start gap-2">
              <span className="w-20 shrink-0 pt-2.5 font-mono text-2xs text-fg-muted">${param.name}</span>
              <div className="min-w-0 flex-1">
                {tupleMembers && schema ? (
                  <TupleParamEditor name={param.name} members={tupleMembers} raw={raw} schema={schema} onChange={onChange} />
                ) : paramEnum ? (
                  <Select
                    options={paramEnum.members.map((m): SelectOption => ({value: m, label: m}))}
                    value={raw ? {value: raw, label: raw} : null}
                    onChange={(opt) => onChange(param.name, opt?.value ?? "")}
                    isClearable={!param.required}
                    isDisabled={!!param.castConflict}
                    placeholder={param.required ? "required" : "optional"}
                    className={invalid ? "[&>div]:border-[var(--syntax-operator)]" : undefined}
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={raw}
                      onChange={(e) => onChange(param.name, e.target.value)}
                      disabled={!!param.castConflict}
                      placeholder={param.required ? "required" : "optional"}
                      className={clsx(
                        "h-10 w-full rounded-md border bg-surface pr-14 pl-2.5 font-mono text-sm text-fg outline-none disabled:opacity-50",
                        invalid ? "border-[var(--syntax-operator)]" : "border-border focus:border-accent"
                      )}
                    />
                    {param.castType && (
                      <span
                        className={clsx(
                          "absolute top-1 right-1 rounded px-1.5 py-0.5 text-2xs font-medium",
                          invalid ? "bg-[var(--syntax-operator)] text-white" : "bg-surface-active text-fg-muted"
                        )}
                      >
                        {param.castType}
                      </span>
                    )}
                  </div>
                )}
                {error && <div className="mt-1 text-2xs text-[var(--syntax-operator)]">{error}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
