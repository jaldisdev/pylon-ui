import type React from "react";
import {useMemo, useState} from "react";
import clsx from "clsx";

import type {GlobalInfo} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import {useGlobalsSchema} from "@/lib/api/useGlobalsSchema";
import {useGlobalsStore} from "@/lib/state/globalsStore";
import {Modal} from "@/ui/Modal";

interface GlobalsModalProps {
  onClose: () => void;
}

const qualifiedName = (g: GlobalInfo) => `${g.module}::${g.name}`;

// typeName is a canonical PyQL type ("std::int64", "std::uuid", ...) —
// coerceParamValue expects the short cast-type token ("int64", "uuid", ...)
// it already knows how to coerce, so strip the "std::"/"cal::" prefix.
const shortTypeName = (typeName: string | null) => typeName?.split("::").pop() ?? null;

// Configures session globals (Global[T] declarations, e.g. current_user_id)
// applied to every query afterward via client.with_globals() — see
// pylon/server/asgi.py's /api/query handler. An empty field means "unset".
export const GlobalsModal: React.FC<GlobalsModalProps> = ({onClose}) => {
  const {data} = useGlobalsSchema();
  const values = useGlobalsStore((s) => s.values);
  const setValues = useGlobalsStore((s) => s.setValues);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      const value = values[key];
      if (value !== undefined) initial[key] = String(value);
    }
    return initial;
  });

  // Recomputed on every keystroke — cheap (regex/JSON.parse over a handful
  // of short strings) and keeps the error message live as the user types,
  // rather than only surfacing it on a failed Save attempt.
  const errors = useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      const raw = drafts[key]?.trim();
      result[key] = raw ? validateCastValue(raw, shortTypeName(g.typeName)) : null;
    }
    return result;
  }, [data, drafts]);
  const hasErrors = Object.values(errors).some((e) => e !== null);

  const handleSave = () => {
    if (hasErrors) return;
    const next: Record<string, unknown> = {};
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      const raw = drafts[key]?.trim();
      if (raw) next[key] = coerceParamValue(raw, shortTypeName(g.typeName));
    }
    setValues(next);
    onClose();
  };

  // Output
  return (
    <Modal title="Session Globals" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {(data?.globals ?? []).length === 0 && (
          <div className="text-sm text-fg-muted">No settable globals declared in this schema.</div>
        )}
        {(data?.globals ?? []).map((g) => {
          const key = qualifiedName(g);
          const error = errors[key];
          return (
            <div key={key}>
              <div className="mb-1 flex items-center gap-1 font-mono text-xs text-fg-muted">
                {key}
                {g.required && <span className="text-[var(--syntax-operator)]">*</span>}
                {g.typeName && <span className="opacity-70">— {g.typeName}</span>}
              </div>
              <input
                value={drafts[key] ?? ""}
                onChange={(e) => setDrafts((prev) => ({...prev, [key]: e.target.value}))}
                placeholder={g.required ? "required" : "not set"}
                className={clsx(
                  "h-9.5 w-full rounded-md border bg-surface px-2.5 font-mono text-sm text-fg placeholder:text-fg-muted focus:outline-none",
                  error ? "border-[var(--syntax-operator)]" : "border-border focus:border-accent"
                )}
              />
              {error && <div className="mt-1 text-xs text-[var(--syntax-operator)]">{error}</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 items-center rounded-md px-3 text-sm text-fg-muted hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={hasErrors}
          className="flex h-8 items-center rounded-md bg-accent px-3 text-sm text-accent-fg disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
};
