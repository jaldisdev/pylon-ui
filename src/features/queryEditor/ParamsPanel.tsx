import type React from "react";

import type {ExtractedParam} from "@/lib/editor/lang-pyql/extractParams";

interface ParamsPanelProps {
  params: ExtractedParam[];
  values: Record<string, string>;
  onChange: (name: string, raw: string) => void;
}

// One labeled text input per $name parameter detected in the query text.
// Only rendered when the query actually has parameters.
export const ParamsPanel: React.FC<ParamsPanelProps> = ({params, values, onChange}) => {
  if (params.length === 0) return null;

  // Output
  return (
    <div className="max-h-40 shrink-0 overflow-auto border-t border-border p-2">
      <div className="mb-1.5 text-xs font-medium text-fg-muted">Query Parameters</div>
      <div className="flex flex-col gap-1.5">
        {params.map((param) => (
          <label key={param.name} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 font-mono text-fg-muted">
              ${param.name}
              {param.castType && <span className="text-fg-muted/70"> ({param.castType})</span>}
            </span>
            <input
              type="text"
              value={values[param.name] ?? ""}
              onChange={(e) => onChange(param.name, e.target.value)}
              className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-1 font-mono text-fg outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
    </div>
  );
};
