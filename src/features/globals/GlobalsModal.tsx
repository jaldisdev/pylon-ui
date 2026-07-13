import type React from "react";
import {useEffect, useMemo, useState} from "react";
import clsx from "clsx";

import type {ConfigOptionInfo, GlobalInfo, NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import {useGlobalsSchema} from "@/lib/api/useGlobalsSchema";
import {useConfigOptions} from "@/lib/api/useConfigOptions";
import {useSchema} from "@/lib/api/useSchema";
import {useGlobalsStore} from "@/lib/state/globalsStore";
import {useConfigStore} from "@/lib/state/configStore";
import {resolveArrayParamElement, resolveTupleParamMembers} from "@/lib/schema/tupleTypeCast";
import {defaultTupleValue, TupleEditor} from "@/ui/dataEditor/TupleEditor";
import {ArrayEditor} from "@/ui/dataEditor/ArrayEditor";
import {ScalarMemberInput} from "@/ui/dataEditor/ScalarMemberInput";
import {Modal} from "@/ui/Modal";
import {Switch} from "@/ui/Switch";
import {Select, type SelectOption} from "@/ui/Select";

interface GlobalsModalProps {
  onClose: () => void;
}

type Scope = "globals" | "config";

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

const BOOL_OPTIONS: SelectOption[] = [
  {value: "true", label: "True"},
  {value: "false", label: "False"},
];

// Configures session globals (Global[T] declarations, e.g. current_user_id)
// and session config options (Client.with_config(), e.g.
// allow_user_specified_id) — a scope toggle switches which one this modal
// edits, matching Gel's own separate globals/config panels merged into one
// place here. Both share the same activation-toggle + merge-on-save pattern
// (see globalsStore.ts/configStore.ts) — only the value editor differs: a
// tuple/array/enum/scalar global gets the same widgets as everywhere else in
// the app (TupleEditor/ArrayEditor/ScalarMemberInput), while a boolean config
// option gets a True/False Select instead of the usual pill toggle.
export const GlobalsModal: React.FC<GlobalsModalProps> = ({onClose}) => {
  const [scope, setScope] = useState<Scope>("globals");

  const {data} = useGlobalsSchema();
  const {data: configData} = useConfigOptions();
  const {data: schema} = useSchema();
  const entries = useGlobalsStore((s) => s.entries);
  const setEntry = useGlobalsStore((s) => s.setEntry);
  const configEntries = useConfigStore((s) => s.entries);
  const setConfigEntry = useConfigStore((s) => s.setEntry);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Per-global on/off toggle, like Gel's globals panel — a global's value
  // always stays stored client-side (see globalsStore.ts), but only an
  // enabled one is actually sent with a query.
  const [draftEnabled, setDraftEnabled] = useState<Record<string, boolean>>({});
  // Same shape as the globals drafts above, keyed by config option name
  // instead of "module::name" — seeded from the option's own registry
  // default (see pylon/config_options.py) rather than blank, since every
  // config option (unlike a global) always has a well-defined value.
  const [configDrafts, setConfigDrafts] = useState<Record<string, string>>({});
  const [configDraftEnabled, setConfigDraftEnabled] = useState<Record<string, boolean>>({});

  // `data`/`configData` are still `undefined` on this component's very first
  // render (a fresh useQuery call never has cached data synchronously
  // available) — right after a page reload, before either query has had a
  // chance to resolve, that was true 100% of the time. Separately, zustand's
  // `persist` middleware hydrates from localStorage *asynchronously* even
  // for the synchronous localStorage engine — `entries` starts as the
  // pre-hydration empty default and only picks up the real saved
  // enabled/disabled state a moment later. Seeding from a
  // `useState(() => ...)` lazy initializer (or an effect that doesn't wait
  // for hydration) can win that race and lock in "never configured" (enabled:
  // true) forever for every row, even though the real values arrive
  // milliseconds later — seed only once BOTH the query has data AND the
  // store has finished hydrating, via `persist.hasHydrated()`.
  const [globalsHydrated, setGlobalsHydrated] = useState(() => useGlobalsStore.persist.hasHydrated());
  useEffect(() => {
    if (globalsHydrated) return;
    return useGlobalsStore.persist.onFinishHydration(() => setGlobalsHydrated(true));
  }, [globalsHydrated]);

  const [configHydrated, setConfigHydrated] = useState(() => useConfigStore.persist.hasHydrated());
  useEffect(() => {
    if (configHydrated) return;
    return useConfigStore.persist.onFinishHydration(() => setConfigHydrated(true));
  }, [configHydrated]);

  // `seeded` boolean guards keep this a one-time seed per modal open, so it
  // doesn't clobber in-progress edits if the underlying store changes for an
  // unrelated reason while open.
  const [globalsSeeded, setGlobalsSeeded] = useState(false);
  useEffect(() => {
    if (globalsSeeded || !data || !globalsHydrated) return;
    const initialDrafts: Record<string, string> = {};
    const initialEnabled: Record<string, boolean> = {};
    for (const g of data.globals) {
      const key = qualifiedName(g);
      const value = entries[key]?.value;
      if (value !== undefined) initialDrafts[key] = typeof value === "string" ? value : JSON.stringify(value);
      initialEnabled[key] = entries[key]?.enabled ?? false;
    }
    setDrafts(initialDrafts);
    setDraftEnabled(initialEnabled);
    setGlobalsSeeded(true);
  }, [data, entries, globalsSeeded, globalsHydrated]);

  const [configSeeded, setConfigSeeded] = useState(false);
  useEffect(() => {
    if (configSeeded || !configData || !configHydrated) return;
    const initialDrafts: Record<string, string> = {};
    const initialEnabled: Record<string, boolean> = {};
    for (const o of configData.options) {
      const value = configEntries[o.name]?.value ?? o.default;
      initialDrafts[o.name] = String(value);
      initialEnabled[o.name] = configEntries[o.name]?.enabled ?? false;
    }
    setConfigDrafts(initialDrafts);
    setConfigDraftEnabled(initialEnabled);
    setConfigSeeded(true);
  }, [configData, configEntries, configSeeded, configHydrated]);

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
  // entirely, rather than being dropped. Saves both scopes at once so
  // switching tabs before hitting Save never loses the other scope's edits.
  const handleSave = () => {
    if (hasErrors) return;
    for (const g of data?.globals ?? []) {
      const key = qualifiedName(g);
      const raw = drafts[key]?.trim();
      if (!raw) continue;
      const enabled = draftEnabled[key] ?? false;
      if (resolveTupleParamMembers(g.typeName, schema) || resolveArrayParamElement(g.typeName, schema)) {
        const parsed = safeParseJson(raw);
        if (parsed !== undefined) setEntry(key, {value: parsed, enabled});
      } else {
        setEntry(key, {value: coerceParamValue(raw, g.typeName), enabled});
      }
    }
    for (const o of configData?.options ?? []) {
      const raw = configDrafts[o.name]?.trim();
      if (!raw) continue;
      const enabled = configDraftEnabled[o.name] ?? false;
      const value = o.typeName === "bool" ? raw === "true" : raw;
      setConfigEntry(o.name, {value, enabled});
    }
    onClose();
  };

  // Output
  return (
    <Modal title={scope === "globals" ? "Session Globals" : "Session Config"} onClose={onClose}>
      <div className="mb-6 flex gap-1 rounded-md bg-surface-active p-1">
        {(["globals", "config"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={clsx(
              "flex-1 rounded px-3 py-1.5 leading-none text-sm capitalize transition-colors",
              scope === s ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {scope === "globals" ? (
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

            const enabled = draftEnabled[key] ?? false;

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
                  <GlobalTupleEditor
                    key={globalsSeeded ? "seeded" : "loading"}
                    members={tupleMembers}
                    raw={raw}
                    schema={schema}
                    onChange={(v) => setDrafts((prev) => ({...prev, [key]: v}))}
                  />
                ) : arrayElement && schema ? (
                  <GlobalArrayEditor
                    key={globalsSeeded ? "seeded" : "loading"}
                    element={arrayElement}
                    raw={raw}
                    schema={schema}
                    onChange={(v) => setDrafts((prev) => ({...prev, [key]: v}))}
                  />
                ) : (
                  <ScalarMemberInput
                    // ScalarMemberInput only seeds its internal text state
                    // once, on mount — this global's real stored value (if
                    // any) only becomes available once the seeding effect
                    // above resolves, a render or two after this row's first
                    // mount, so a stable key would leave it stuck on its
                    // empty first-mount seed forever. Forces a fresh mount
                    // (and correct reseed) the moment the real value lands.
                    key={globalsSeeded ? "seeded" : "loading"}
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
      ) : (
        <div className="flex flex-col gap-6">
          {(configData?.options ?? []).length === 0 && (
            <div className="text-sm text-fg-muted">No config options available.</div>
          )}
          {(configData?.options ?? []).map((o: ConfigOptionInfo) => {
            const raw = configDrafts[o.name] ?? "";
            const enabled = configDraftEnabled[o.name] ?? false;

            return (
              <div key={o.name} className={enabled ? undefined : "opacity-50"}>
                <div className="mb-2.5 flex items-center gap-1.5 font-mono text-xs text-fg-muted">
                  <Switch
                    checked={enabled}
                    onCheckedChange={(next) => setConfigDraftEnabled((prev) => ({...prev, [o.name]: next}))}
                    title={enabled ? "Active — applied to every query" : "Inactive — kept, but not applied"}
                  />
                  {o.name}
                  <span className="opacity-70">— {o.typeName}</span>
                </div>
                {o.typeName === "bool" ? (
                  <Select
                    options={BOOL_OPTIONS}
                    value={BOOL_OPTIONS.find((opt) => opt.value === raw) ?? null}
                    onChange={(opt) => setConfigDrafts((prev) => ({...prev, [o.name]: opt?.value ?? String(o.default)}))}
                  />
                ) : (
                  <ScalarMemberInput
                    key={configSeeded ? "seeded" : "loading"}
                    value={raw}
                    castType={null}
                    onChange={(nextRaw) => setConfigDrafts((prev) => ({...prev, [o.name]: nextRaw}))}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

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
