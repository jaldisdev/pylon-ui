import type React from "react";
import {useMemo, useState} from "react";

import type {GlobalInfo, NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import {useGlobalsSchema} from "@/lib/api/useGlobalsSchema";
import {useSchema} from "@/lib/api/useSchema";
import {useGlobalsStore} from "@/lib/state/globalsStore";
import {resolveArrayParamElement, resolveTupleParamMembers} from "@/lib/schema/tupleTypeCast";
import {defaultTupleValue, TupleEditor} from "@/ui/dataEditor/TupleEditor";
import {ArrayEditor} from "@/ui/dataEditor/ArrayEditor";
import {ScalarMemberInput} from "@/ui/dataEditor/ScalarMemberInput";
import {Modal} from "@/ui/Modal";
import {Switch} from "@/ui/Switch";

interface GlobalsModalProps {
  onClose: () => void;
}

const qualifiedName = (g: GlobalInfo) => `${g.module}::${g.name}`;

const findEnum = (schema: SchemaResponse | undefined, typeName: string | null) => {
  if (!schema || !typeName) return null;
  const [module, name] = typeName.includes("::") ? typeName.split("::") : ["default", typeName];
  return schema.enums.find((e) => e.module === module && e.name === name) ?? null;
};

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// Same embedded (no popover) pattern as ParamsPanel's TupleParamEditor/
// ArrayParamEditor — a global's draft value round-trips through
// JSON.stringify into the same `Record<string, string>` slot every other
// global uses, so tuple/array globals need no separate draft-state shape.
const GlobalTupleEditor: React.FC<{
  members: NamedTupleMember[];
  raw: string;
  schema: SchemaResponse;
  onChange: (raw: string) => void;
}> = ({members, raw, schema, onChange}) => {
  const parsed = raw ? safeParseJson(raw) : undefined;
  const value = parsed ?? defaultTupleValue(members, schema);
  return <TupleEditor members={members} schema={schema} value={value} onChange={(next) => onChange(JSON.stringify(next))} />;
};

const GlobalArrayEditor: React.FC<{
  element: NamedTupleMember;
  raw: string;
  schema: SchemaResponse;
  onChange: (raw: string) => void;
}> = ({element, raw, schema, onChange}) => {
  const parsed = raw ? safeParseJson(raw) : undefined;
  const value = Array.isArray(parsed) ? parsed : [];
  return <ArrayEditor element={element} schema={schema} value={value} onChange={(next) => onChange(JSON.stringify(next))} />;
};

// Configures session globals (Global[T] declarations, e.g. current_user_id)
// applied to every query afterward via client.with_globals() — see
// pylon/server/asgi.py's /api/query handler. An empty field means "unset".
// Reuses the same TupleEditor/ArrayEditor/ScalarMemberInput and cast-string
// parsing (tupleTypeCast.ts) as the Query Editor's params panel, so a
// tuple/array/enum-typed global gets the same widget everywhere.
export const GlobalsModal: React.FC<GlobalsModalProps> = ({onClose}) => {
  const {data} = useGlobalsSchema();
  const {data: schema} = useSchema();
  const entries = useGlobalsStore((s) => s.entries);
  const setEntry = useGlobalsStore((s) => s.setEntry);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      const value = entries[key]?.value;
      if (value !== undefined) initial[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return initial;
  });
  // Per-global on/off toggle, like Gel's globals panel — a global's value
  // always stays stored client-side (see globalsStore.ts), but only an
  // enabled one is actually sent with a query.
  const [draftEnabled, setDraftEnabled] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      initial[key] = entries[key]?.enabled ?? true;
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
      // A tuple/array global always renders with a valid default draft (a
      // fully-populated tuple, or an empty array), same as ParamsPanel.
      if (resolveTupleParamMembers(g.typeName, schema) || resolveArrayParamElement(g.typeName, schema)) {
        result[key] = null;
        continue;
      }
      const raw = drafts[key]?.trim();
      result[key] = raw ? validateCastValue(raw, g.typeName) : null;
    }
    return result;
  }, [data, drafts, schema]);
  const hasErrors = Object.values(errors).some((e) => e !== null);

  // Merges into the store instead of replacing it wholesale — a global that
  // was never drafted this session (e.g. the modal was reopened with more
  // globals declared since) keeps its existing stored entry untouched
  // entirely, rather than being dropped.
  const handleSave = () => {
    if (hasErrors) return;
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      const raw = drafts[key]?.trim();
      if (!raw) continue;
      const enabled = draftEnabled[key] ?? true;
      if (resolveTupleParamMembers(g.typeName, schema) || resolveArrayParamElement(g.typeName, schema)) {
        const parsed = safeParseJson(raw);
        if (parsed !== undefined) setEntry(key, {value: parsed, enabled});
      } else {
        setEntry(key, {value: coerceParamValue(raw, g.typeName), enabled});
      }
    }
    onClose();
  };

  // Output
  return (
    <Modal title="Session Globals" onClose={onClose}>
      <div className="flex flex-col gap-6">
        {(data?.globals ?? []).length === 0 && (
          <div className="text-sm text-fg-muted">No settable globals declared in this schema.</div>
        )}
        {(data?.globals ?? []).map((g) => {
          const key = qualifiedName(g);
          const error = errors[key];
          const raw = drafts[key] ?? "";
          const tupleMembers = resolveTupleParamMembers(g.typeName, schema);
          const arrayElement = resolveArrayParamElement(g.typeName, schema);
          const enumType = findEnum(schema, g.typeName);

          const enabled = draftEnabled[key] ?? true;

          return (
            <div key={key} className={enabled ? undefined : "opacity-50"}>
              <div className="mb-2.5 flex items-center gap-1.5 font-mono text-xs text-fg-muted">
                <Switch
                  checked={enabled}
                  onCheckedChange={(next) => setDraftEnabled((prev) => ({...prev, [key]: next}))}
                  title={enabled ? "Active — sent with every query" : "Inactive — kept, but not sent"}
                />
                {key}
                {g.required && <span className="text-[var(--syntax-operator)]">*</span>}
                {g.typeName && <span className="opacity-70">— {g.typeName}</span>}
              </div>
              {tupleMembers && schema ? (
                <GlobalTupleEditor members={tupleMembers} raw={raw} schema={schema} onChange={(v) => setDrafts((prev) => ({...prev, [key]: v}))} />
              ) : arrayElement && schema ? (
                <GlobalArrayEditor element={arrayElement} raw={raw} schema={schema} onChange={(v) => setDrafts((prev) => ({...prev, [key]: v}))} />
              ) : (
                <ScalarMemberInput
                  value={raw}
                  castType={g.typeName}
                  enumOptions={enumType?.members ?? null}
                  isClearable={!g.required}
                  placeholder={g.required ? "required" : "not set"}
                  error={error}
                  onChange={(nextRaw) => setDrafts((prev) => ({...prev, [key]: nextRaw}))}
                />
              )}
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
