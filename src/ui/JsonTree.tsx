//
// This source file is part of the Pylon open source project.
//
// Copyright (c) 2026 Jaldis B.V.
//
// Licensed under the MIT OR Apache-2.0 license (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://opensource.org/licenses/MIT
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type React from "react";
import {useState} from "react";
import clsx from "clsx";
import {ArrowRight, Check, ChevronRight, Copy} from "lucide-react";

import type {SchemaPointer, SchemaResponse, ValueShapeTag} from "@/lib/api/client";
import {floatMarkerChild, isFloatMarker, type FloatMarkerTree} from "@/lib/api/floatMarkers";
import {useSchema} from "@/lib/api/useSchema";
import {qualname} from "@/lib/schema/inheritance";
import {lookupPointerTypeTag, valueShapeChild, valueShapeToPointerTypeTag} from "@/lib/schema/typeTags";
import {ScalarValue} from "@/ui/ScalarValue";

interface JsonTreeProps {
  value: unknown;
  className?: string;
  // The compiled query's own value-shape tag tree (see client.ts), sent
  // alongside /api/query's response — resolves type tags for values that
  // aren't a known schema pointer (a bare top-level cast, a free object's
  // tuple field, ...), which the pointer-name-based lookup below can't
  // reach on its own. Omit it for a context with no compiled-query shape at
  // all (e.g. history replays of an older entry) — falls back to the
  // pointer-name guess everywhere.
  valueShape?: ValueShapeTag;
  // Aligned with `value` itself (see floatMarkers.ts) — lets a whole-number
  // float/decimal scalar (e.g. 1.0) still render with its decimal point,
  // which the already-parsed JS value alone can't tell apart from a plain
  // int. Omit it for a context with no raw response text available at all
  // (e.g. history replays of an older entry) — falls back to displaying
  // such a value like a bare int, same as before this existed.
  floatMarkers?: FloatMarkerTree;
  // Renders a "View objects" action next to any link/multi-link field
  // (resolved from the parent object's own schema pointers), calling this
  // with that pointer when clicked. Only ever passed by the Data Explorer's
  // row-expansion view — REPL/Query Editor's own JsonTree usage omits it,
  // so no button shows there.
  onNavigateLink?: (pointer: SchemaPointer) => void;
  // The root value's own pylon type, when the caller already knows it —
  // falls back to the value's own embedded __pylon_type__ marker otherwise,
  // which a query selecting a *concrete* (non-abstract) type directly often
  // doesn't bother sending (no polymorphism to disambiguate), leaving link
  // detection on its top-level fields with nothing to resolve against.
  rootPylonType?: string;
  // Omits the hover-revealed "Copy JSON" action — the Data Explorer's
  // row-expansion view already has its own top-level way to inspect/copy
  // data and doesn't want it competing with "View objects" for the same
  // row's attention. REPL/Query Editor leave this unset, keeping it.
  hideCopyButton?: boolean;
}

// Recursively strips __pylon_type__ before copying, so "Copy JSON" produces
// clean data rather than our internal polymorphic-type marker.
const stripInternal = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripInternal);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== "__pylon_type__")
        .map(([k, v]) => [k, stripInternal(v)])
    );
  }
  return value;
};

// Collapsible tree view for query results — toggleable object/array nodes,
// a "Copy JSON" button on row hover, and
// `<uuid>`/`<std::datetime>`/`module::Enum.Member` tags resolved from real
// schema data (see src/lib/schema/typeTags.ts) rather than guessed from the
// value's shape.
export const JsonTree: React.FC<JsonTreeProps> = ({
  value,
  className,
  valueShape,
  floatMarkers,
  onNavigateLink,
  rootPylonType,
  hideCopyButton,
}) => {
  const {data: schema} = useSchema();

  // Output
  return (
    <div className={clsx("font-mono text-sm", className)}>
      <JsonNode
        value={value}
        schema={schema}
        valueShape={valueShape}
        floatMarkers={floatMarkers}
        onNavigateLink={onNavigateLink}
        ownTypeOverride={rootPylonType}
        hideCopyButton={hideCopyButton}
        isRoot
      />
    </div>
  );
};

const CopyButton: React.FC<{value: unknown}> = ({value}) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(stripInternal(value), null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }}
      className="hidden shrink-0 items-center gap-1 rounded px-1 text-2xs tracking-wide text-fg-muted uppercase hover:text-fg group-hover/row:flex"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
};

interface JsonNodeProps {
  label?: string;
  value: unknown;
  schema: SchemaResponse | undefined;
  parentPylonType?: string;
  valueShape?: ValueShapeTag;
  floatMarkers?: FloatMarkerTree;
  onNavigateLink?: (pointer: SchemaPointer) => void;
  // Fallback for *this* node's own pylon type when its value has no
  // embedded __pylon_type__ marker — only ever passed at the root (see
  // JsonTree's rootPylonType), not threaded to recursive calls below.
  ownTypeOverride?: string;
  hideCopyButton?: boolean;
  // True only for JsonTree's own initial call, never threaded to recursive
  // calls below — an array *at the root* is always the query's own result
  // set (every call site passes the whole `objects` array here), never a
  // literal array<T> value, even if the query happens to select one (that
  // would still be one row *within* the set, one level deeper) — so it
  // always renders with {}/{}, regardless of ownPointer/valueShape.
  isRoot?: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  label,
  value,
  schema,
  parentPylonType,
  valueShape,
  floatMarkers,
  onNavigateLink,
  ownTypeOverride,
  hideCopyButton,
  isRoot,
}) => {
  const [open, setOpen] = useState(true);

  // This node's own field on its parent object, when there's schema info to
  // resolve one (schema-driven, not shape-driven — a link value is just a
  // plain nested object/array otherwise indistinguishable from a tuple's own
  // fields). Computed unconditionally (not just when onNavigateLink is
  // passed) since bracket style below needs it regardless of context.
  const ownPointer =
    parentPylonType && label !== undefined
      ? schema?.types.find((t) => qualname(t) === parentPylonType)?.pointers.find((p) => p.name === label)
      : undefined;
  // Used below to show a "View objects" action next to a link/multi-link
  // field — only when the caller actually wants that (see onNavigateLink).
  const linkPointer = ownPointer && (ownPointer.kind === "link" || ownPointer.kind === "multiLink") ? ownPointer : undefined;

  // A tuple/named-tuple value is JS-object-shaped (a dict or array) but
  // renders as a single tuple literal `(x := 1, y := 2)`, not as an
  // expandable tree node — this check must come before the generic
  // object/array branch below, which would otherwise treat it as one.
  if (valueShape?.kind === "namedTuple") {
    return (
      <div className="group/row flex items-center rounded pl-4 hover:bg-surface-hover">
        <div className="flex-1">
          {label !== undefined && <span className="text-(--syntax-name)">{label}: </span>}
          <ScalarValue value={value} typeTag={valueShapeToPointerTypeTag(valueShape, schema)} schema={schema} />
        </div>
        {!hideCopyButton && <CopyButton value={value} />}
      </div>
    );
  }

  if (value !== null && typeof value === "object") {
    const isArray = Array.isArray(value);
    // A free object (no schema type at all — e.g. `select { test := 1 }`)
    // still gets a label ("Object {...}") for an untyped shape, rather than
    // showing no label at all.
    const pylonType = !isArray ? ((value as {__pylon_type__?: string}).__pylon_type__ ?? ownTypeOverride ?? "Object") : undefined;
    const entries = isArray
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>).filter(([k]) => k !== "__pylon_type__");
    // A multi-link is a *set*, not a list — displayed with {}/{} like any
    // other object collection, not []/[] (reserved
    // for a real array<T> property), even though the JS value itself is a
    // plain array either way. The root array is always a query's own result
    // set too (see isRoot above), for the same reason.
    const isMultiLinkSet = ownPointer?.kind === "multiLink";
    const isRootSet = isRoot && isArray;
    const useListBrackets = isArray && !isMultiLinkSet && !isRootSet;
    const itemWord = isMultiLinkSet || isRootSet ? "object" : isArray ? "item" : "key";

    // Output
    return (
      <div>
        <div className="group/row flex items-center rounded hover:bg-surface-hover">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex shrink-0 items-center gap-1 text-left">
            <ChevronRight
              size={12}
              className={clsx("shrink-0 text-fg-muted transition-transform", open && "rotate-90")}
            />
            {label !== undefined && <span className="text-(--syntax-name)">{label}: </span>}
            {pylonType && <span className="text-fg-muted">{pylonType} </span>}
            <span className="text-fg-muted">
              {useListBrackets ? "[" : "{"}
              {!open && ` ${entries.length} ${itemWord}${entries.length === 1 ? "" : "s"} `}
              {!open && (useListBrackets ? "]" : "}")}
            </span>
          </button>
          {onNavigateLink && linkPointer && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateLink!(linkPointer);
              }}
              className="ml-1.5 flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-2xs font-medium text-accent hover:bg-accent/20 transition-colors duration-300"
            >
              View objects
              <ArrowRight size={10} />
            </button>
          )}
          {!hideCopyButton && (
            <>
              <div className="flex-1" />
              <CopyButton value={value} />
            </>
          )}
        </div>
        {open && (
          <div className="pl-4">
            {entries.map(([k, v]) => (
              <JsonNode
                key={k}
                label={isArray ? undefined : k}
                value={v}
                schema={schema}
                parentPylonType={pylonType ?? parentPylonType}
                valueShape={valueShapeChild(valueShape, isArray ? "0" : k)}
                floatMarkers={floatMarkerChild(floatMarkers, k)}
                onNavigateLink={onNavigateLink}
                hideCopyButton={hideCopyButton}
              />
            ))}
            <span className="text-fg-muted">{useListBrackets ? "]" : "}"}</span>
          </div>
        )}
      </div>
    );
  }

  const typeTag = valueShape
    ? valueShapeToPointerTypeTag(valueShape, schema)
    : label !== undefined
      ? lookupPointerTypeTag(schema, parentPylonType, label)
      : null;

  // Output
  return (
    <div className="group/row flex items-center rounded pl-4 hover:bg-surface-hover">
      <div className="flex-1">
        {label !== undefined && <span className="text-(--syntax-name)">{label}: </span>}
        <ScalarValue value={value} typeTag={typeTag} schema={schema} forceFloat={isFloatMarker(floatMarkers)} />
      </div>
      {!hideCopyButton && <CopyButton value={value} />}
    </div>
  );
};
