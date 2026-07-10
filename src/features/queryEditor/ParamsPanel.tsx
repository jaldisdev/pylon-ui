import type React from "react";
import clsx from "clsx";

import type {ExtractedParam} from "@/lib/editor/lang-pyql/extractParams";

interface ParamsPanelProps {
  params: ExtractedParam[];
  values: Record<string, string>;
  // name -> error message, or null when the current value is valid/empty.
  errors: Record<string, string | null>;
  onChange: (name: string, raw: string) => void;
}

// One labeled input per $name parameter detected in the query text, styled
// after Gel's own param inputs — a floating cast-type tag in the input's top
// right corner, which turns red (along with the input's border) once the
// value is invalid, or the field is required and still empty. Only rendered
// when the query actually has parameters.
export const ParamsPanel: React.FC<ParamsPanelProps> = ({params, values, errors, onChange}) => {
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
          const isMissingRequired = param.required && raw.trim() === "";
          const invalid = !!error || isMissingRequired;
          return (
            <div key={param.name} className="flex items-start gap-2">
              <span className="w-20 shrink-0 pt-2.5 font-mono text-2xs text-fg-muted">${param.name}</span>
              <div className="min-w-0 flex-1">
                <div className="relative">
                  <input
                    type="text"
                    value={raw}
                    onChange={(e) => onChange(param.name, e.target.value)}
                    disabled={!!param.castConflict}
                    placeholder={param.required ? "required" : "optional"}
                    className={clsx(
                      "h-9 w-full rounded-md border bg-surface pr-14 pl-2.5 font-mono text-sm text-fg outline-none disabled:opacity-50",
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
                {error && <div className="mt-1 text-2xs text-[var(--syntax-operator)]">{error}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
