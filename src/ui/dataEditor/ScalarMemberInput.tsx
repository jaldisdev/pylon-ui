import type React from "react";
import {useState} from "react";
import clsx from "clsx";

import {coerceParamValue, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import {Select, type SelectOption} from "@/ui/Select";

// Shared leaf widget for editing one plain-scalar value against an optional
// cast-type — an enum renders as a Select, a bool as a two-pill toggle,
// everything else as a validated text input with a floating cast-type tag in
// the top-right corner. Used by TupleEditor/ArrayEditor (nested member
// editing), ParamsPanel (query params), DataEditorCell (grid cells) and
// GlobalsModal, so the same widget/validation/styling applies everywhere a
// bare scalar needs editing. DataEditorCell's grid-cell enum picker keeps its
// own bespoke forced-open Select instead of this component — it needs
// open-on-mount + close-without-picking-discards semantics that don't apply
// anywhere else this widget is used.
//
// Keeps its own `raw` text state (seeded from `value` on mount only) so the
// displayed text never fights a round trip through a parent's assembled
// value — callers that need the coerced value push `coerced` themselves from
// `onChange`; callers that want to keep raw text around until a later commit
// (ParamsPanel, DataEditorCell's blur-to-commit text editor) use `raw`
// instead. `valid` is `coerced`'s own validity, so a caller never needs to
// call validateCastValue a second time.
interface ScalarMemberInputProps {
  value: unknown;
  castType: string | null;
  onChange: (raw: string, coerced: unknown, valid: boolean) => void;
  enumOptions?: string[] | null;
  isClearable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  // External error (e.g. "required, currently empty") merged with the
  // internal cast-shape validation — whichever is non-null wins.
  error?: string | null;
  // A grid cell is already narrow and its column header already names the
  // type, so it fills the cell's own height and skips the floating
  // cast-type tag that the roomier modal/panel surfaces show.
  dense?: boolean;
}

export const ScalarMemberInput: React.FC<ScalarMemberInputProps> = ({
  value,
  castType,
  onChange,
  enumOptions,
  isClearable,
  disabled,
  placeholder,
  autoFocus,
  multiline,
  onKeyDown,
  onBlur,
  error: externalError,
  dense,
}) => {
  const [raw, setRaw] = useState(() => (value === null || value === undefined ? "" : String(value)));

  if (enumOptions) {
    const options: SelectOption[] = enumOptions.map((m) => ({value: m, label: m}));
    const current = options.find((o) => o.value === raw) ?? null;
    return (
      <Select
        autoFocus={autoFocus}
        isDisabled={disabled}
        isClearable={isClearable}
        options={options}
        value={current}
        placeholder={placeholder}
        onChange={(opt) => {
          const next = opt?.value ?? "";
          setRaw(next);
          onChange(next, next || null, true);
        }}
      />
    );
  }

  if (castType === "std::bool" || shortCastType(castType) === "bool") {
    const current = raw.toLowerCase() === "true" ? "true" : raw.toLowerCase() === "false" ? "false" : null;
    return (
      <div className="flex gap-1">
        {(["true", "false"] as const).map((v) => (
          <button
            key={v}
            type="button"
            autoFocus={autoFocus && v === "true"}
            disabled={disabled}
            onClick={() => {
              setRaw(v);
              onChange(v, v === "true", true);
            }}
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

  // Empty means "nothing entered yet", not a format error — same convention
  // GlobalsModal/QueryEditorTab already apply before calling
  // validateCastValue themselves; whether that's acceptable is a
  // required-ness question for the caller (`externalError`), not a cast-
  // shape one. Without this guard, any optional field starts out flagged
  // invalid the instant it's rendered, before the user has touched it —
  // confirmed live via a junction-backed link's property cell in the Data
  // Explorer (shows invalid the moment a new link target is picked).
  const internalError = raw ? validateCastValue(raw, castType) : null;
  const error = externalError ?? internalError;
  const showTag = castType && !dense;
  const inputClassName = clsx(
    "w-full font-mono text-fg outline-none disabled:opacity-50",
    // Dense (grid-cell) mode now sits flush against the cell's own edges
    // (see DataGrid.tsx's `isEditing ? "p-0" : ...`) — a rounded corner
    // butted against a square cell boundary looks like a clipped corner, so
    // it's squared off there instead; the roomier modal/panel surfaces keep
    // the rounding.
    dense ? "rounded-none" : "rounded-md",
    // Dense mode fills the cell's full height edge-to-edge — a native
    // <input> already vertically centers its own text regardless of
    // box height, but a <textarea> does *not* (it top-aligns), so vertical
    // padding is dropped in favor of a fixed line-height exactly matching the
    // available content height (ROW_HEIGHT minus the 1px border on each
    // side — see DataGrid.tsx's ROW_HEIGHT), centering a single line via the
    // classic line-height trick instead. Only looks right for one line, but
    // multi-row growth is already moot: the cell's own overflow-hidden caps
    // it at ROW_HEIGHT regardless.
    dense ? "h-full px-2 text-sm leading-[2.5rem]" : "h-10 px-2.5 text-sm",
    showTag && "pr-14",
    // Dense mode matches the grid's own left-border-plus-tint treatment for
    // an error state (see DataGrid.tsx's isMissingRequired) instead of a
    // boxed all-around red border — the roomier modal/panel surfaces keep
    // the classic all-around border either way, resting or errored. The
    // dense+error branch still needs its own border-border (not just
    // border-l-red-500) on the other three sides, or they fall back to the
    // browser's default border-color (currentColor) instead of staying
    // invisible/subtle — and bg-surface has to be dropped from this branch
    // entirely (not just "overridden" by bg-red-500/10 after it) since two
    // same-specificity background-color utilities race on generation order,
    // not on their position in the class string.
    dense && error
      ? "border-[1.5px] border-border border-l-2 border-l-red-500 bg-red-500/10"
      : clsx("border-[1.5px] bg-surface", error ? "border-(--syntax-operator)" : "border-border focus:border-accent")
  );

  const commit = (next: string) => {
    setRaw(next);
    const nextError = validateCastValue(next, castType);
    onChange(next, nextError ? next : coerceParamValue(next, castType), !nextError);
  };

  // leading-0 on the wrapper: a <textarea> is inline-level for the purpose
  // of its containing block's line box, so the wrapper's own (inherited,
  // non-zero) line-height was adding extra height on top of the textarea's
  // own box — exactly the "cell grows by a few px while editing" bug.
  return (
    <div className={clsx("relative leading-0", dense && "h-full")}>
      {multiline ? (
        <textarea
          autoFocus={autoFocus}
          disabled={disabled}
          value={raw}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          rows={Math.min(6, Math.max(1, raw.split("\n").length))}
          className={clsx(inputClassName, "resize-none", !dense && "py-1")}
        />
      ) : (
        <input
          type="text"
          autoFocus={autoFocus}
          disabled={disabled}
          value={raw}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={inputClassName}
        />
      )}
      {showTag && (
        <span
          className={clsx(
            "absolute top-1 right-1 rounded px-1.5 py-0.5 leading-3 text-2xs font-medium",
            error ? "bg-(--syntax-operator) text-white" : "bg-surface-active text-fg-muted"
          )}
        >
          {castType}
        </span>
      )}
    </div>
  );
};

const shortCastType = (castType: string | null): string | null => (castType ? (castType.split("::").pop() ?? null) : null);
