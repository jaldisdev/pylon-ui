import type React from "react";
import {useState} from "react";
import clsx from "clsx";

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import {Select, type SelectOption} from "@/ui/Select";

// Recursive editor for a named-tuple value (nominal `@pylon.named_tuple` or
// structural `pylon.Tuple[...]`) — one row per member, `name := <widget>`
// (no label for a positional/unnamed element), recursing into another
// TupleEditor for a nested tuple member. Mirrors gel-ui's TupleEditor:
// alternating panel shading by depth, one `onChange` for the whole assembled
// value (no per-member commit — the whole tuple commits atomically when its
// popover closes).
interface TupleEditorProps {
  members: NamedTupleMember[];
  schema: SchemaResponse;
  value: unknown;
  onChange: (value: unknown) => void;
  depth?: number;
}

const isPositional = (members: NamedTupleMember[]): boolean => members.every((m) => m.name === null);

// A nominal member only carries `target` — its member list lives in
// schema.namedTuples. A structural member carries its `members` inline.
export const resolveTupleMembers = (member: {target?: string; members?: NamedTupleMember[]}, schema: SchemaResponse): NamedTupleMember[] => {
  if (member.members) return member.members;
  if (!member.target) return [];
  const [module, name] = member.target.split("::");
  return schema.namedTuples.find((nt) => nt.module === module && nt.name === name)?.members ?? [];
};

// Exported for reuse by ArrayEditor.tsx (a new array item's initial value).
export const defaultMemberValue = (member: NamedTupleMember, schema: SchemaResponse): unknown => {
  if (member.kind === "namedTuple") return defaultTupleValue(resolveTupleMembers(member, schema), schema);
  if (member.kind === "enum") return null;
  if (member.typeName === "std::bool") return false;
  return "";
};

export const defaultTupleValue = (members: NamedTupleMember[], schema: SchemaResponse): unknown =>
  isPositional(members)
    ? members.map((m) => defaultMemberValue(m, schema))
    : Object.fromEntries(members.map((m) => [m.name!, defaultMemberValue(m, schema)]));

export const TupleEditor: React.FC<TupleEditorProps> = ({members, schema, value, onChange, depth = 0}) => {
  const positional = isPositional(members);

  const getMemberValue = (member: NamedTupleMember, index: number): unknown =>
    positional ? (Array.isArray(value) ? value[index] : undefined) : (value as Record<string, unknown> | null | undefined)?.[member.name!];

  const setMemberValue = (member: NamedTupleMember, index: number, next: unknown) => {
    if (positional) {
      const arr = Array.isArray(value) ? [...value] : members.map((m) => defaultMemberValue(m, schema));
      arr[index] = next;
      onChange(arr);
    } else {
      const obj = {...((value as Record<string, unknown> | null | undefined) ?? {})};
      obj[member.name!] = next;
      onChange(obj);
    }
  };

  return (
    <div className={clsx("flex flex-col gap-1.5 rounded-md p-2", depth % 2 === 1 ? "bg-surface-hover" : "bg-surface")}>
      {members.map((member, index) => (
        <div key={member.name ?? index} className="flex items-start gap-2">
          {member.name !== null && <span className="mt-1.5 shrink-0 font-mono text-2sm text-fg-muted">{member.name} :=</span>}
          <div className="min-w-0 flex-1">
            <MemberEditor
              member={member}
              schema={schema}
              value={getMemberValue(member, index)}
              onChange={(next) => setMemberValue(member, index, next)}
              depth={depth}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// Exported for reuse by ArrayEditor.tsx — an array element's own type is the
// same {kind, target?, typeName?, members?} shape as one tuple member's
// type, so the same per-kind widget (enum select, bool toggle, nested-tuple
// panel, plain scalar input) applies unchanged.
export const MemberEditor: React.FC<{
  member: NamedTupleMember;
  schema: SchemaResponse;
  value: unknown;
  onChange: (value: unknown) => void;
  depth: number;
}> = ({member, schema, value, onChange, depth}) => {
  if (member.kind === "namedTuple") {
    const resolvedMembers = resolveTupleMembers(member, schema);
    const isUnset = value === null || value === undefined;
    // A null/undefined nested-tuple member renders unset (no expanded
    // sub-panel) until opted into — "unset" and "present but default" are
    // different states, especially for an optional nested member.
    if (isUnset) {
      return (
        <button
          type="button"
          onClick={() => onChange(defaultTupleValue(resolvedMembers, schema))}
          className="rounded bg-surface-hover px-2 py-1 font-mono text-2sm text-fg-muted hover:text-fg"
        >
          {"{}"} — click to set
        </button>
      );
    }
    return (
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <TupleEditor members={resolvedMembers} schema={schema} value={value} onChange={onChange} depth={depth + 1} />
        </div>
        <button
          type="button"
          title="Set to {}"
          onClick={() => onChange(null)}
          className="shrink-0 rounded-md bg-orange-500 px-2 py-1 font-mono text-2xs font-medium text-white hover:opacity-90 dark:bg-orange-600"
        >
          {"{}"}
        </button>
      </div>
    );
  }

  if (member.kind === "enum") {
    const [module, name] = (member.target ?? "").split("::");
    const enumMembers = schema.enums.find((e) => e.module === module && e.name === name)?.members ?? [];
    const options: SelectOption[] = enumMembers.map((m) => ({value: m, label: m}));
    const current = typeof value === "string" ? (options.find((o) => o.value === value) ?? null) : null;
    return <Select options={options} value={current} onChange={(opt) => onChange(opt?.value ?? null)} />;
  }

  if (member.typeName === "std::bool") {
    const current = value === true ? "true" : value === false ? "false" : null;
    return (
      <div className="flex gap-1">
        {(["true", "false"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v === "true")}
            className={clsx(
              "rounded px-2 py-1 text-2sm",
              current === v ? "bg-accent text-accent-fg" : "bg-surface-hover text-fg-muted hover:text-fg"
            )}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }

  return <ScalarMemberInput value={value} castType={member.typeName ?? null} onChange={onChange} />;
};

// Locally-controlled text input for a plain scalar member — mirrors the
// top-level cell editor's TextEditor, but pushes a value up on every
// keystroke instead of on commit (the whole tuple commits atomically, once,
// when its popover closes). Keeps its own `raw` state so the displayed text
// never fights a round trip through the parent's assembled value. Shows the
// same floating cast-type corner tag as the Query Editor's param inputs
// (ParamsPanel.tsx), for a consistent "what type does this expect" cue.
const ScalarMemberInput: React.FC<{value: unknown; castType: string | null; onChange: (value: unknown) => void}> = ({
  value,
  castType,
  onChange,
}) => {
  const [raw, setRaw] = useState(() => (value === null || value === undefined ? "" : String(value)));
  const error = validateCastValue(raw, castType);

  return (
    <div className="relative">
      <input
        type="text"
        value={raw}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          const nextError = validateCastValue(next, castType);
          onChange(nextError ? next : coerceParamValue(next, castType));
        }}
        className={clsx(
          "h-10 w-full rounded-md border bg-surface pr-14 pl-2.5 font-mono text-sm text-fg outline-none",
          error ? "border-[var(--syntax-operator)]" : "border-border focus:border-accent"
        )}
      />
      {castType && (
        <span
          className={clsx(
            "absolute top-1 right-1 rounded px-1.5 py-0.5 text-2xs font-medium",
            error ? "bg-[var(--syntax-operator)] text-white" : "bg-surface-active text-fg-muted"
          )}
        >
          {castType}
        </span>
      )}
    </div>
  );
};
