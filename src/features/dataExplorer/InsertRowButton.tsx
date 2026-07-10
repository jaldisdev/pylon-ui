import type React from "react";
import {useEffect, useMemo, useRef, useState} from "react";
import {ChevronDown, Plus} from "lucide-react";

import type {SchemaResponse, SchemaType} from "@/lib/api/client";

interface InsertRowButtonProps {
  schema: SchemaResponse;
  schemaType: SchemaType;
  onInsert: (concreteTypeName: string) => void;
}

const qualname = (t: SchemaType) => `${t.module}::${t.name}`;

// Whether `type` is `ancestorQualname` itself, or descends from it through
// Pylon's real inheritance (@pylon.abstract/@pylon.interface) — walks
// `bases` transitively rather than assuming a single level.
const isSelfOrDescendant = (schema: SchemaResponse, type: SchemaType, ancestorQualname: string): boolean =>
  qualname(type) === ancestorQualname ||
  type.bases.some((baseQualname) => {
    const base = schema.types.find((t) => qualname(t) === baseQualname);
    return base ? isSelfOrDescendant(schema, base, ancestorQualname) : false;
  });

// The concrete (non-abstract) insertable options for the type currently
// being viewed — itself, if concrete, plus any concrete descendants. An
// abstract/interface type with multiple concrete implementers (e.g.
// pylon-demo's Account -> Individual/Organization) gets a dropdown instead
// of a single button.
const concreteSubtypes = (schema: SchemaResponse, type: SchemaType): SchemaType[] =>
  schema.types.filter((t) => !t.abstract && isSelfOrDescendant(schema, t, qualname(type)));

export const InsertRowButton: React.FC<InsertRowButtonProps> = ({schema, schemaType, onInsert}) => {
  const options = useMemo(() => concreteSubtypes(schema, schemaType), [schema, schemaType]);

  if (options.length === 0) return null; // abstract type with no concrete implementers — nothing to insert

  if (options.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onInsert(qualname(options[0]))}
        className="flex h-7 items-center gap-1 rounded-md px-2 text-2sm text-fg-muted hover:bg-surface-hover"
      >
        <Plus size={12} strokeWidth={1.75} />
        Insert {options[0].name}
      </button>
    );
  }

  return <InsertTypeDropdown options={options} onInsert={onInsert} />;
};

const InsertTypeDropdown: React.FC<{options: SchemaType[]; onInsert: (concreteTypeName: string) => void}> = ({
  options,
  onInsert,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1 rounded-md px-2 text-2sm text-fg-muted hover:bg-surface-hover"
      >
        <Plus size={12} strokeWidth={1.75} />
        Insert…
        <ChevronDown size={12} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface shadow-[var(--shadow-card)]">
          {options.map((type) => (
            <button
              key={qualname(type)}
              type="button"
              onClick={() => {
                onInsert(qualname(type));
                setOpen(false);
              }}
              className="block w-full px-2 py-1.5 text-left font-mono text-sm hover:bg-surface-hover"
            >
              {type.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
