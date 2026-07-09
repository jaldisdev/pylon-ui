import type React from "react";
import {X} from "lucide-react";

import {useGlobalsSchema} from "@/lib/api/useGlobalsSchema";
import {useGlobalsStore} from "@/lib/state/globalsStore";

const formatValue = (value: unknown) => (typeof value === "string" ? `'${value}'` : JSON.stringify(value));

// Pill bar showing currently-configured session globals — absent entirely
// when none are set (no "no globals" placeholder), appearing once the
// globals modal (gear icon in TopBar) has at least one value saved. Each
// pill has a hover-revealed reset button so clearing one global doesn't
// require reopening the modal.
export const GlobalsBar: React.FC = () => {
  const {data} = useGlobalsSchema();
  const values = useGlobalsStore((s) => s.values);
  const setValues = useGlobalsStore((s) => s.setValues);
  const entries = Object.entries(values);

  if (entries.length === 0) return null;

  const reset = (qualifiedName: string) => {
    const {[qualifiedName]: _removed, ...rest} = values;
    setValues(rest);
  };

  // Output
  return (
    <div className="mb-2 flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto px-3 text-xs">
      {entries.map(([qualifiedName, value]) => {
        const info = data?.globals.find((g) => `${g.module}::${g.name}` === qualifiedName);
        return (
          <span
            key={qualifiedName}
            className="group flex items-center rounded-md bg-surface-hover px-1.5 py-1 font-mono whitespace-nowrap"
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-accent/20 text-[9px] font-bold text-accent">
                G
              </span>
              <span className="text-fg-muted">{info?.name ?? qualifiedName}</span>
              <span className="text-fg-muted">:=</span>
              <span className="max-w-40 truncate text-fg">{formatValue(value)}</span>
            </span>
            {/* Collapsed to zero width/margin until hover, so the pill doesn't
                permanently reserve space for a button that's usually hidden. */}
            <button
              type="button"
              onClick={() => reset(qualifiedName)}
              className="ml-0 flex w-0 items-center justify-center overflow-hidden text-fg-muted transition-all duration-300 hover:text-fg group-hover:ml-1.5 group-hover:w-3.5"
            >
              <X size={10} strokeWidth={2} className="shrink-0" />
            </button>
          </span>
        );
      })}
    </div>
  );
};
