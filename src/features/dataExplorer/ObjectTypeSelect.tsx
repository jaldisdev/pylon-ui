import type React from "react";
import {useEffect, useMemo, useRef, useState} from "react";
import {ChevronDown} from "lucide-react";

import type {SchemaType} from "@/lib/api/client";
import {fuzzyMatch} from "@/lib/fuzzyMatch";
import {HighlightedText} from "@/ui/HighlightedText";

interface ObjectTypeSelectProps {
  types: SchemaType[];
  selected: SchemaType | null;
  onSelect: (type: SchemaType) => void;
}

// Root-level object type picker for the Data Explorer — a button showing the
// current type, opening a filterable dropdown list of every type in the schema.
export const ObjectTypeSelect: React.FC<ObjectTypeSelectProps> = ({types, selected, onSelect}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on any click outside it.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Fuzzy-match + rank by quality (contiguous/early matches first), the way
  // Gel's Cmd+P type search does — not just a plain substring filter.
  const filtered = useMemo(() => {
    return types
      .map((type) => ({type, match: fuzzyMatch(search, `${type.module}::${type.name}`)}))
      .filter((entry): entry is {type: SchemaType; match: NonNullable<typeof entry.match>} => entry.match !== null)
      .sort((a, b) => a.match.score - b.match.score);
  }, [types, search]);

  // Output
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
        <div className="absolute top-full left-0 z-30 mt-1 max-h-80 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-[var(--shadow-card)]">
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter types…"
            className="w-full border-b border-border px-2 py-1.5 text-sm outline-none"
          />
          <div className="max-h-64 overflow-auto">
            {filtered.map(({type, match}) => {
              const qualname = `${type.module}::${type.name}`;
              return (
                <button
                  key={qualname}
                  type="button"
                  onClick={() => {
                    onSelect(type);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="block w-full px-2 py-1.5 text-left font-mono text-sm hover:bg-surface-hover"
                >
                  <HighlightedText text={qualname} indices={match.indices} />
                </button>
              );
            })}
            {filtered.length === 0 && <div className="px-2 py-2 text-sm text-fg-muted italic">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
};
