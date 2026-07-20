import type React from "react";
import {useEffect, useMemo, useRef, useState} from "react";
import clsx from "clsx";
import {ChevronDown} from "lucide-react";

import type {SchemaType} from "@/lib/api/client";
import {fuzzyMatch} from "@/lib/fuzzyMatch";
import {HighlightedText} from "@/ui/HighlightedText";

interface ObjectTypeSelectProps {
  types: SchemaType[];
  selected: SchemaType | null;
  onSelect: (type: SchemaType) => void;
  // Controlled so DataExplorerView's Mod+P hotkey (a type quick-switcher)
  // can open this from outside a click on the button itself.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Root-level object type picker for the Data Explorer — a button showing the
// current type, opening a filterable dropdown list of every type in the schema.
export const ObjectTypeSelect: React.FC<ObjectTypeSelectProps> = ({types, selected, onSelect, open, onOpenChange}) => {
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on any click outside it.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onOpenChange]);

  // Fuzzy-match + rank by quality (contiguous/early matches first) — not
  // just a plain substring filter.
  const filtered = useMemo(() => {
    return types
      .map((type) => ({type, match: fuzzyMatch(search, `${type.module}::${type.name}`)}))
      .filter((entry): entry is {type: SchemaType; match: NonNullable<typeof entry.match>} => entry.match !== null)
      .sort((a, b) => a.match.score - b.match.score);
  }, [types, search]);

  // No active filter: grouped by module (modules and, within each, types
  // both alphabetical) instead of raw schema declaration order — modules
  // sorted first so the grouping itself reads in a predictable order, not
  // just each module's own contents.
  const grouped = useMemo(() => {
    const byModule = new Map<string, SchemaType[]>();
    for (const type of types) {
      const list = byModule.get(type.module) ?? [];
      list.push(type);
      byModule.set(type.module, list);
    }
    return [...byModule.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, list]) => ({module, types: [...list].sort((a, b) => a.name.localeCompare(b.name))}));
  }, [types]);

  const isSelected = (type: SchemaType) => selected?.module === type.module && selected?.name === type.name;

  // Output
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-sm text-fg hover:bg-surface-hover"
      >
        {selected ? (
          <>
            <span className="text-fg-muted">{selected.module}::</span>
            {selected.name}
          </>
        ) : (
          <span className="text-fg-muted">Select type…</span>
        )}
        <ChevronDown size={14} strokeWidth={1.75} className="text-fg-muted" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-80 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-(--shadow-card)">
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter types…"
            className="w-full border-b border-border px-2 py-1.5 text-sm outline-none"
          />
          <div className="max-h-64 overflow-auto">
            {search
              ? filtered.map(({type, match}) => {
                  const qualname = `${type.module}::${type.name}`;
                  return (
                    <button
                      key={qualname}
                      type="button"
                      onClick={() => {
                        onSelect(type);
                        onOpenChange(false);
                        setSearch("");
                      }}
                      className={clsx(
                        "block w-full px-2 py-1.5 text-left font-mono text-sm",
                        isSelected(type) ? "bg-accent/10 text-accent" : "hover:bg-surface-active"
                      )}
                    >
                      <HighlightedText text={qualname} indices={match.indices} />
                    </button>
                  );
                })
              : grouped.map(({module, types: moduleTypes}) => (
                  <div key={module}>
                    <div className="px-2 py-1 font-mono text-2xs font-semibold tracking-wide text-fg-muted">
                      {module}::
                    </div>
                    {moduleTypes.map((type) => (
                      <button
                        key={`${type.module}::${type.name}`}
                        type="button"
                        onClick={() => {
                          onSelect(type);
                          onOpenChange(false);
                          setSearch("");
                        }}
                        className={clsx(
                          "block w-full pr-2 py-1.5 pl-5 text-left font-mono text-sm",
                          isSelected(type) ? "bg-accent/10 text-accent" : "hover:bg-surface-active"
                        )}
                      >
                        {type.name}
                      </button>
                    ))}
                  </div>
                ))}
            {search && filtered.length === 0 && <div className="px-2 py-2 text-sm text-fg-muted italic">No matches</div>}
            {!search && grouped.length === 0 && <div className="px-2 py-2 text-sm text-fg-muted italic">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
};
