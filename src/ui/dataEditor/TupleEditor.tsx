import type React from "react";
import {Fragment} from "react";
import clsx from "clsx";

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import {ScalarMemberInput} from "@/ui/dataEditor/ScalarMemberInput";

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

  // A CSS grid (not one flex row per member) so the label column sizes to
  // the *widest* label across every member, and every input starts at that
  // same x-offset with equal width — independent flex rows would each size
  // their own label instead, leaving shorter-labeled inputs narrower and
  // misaligned. A positional (unnamed) member has no label cell to line up
  // with anything, so its input spans both columns instead of leaving a
  // stray empty first cell.
  return (
    <div
      className={clsx(
        "grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 rounded-md p-2",
        depth % 2 === 1 ? "bg-surface-hover" : "bg-surface"
      )}
    >
      {members.map((member, index) => (
        <Fragment key={member.name ?? index}>
          {member.name !== null && <span className="shrink-0 font-mono text-2sm text-fg-muted">{member.name} :=</span>}
          <div className={clsx("min-w-0", member.name === null && "col-span-2")}>
            <MemberEditor
              member={member}
              schema={schema}
              value={getMemberValue(member, index)}
              onChange={(next) => setMemberValue(member, index, next)}
              depth={depth}
            />
          </div>
        </Fragment>
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

  const enumOptions =
    member.kind === "enum"
      ? (() => {
          const [module, name] = (member.target ?? "").split("::");
          return schema.enums.find((e) => e.module === module && e.name === name)?.members ?? [];
        })()
      : null;

  return (
    <ScalarMemberInput
      value={value}
      castType={member.typeName ?? null}
      enumOptions={enumOptions}
      onChange={(_raw, coerced, valid) => onChange(valid ? coerced : _raw)}
    />
  );
};
