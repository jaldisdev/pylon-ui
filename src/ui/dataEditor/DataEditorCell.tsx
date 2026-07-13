import type React from "react";
import {useEffect, useRef} from "react";

import type {SchemaPointer, SchemaResponse} from "@/lib/api/client";
import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import type {EditValue} from "@/features/dataExplorer/state/editsStore";
import {Select, type SelectOption} from "@/ui/Select";
import {resolveTupleMembers} from "@/ui/dataEditor/TupleEditor";
import {TuplePopover} from "@/ui/dataEditor/TuplePopover";
import {ArrayPopover} from "@/ui/dataEditor/ArrayPopover";
import {ScalarMemberInput} from "@/ui/dataEditor/ScalarMemberInput";

// Inline per-scalar-type cell editor, mounted in place of a grid cell on
// double-click — mirrors gel-ui's dataEditor component library
// (shared/studio/components/dataEditor/*): bool -> two pill buttons, enum ->
// dropdown, str/json -> auto-growing textarea, array<T> -> ArrayPopover,
// everything else -> a plain validated text input. No date-picker anywhere,
// matching gel-ui exactly — dates/times are free-text validated against the
// same regexes the Query Editor's params already use.
interface DataEditorCellProps {
  pointer: SchemaPointer;
  schema: SchemaResponse;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
  onDiscard: () => void;
}

const valueToRawText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

// Reuses the Query Editor's own param validator/coercer (extractParams.ts)
// so scalar validation has one canonical implementation across the app.
const toEditValue = (raw: string, castType: string | null): EditValue => {
  const error = validateCastValue(raw, castType);
  return error ? {valid: false, raw, error} : {valid: true, value: coerceParamValue(raw, castType)};
};

// null and undefined both mean "unset" here — a cell whose value starts out
// undefined (never fetched a value) and one that starts out null (explicitly
// cleared) must compare equal so re-committing either doesn't look "changed".
const normalizeForCompare = (value: unknown): unknown => (value === undefined ? null : value);

const isUnchanged = (value: EditValue, initialValue: unknown): boolean =>
  value.valid && JSON.stringify(normalizeForCompare(value.value)) === JSON.stringify(normalizeForCompare(initialValue));

export const DataEditorCell: React.FC<DataEditorCellProps> = ({pointer, schema, initialValue, onCommit, onDiscard}) => {
  const optional = !pointer.required;
  // Every editor below commits through this instead of the raw prop — a
  // committed value that's identical to what the cell already held (e.g. the
  // popover was opened and closed untouched, or the same option was
  // re-picked) discards instead of registering a pending edit, so the row
  // doesn't spuriously flip to "touched".
  const commitIfChanged = (value: EditValue) => {
    if (isUnchanged(value, initialValue)) {
      onDiscard();
      return;
    }
    onCommit(value);
  };

  return (
    <div
      className="flex items-stretch"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDiscard();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        {pointer.kind === "namedTuple" ? (
          <TuplePopover
            members={resolveTupleMembers(pointer, schema)}
            schema={schema}
            initialValue={initialValue}
            onCommit={commitIfChanged}
            onDiscard={onDiscard}
            optional={optional}
          />
        ) : pointer.kind === "array" && pointer.element ? (
          <ArrayPopover
            element={pointer.element}
            schema={schema}
            initialValue={initialValue}
            onCommit={commitIfChanged}
            onDiscard={onDiscard}
            optional={optional}
          />
        ) : pointer.kind === "enum" ? (
          <EnumEditor pointer={pointer} schema={schema} initialValue={initialValue} onCommit={commitIfChanged} onDiscard={onDiscard} />
        ) : pointer.typeName === "std::bool" ? (
          <BoolEditor initialValue={initialValue} onCommit={commitIfChanged} />
        ) : (
          <TextEditor pointer={pointer} initialValue={initialValue} onCommit={commitIfChanged} squareRight={optional} />
        )}
      </div>
      {/* Optional pointers get an explicit "clear to {}" action, matching
          gel-ui's tan pill button butted against the input's right edge —
          the only way to blank an optional value rather than typing
          something. Immediately commits (no separate "empty mode"),
          matching gel-ui's onClose(false)-on-click behavior. A tuple/array
          pointer renders this same action *inside* its own popover instead
          (see the `optional` prop above) — the popover is portalled and
          floats away from this collapsed cell once expanded, so a button
          left behind here would look detached from it. */}
      {optional && pointer.kind !== "namedTuple" && pointer.kind !== "array" && (
        <button
          type="button"
          title="Set to {}"
          onClick={() => commitIfChanged({valid: true, value: null})}
          className="flex shrink-0 items-center justify-center rounded-r-md bg-orange-500 px-2 font-mono text-2sm font-medium text-white hover:opacity-90 dark:bg-orange-600"
        >
          {"{}"}
        </button>
      )}
    </div>
  );
};

const EnumEditor: React.FC<{
  pointer: SchemaPointer;
  schema: SchemaResponse;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
  onDiscard: () => void;
}> = ({pointer, schema, initialValue, onCommit, onDiscard}) => {
  // With `menuIsOpen` forced permanently true, react-select fires
  // onMenuClose *before* onChange when an option is picked (confirmed
  // empirically). onDiscard clears the store's activePropertyEdit pointer,
  // which onCommit's commitPropertyEdit action needs to know which cell to
  // write to — so calling onDiscard first turns the real commit into a
  // silent no-op. Defer the discard to a microtask so a same-tick onChange
  // (a real pick) always gets to mark `picked` first and cancel it; only an
  // actual close-without-picking (Escape, click away) reaches the discard.
  const pickedRef = useRef(false);
  const [module, name] = (pointer.target ?? "").split("::");
  const members = schema.enums.find((e) => e.module === module && e.name === name)?.members ?? [];
  const options: SelectOption[] = members.map((m) => ({value: m, label: m}));
  const initial = typeof initialValue === "string" ? (options.find((o) => o.value === initialValue) ?? null) : null;

  return (
    <Select
      autoFocus
      menuIsOpen
      options={options}
      value={initial}
      onChange={(opt) => {
        pickedRef.current = true;
        onCommit({valid: true, value: opt?.value ?? null});
      }}
      onMenuClose={() => {
        queueMicrotask(() => {
          if (!pickedRef.current) onDiscard();
        });
      }}
    />
  );
};

const BoolEditor: React.FC<{initialValue: unknown; onCommit: (value: EditValue) => void}> = ({initialValue, onCommit}) => (
  <ScalarMemberInput
    dense
    autoFocus
    value={initialValue}
    castType="std::bool"
    onChange={(_raw, coerced) => onCommit({valid: true, value: coerced})}
  />
);

const TextEditor: React.FC<{
  pointer: SchemaPointer;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
  squareRight?: boolean;
}> = ({pointer, initialValue, onCommit, squareRight}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const castType = pointer.typeName ?? null;
  const isMultiline = castType === "std::str" || castType === "std::json";
  const latestRef = useRef<EditValue>(toEditValue(valueToRawText(initialValue), castType));
  const committedRef = useRef(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(e.target as Node) || committedRef.current) return;
      committedRef.current = true;
      onCommit(latestRef.current);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onCommit]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(latestRef.current);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation();
      commit();
    }
  };

  return (
    <div ref={containerRef} className="h-full">
      <ScalarMemberInput
        dense
        autoFocus
        value={initialValue}
        castType={castType}
        multiline={isMultiline}
        squareRight={squareRight}
        onKeyDown={onKeyDown}
        onChange={(raw, coerced, valid) => {
          latestRef.current = valid ? {valid: true, value: coerced} : {valid: false, raw, error: validateCastValue(raw, castType) ?? ""};
        }}
      />
    </div>
  );
};
