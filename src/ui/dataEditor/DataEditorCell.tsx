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
  // Tab/Shift+Tab while editing — moves to the next/previous editable cell
  // instead of native tab-to-next-focusable-DOM-element, matching a
  // spreadsheet-like grid rather than a page full of separate form fields.
  onTabNext: (backwards: boolean) => void;
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

export const DataEditorCell: React.FC<DataEditorCellProps> = ({pointer, schema, initialValue, onCommit, onDiscard, onTabNext}) => {
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

  // Passed down to TextEditor as its "click outside commits" boundary —
  // must span the *whole* cell (this root), not just TextEditor's own input
  // wrapper: the "unset" button below is a sibling of that wrapper, so a
  // click on it would otherwise register as "outside," committing/discarding
  // the text value on mousedown (capture phase, before the button's own
  // click) and unmounting this whole cell before the button's click ever
  // fires.
  const rootRef = useRef<HTMLDivElement>(null);

  // flex + items-stretch is what reliably fills the cell's full height (a
  // plain block chain of nested `h-full`s is fragile — percentage heights
  // don't cascade dependably through several stacked levels inside a table
  // cell). `relative` alongside it (a flex container can be positioned too)
  // gives the optional "unset" button below a containing block to overlay
  // on top of, absolutely, rather than being a flex sibling that adds its
  // own width to the row — a flex sibling doesn't fit within a fixed-width
  // `table-fixed` column (the row ends up wider than the cell, spilling its
  // right edge into the next column) since nothing forces it to share space
  // with the editor beside it once their combined min-content width exceeds
  // the cell.
  return (
    <div
      ref={rootRef}
      className="relative flex h-full items-stretch"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDiscard();
        } else if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          // Blurring first (rather than after) flushes TextEditor's own
          // pending-commit-on-blur synchronously, so the just-typed value is
          // saved before this cell's editor unmounts underneath onTabNext.
          (document.activeElement as HTMLElement | null)?.blur();
          onTabNext(e.shiftKey);
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
          <TextEditor pointer={pointer} initialValue={initialValue} onCommit={commitIfChanged} boundaryRef={rootRef} />
        )}
      </div>
      {/* Optional pointers get an explicit "clear to {}" action, matching
          gel-ui's tan pill button — the only way to blank an optional value
          rather than typing something. Immediately commits (no separate
          "empty mode"), matching gel-ui's onClose(false)-on-click behavior. A
          tuple/array pointer renders this same action *inside* its own
          popover instead (see the `optional` prop above) — the popover is
          portalled and floats away from this collapsed cell once expanded,
          so a button left behind here would look detached from it.
          translate-x-full pushes it entirely past the cell's own right edge
          (rather than reserving space for it inside the editor, which would
          shift the editor's text/value off-center from where the static
          display shows it) — DataGrid.tsx skips this cell's overflow-hidden
          while editing so it isn't clipped there. */}
      {optional && pointer.kind !== "namedTuple" && pointer.kind !== "array" && (
        <button
          type="button"
          title="Set to {}"
          // Without this, mousedown on the button blurs the still-focused
          // text input first — TextEditor's onBlur-commit fires with the
          // (unchanged) typed value, discards, and unmounts this whole cell
          // (button included) before the button's own click ever reaches
          // its onClick. preventDefault on mousedown stops the browser from
          // shifting focus off the input at all, so no premature blur/
          // discard happens before the real click runs.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commitIfChanged({valid: true, value: null})}
          className="absolute inset-y-0 right-0 z-10 flex translate-x-full items-center justify-center rounded-r-md bg-orange-500 px-2 font-mono text-2sm font-medium text-white hover:opacity-90 dark:bg-orange-600"
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
      dense
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
  // The whole cell's own boundary (from DataEditorCell), not just this
  // component's own wrapper — a click on the sibling "unset" button must
  // count as "inside" too, or it gets treated as a click-outside-commits
  // before the button's own click ever fires. See DataEditorCell's own
  // comment on rootRef for the full mousedown/click ordering explanation.
  boundaryRef: React.RefObject<HTMLDivElement | null>;
}> = ({pointer, initialValue, onCommit, boundaryRef}) => {
  const castType = pointer.typeName ?? null;
  const isMultiline = castType === "std::str" || castType === "std::json";
  const latestRef = useRef<EditValue>(toEditValue(valueToRawText(initialValue), castType));
  const committedRef = useRef(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!boundaryRef.current || boundaryRef.current.contains(e.target as Node) || committedRef.current) return;
      committedRef.current = true;
      onCommit(latestRef.current);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onCommit, boundaryRef]);

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
    <div className="h-full w-full">
      <ScalarMemberInput
        dense
        autoFocus
        value={initialValue}
        castType={castType}
        multiline={isMultiline}
        onKeyDown={onKeyDown}
        onBlur={commit}
        onChange={(raw, coerced, valid) => {
          latestRef.current = valid ? {valid: true, value: coerced} : {valid: false, raw, error: validateCastValue(raw, castType) ?? ""};
        }}
      />
    </div>
  );
};
