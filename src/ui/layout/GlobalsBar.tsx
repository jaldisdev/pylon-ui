import type React from "react";
import {X} from "lucide-react";

import {useGlobalsSchema} from "@/lib/api/useGlobalsSchema";
import {useGlobalsStore} from "@/lib/state/globalsStore";

const formatValue = (value: unknown) => (typeof value === "string" ? `'${value}'` : JSON.stringify(value));

// Pill bar showing currently-configured session globals — absent entirely
// when none are set (no "no globals" placeholder), appearing once the
// globals modal (gear icon in TopBar) has at least one value saved. Each
// pill has a hover-revealed reset button so clearing one global doesn't
// require reopening the modal, plus a per-global activation toggle — a
// disabled global stays visible/stored but dims and is excluded from the
// next query's `globals` body (see client.ts's runQuery).
export const GlobalsBar: React.FC = () => {
  const {data} = useGlobalsSchema();
  const entries = useGlobalsStore((s) => s.entries);
  const setEntry = useGlobalsStore((s) => s.setEntry);
  const removeEntry = useGlobalsStore((s) => s.removeEntry);
  const entryList = Object.entries(entries);

  if (entryList.length === 0) return null;

  // Output
  return (
    <div className="mb-2 flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto px-3 text-xs">
      {entryList.map(([qualifiedName, entry]) => {
        const info = data?.globals.find((g) => `${g.module}::${g.name}` === qualifiedName);
        return (
          <span
            key={qualifiedName}
            className={`group flex items-center rounded-md bg-surface-hover px-1.5 py-1 font-mono whitespace-nowrap ${entry.enabled ? "" : "opacity-50"}`}
          >
            <button
              type="button"
              onClick={() => setEntry(qualifiedName, {...entry, enabled: !entry.enabled})}
              title={entry.enabled ? "Active — click to disable" : "Inactive — click to enable"}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-accent/20 text-[9px] font-bold text-accent"
            >
              G
            </button>
            <span className="ml-1.5 flex items-center gap-1.5">
              <span className="text-fg-muted">{info?.name ?? qualifiedName}</span>
              <span className="text-fg-muted">:=</span>
              <span className="max-w-40 truncate text-fg">{formatValue(entry.value)}</span>
            </span>
            {/* Collapsed to zero width/margin until hover, so the pill doesn't
                permanently reserve space for a button that's usually hidden. */}
            <button
              type="button"
              onClick={() => removeEntry(qualifiedName)}
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
