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
import {useEffect, useMemo, useRef, useState} from "react";
import clsx from "clsx";
import toast from 'react-hot-toast';
import { useVirtualizer } from "@tanstack/react-virtual";
import {useQuery} from "@tanstack/react-query";
import {ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ChevronRight, Link2, Menu, Trash2, Undo2} from "lucide-react";

import {api, type SchemaPointer, type SchemaResponse, type SchemaType} from "@/lib/api/client";
import {floatMarkerChild} from "@/lib/api/floatMarkers";
import {isSelfOrDescendant, qualname} from "@/lib/schema/inheritance";
import {lookupPointerTypeTag, pointerTypeTag} from "@/lib/schema/typeTags";
import {formatTupleType} from "@/lib/schema/tupleTypeCast";
import {useIsMobile} from "@/lib/hooks/useIsMobile";
import {JsonTree} from "@/ui/JsonTree";
import {ScalarValue} from "@/ui/ScalarValue";
import {DataEditorCell} from "@/ui/dataEditor/DataEditorCell";
import {LinkPropertyCell} from "@/ui/dataEditor/LinkPropertyCell";
import {useDataEditsStore, type EditValue, type UpdateLinkEdit} from "@/features/dataExplorer/state/editsStore";

export type SortDir = "ASC" | "DESC";
type Row = Record<string, unknown>;

// A displayed row is either fetched from the server or a not-yet-saved
// pending insert (sourced from the edits store, not the query result) —
// spliced onto the front of the grid.
type DisplayRow = {kind: "fetched"; row: Row} | {kind: "insert"; tempId: number};

// Link/multi-link "edit mode" for a nested link view — swaps the gutter's
// delete icon for a checkbox/radio wired to the *parent* object's pending
// link membership. `linkedIds` are the target ids already linked on the
// server (before any pending edits), needed to know a checkbox's starting
// checked state.
export interface LinkEditMode {
  parentId: string | number;
  parentObjectTypeName: string;
  pointerName: string;
  linkTypeName: string;
  single: boolean;
  linkedIds: Set<string>;
  // Each already-linked target's current link-property values (e.g.
  // ProductTag.weight), keyed by target id — seeds the property input's
  // starting value for a row that's checked but has no pending edit of its
  // own yet (see the linkProperties fallback below), so it doesn't render
  // blank just because the user hasn't touched it this session.
  linkedProperties?: Map<string, Record<string, unknown>>;
  // The junction (through-type)'s own properties (e.g. ProductTag.weight),
  // excluding "id" — undefined/empty when the multi-link has no through
  // type, or the through type declares no properties beyond id.
  throughPointers?: SchemaPointer[];
}

interface DataGridProps {
  pylonType: string; // "module::Name" of the row's own type, for type-tag lookups
  pointers: SchemaPointer[];
  rows: Row[];
  schema: SchemaResponse | undefined;
  sortField: string | null;
  sortDir: SortDir | null;
  onSort: (fieldName: string) => void;
  onNavigateLink: (row: Row, pointer: SchemaPointer) => void;
  // Opens the (non-URL) target picker for a pending insert row's own link —
  // a temp id has nothing to navigate to, so this is a separate callback
  // rather than reusing onNavigateLink's row-based signature.
  onNavigateInsertLink: (tempId: number, pointer: SchemaPointer) => void;
  linkEditMode?: LinkEditMode;
  // The junction (through-type)'s own properties (e.g. ProductTag.weight),
  // shown as extra columns even outside "Edit links" mode — only meaningful
  // for a nested view of a real persisted parent (the one query shape that
  // actually fetches `@name` values; see DataExplorerView.tsx). Ignored
  // while linkEditMode is set, which carries its own copy (the same
  // pointers, but rendered as editable inputs instead — see LinkEditMode.throughPointers).
  viewThroughPointers?: SchemaPointer[];
  // The parent link this nested view is showing, so a `viewThroughPointers`
  // column can be edited in place (via `setLinkTargetProperty`) without
  // switching to "Edit links" mode first — every row in this view is
  // already the linked target, so there's no pick/checkbox state to show,
  // just the property inputs. Same scope as `viewThroughPointers` (a real
  // persisted parent, not linkEditMode) — see DataExplorerView.tsx.
  viewLinkContext?: {
    parentId: string | number;
    parentObjectTypeName: string;
    pointerName: string;
    linkTypeName: string;
  };
}

// Gutter, the row's own pointers, and through-type junction properties —
// junction columns render last (not grouped with the pinned gutter/id block,
// which assumes its second column is always the "id" pointer).
type GridColumn = {kind: "gutter"} | {kind: "through"; pointer: SchemaPointer} | {kind: "pointer"; pointer: SchemaPointer};

const columnKey = (col: GridColumn): string =>
  col.kind === "gutter" ? "__gutter__" : col.kind === "through" ? `@${col.pointer.name}` : col.pointer.name;

// Only plain scalar/enum properties (other than id) are sortable — links,
// multi-links, and computed pointers aren't.
const isSortable = (pointer: SchemaPointer) =>
  (pointer.kind === "property" || pointer.kind === "enum") && pointer.name !== "id";

// The type description shown below a pointer's name in its column header —
// e.g. "std::str", "default::Gender", "multi default::Tag".
const headerTypeLabel = (pointer: SchemaPointer): string | null => {
  if (pointer.kind === "link" || pointer.kind === "enum") return pointer.target ?? null;
  if (pointer.kind === "multiLink") return pointer.target ? `multi ${pointer.target}` : "multi";
  if (pointer.kind === "namedTuple") return pointer.target ?? (pointer.members ? formatTupleType(pointer.members) : "tuple");
  if (pointer.kind === "array") return `array<${pointer.element?.typeName ?? pointer.element?.target ?? "..."}>`;
  return pointer.typeName ?? null;
};

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 44;

// Fading right-edge gradient marking the end of the pinned-column block —
// one `after:` per pinned block (header, and each row's pinned cells), not
// per-cell, since pinning now groups gutter+id into a single sticky block
// rather than each sticky cell being independently positioned.
const STICKY_COL_SHADOW = "after:absolute after:top-0 after:-right-1.25 after:-bottom-px after:w-1 after:bg-linear-(--bg-sticky-col-fadeout) after:content-['']";

// Wide enough for the row-number/delete-icon area plus a leading expand
// chevron toggle (see GutterCell).
const GUTTER_WIDTH = 56;
const THROUGH_COLUMN_DEFAULT_WIDTH = 112;
const COLUMN_DEFAULT_WIDTH = 180;
const COLUMN_MIN_WIDTH = 60;
// Wide enough for a full uuidv7 (36 chars, e.g.
// "019f3395-7177-787e-b3d0-97acd3b9ffc0") in the grid's font-mono text-sm.
const ID_COLUMN_WIDTH_DESKTOP = 320;
const ID_COLUMN_WIDTH_MOBILE = 180;

// Non-computed, non-id property/enum/namedTuple/array cells are
// double-click editable. A readonly pointer is still settable once, at
// insert time — only post-creation updates are blocked (Pylon's own
// readonly rule).
const isEditableCell = (pointer: SchemaPointer, isInsertRow: boolean) =>
  (pointer.kind === "property" || pointer.kind === "enum" || pointer.kind === "namedTuple" || pointer.kind === "array") &&
  pointer.name !== "id" &&
  (!pointer.readonly || isInsertRow);

// A pending insert's temp id, or a fetched row's real uuid — same identity
// DataEditsStore keys edits by (see ActivePropertyEdit.objectId).
const rowObjectId = (row: DisplayRow): string | number => (row.kind === "insert" ? row.tempId : ((row.row.id as string | undefined) ?? ""));

// Just this type's own scalar-ish pointers (no links) — used both for the
// expanded row's own top-level shape and for a link target's one-level-deep
// preview inside it.
const scalarPointerNames = (pointers: SchemaPointer[]): string =>
  pointers
    .filter((p) => p.kind !== "link" && p.kind !== "multiLink")
    .map((p) => `\`${p.name}\``)
    .join(", ");

// The row-expansion view's own query shape — every scalar property plus one
// level of link/multi-link data (the target's own scalar properties only,
// capped at 10 items for a multi-link, with a `__count_*` sibling for the
// true total). Deliberately NOT a `**` deep splat: Pylon schemas can have
// cyclic/self-referential links (e.g. Person.friends: MultiLink[Person]),
// and a blind deep splat risks either runaway recursion or a very large
// result depending on how well pylon-core's own cycle handling holds up —
// a one-level-plus-lazy-load approach instead of a blind full-depth fetch.
const buildExpandedRowShape = (schemaType: SchemaType, schema: SchemaResponse): string =>
  schemaType.pointers
    .map((p) => {
      if (p.kind !== "link" && p.kind !== "multiLink") return `\`${p.name}\``;
      const [module, name] = (p.target ?? "").split("::");
      const targetType = schema.types.find((t) => t.module === module && t.name === name);
      const targetShape = targetType ? scalarPointerNames(targetType.pointers) : "id";
      if (p.kind === "multiLink") {
        return `\`${p.name}\`: { ${targetShape} } limit 10, \`__count_${p.name}\` := count(.\`${p.name}\`)`;
      }
      return `\`${p.name}\`: { ${targetShape} }`;
    })
    .join(", ");

// Virtualized (rows *and* columns) data grid — a div-based rewrite of the old
// <table>-based grid: cells are absolutely positioned via computed offsets
// from two @tanstack/react-virtual instances (one vertical, one horizontal)
// instead of relying on table/colgroup layout. Pinned columns (gutter, and
// id on desktop) are grouped into one `position: sticky; left: 0` block per
// row/header — never virtualized, since it's always a small fixed set.
export const DataGrid: React.FC<DataGridProps> = ({
  pylonType,
  pointers,
  rows,
  schema,
  sortField,
  sortDir,
  onSort,
  onNavigateLink,
  onNavigateInsertLink,
  linkEditMode,
  viewThroughPointers,
  viewLinkContext,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // The expanded-row view's own content needs to stay within the visible
  // viewport, not stretch out to the grid's full (horizontally scrollable)
  // content width — otherwise its own flex-1 label pushes the "View
  // objects" action out past the right edge, only visible once scrolled
  // all the way over. Tracked via ResizeObserver rather than read once,
  // since the panel itself can resize (window resize, sidebar toggle, ...).
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setViewportWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Per-column widths (keyed by columnKey) — drag-resized via the handle on
  // each header's right edge; unset columns fall back to defaultColumnWidth.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const startResize = (key: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = e.currentTarget.parentElement?.getBoundingClientRect().width ?? COLUMN_DEFAULT_WIDTH;
    const startX = e.clientX;
    const onMove = (moveEvent: MouseEvent) => {
      const next = Math.max(COLUMN_MIN_WIDTH, startWidth + (moveEvent.clientX - startX));
      setColumnWidths((prev) => ({...prev, [key]: next}));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const insertEdits = useDataEditsStore((s) => s.insertEdits);
  const deleteEdits = useDataEditsStore((s) => s.deleteEdits);
  const propertyEdits = useDataEditsStore((s) => s.propertyEdits);
  const linkEdits = useDataEditsStore((s) => s.linkEdits);
  const activePropertyEdit = useDataEditsStore((s) => s.activePropertyEdit);
  const startEditingCell = useDataEditsStore((s) => s.startEditingCell);
  const commitPropertyEdit = useDataEditsStore((s) => s.commitPropertyEdit);
  const discardActiveEdit = useDataEditsStore((s) => s.discardActiveEdit);
  const clearPropertyEdit = useDataEditsStore((s) => s.clearPropertyEdit);
  const toggleRowDelete = useDataEditsStore((s) => s.toggleRowDelete);
  const removeInsertedRow = useDataEditsStore((s) => s.removeInsertedRow);
  const addLinkUpdate = useDataEditsStore((s) => s.addLinkUpdate);
  const removeLinkUpdate = useDataEditsStore((s) => s.removeLinkUpdate);
  const toggleLinkInsert = useDataEditsStore((s) => s.toggleLinkInsert);
  const setLinkTargetProperty = useDataEditsStore((s) => s.setLinkTargetProperty);

  // A pending insert also shows on every ancestor type's own grid view (not
  // just its own concrete type): inserting a Person on the abstract Account
  // grid stays visible there (only Account's own pointers editable) and
  // again once you drill into the concrete Person type (its additional
  // pointers now editable too), rather than only ever appearing after
  // switching to the concrete type.
  const displayRows = useMemo<DisplayRow[]>(() => {
    const viewedType = schema?.types.find((t) => qualname(t) === pylonType);
    const pendingInserts = Array.from(insertEdits.values()).filter((ins) => {
      if (ins.objectTypeName === pylonType) return true;
      if (!schema || !viewedType) return false;
      const insertType = schema.types.find((t) => qualname(t) === ins.objectTypeName);
      return insertType ? isSelfOrDescendant(schema, insertType, pylonType) : false;
    });
    const all = [
      ...pendingInserts.map((ins): DisplayRow => ({kind: "insert", tempId: ins.id})),
      ...rows.map((row): DisplayRow => ({kind: "fetched", row})),
    ];
    if (!linkEditMode) return all;
    // An object can never be its own link target — only actually excludes
    // anything for a self-referential pointer (e.g. Person.friends:
    // MultiLink[Person]), where the row being edited would otherwise show up
    // as a pickable candidate for its own pointer too.
    return all.filter((r) => (r.kind === "insert" ? r.tempId : ((r.row.id as string | undefined) ?? "")) !== linkEditMode.parentId);
  }, [insertEdits, pylonType, rows, linkEditMode, schema]);

  // Row expansion (inline object inspector) — keyed by real object id, so
  // only fetched rows (never pending inserts, which have no real id yet)
  // can expand. Collapsing forgets it entirely (not just hiding it) so
  // re-expanding the same row later refetches rather than showing stale
  // data.
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const toggleRowExpanded = (objectId: string) =>
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(objectId)) next.delete(objectId);
      else next.add(objectId);
      return next;
    });

  // The actual rendered row sequence: each display row, plus (immediately
  // after it) an extra "expansion" entry for any fetched row currently
  // expanded — interleaved here rather than toggled via a per-row nested
  // state, so it's just one more entry in the same virtualized list instead
  // of a special case the virtualizer needs to know about.
  type GridRowEntry = {kind: "data"; displayRow: DisplayRow} | {kind: "expansion"; objectId: string};
  const gridRowEntries = useMemo<GridRowEntry[]>(() => {
    const out: GridRowEntry[] = [];
    for (const displayRow of displayRows) {
      out.push({kind: "data", displayRow});
      if (displayRow.kind === "fetched") {
        const id = displayRow.row.id as string | undefined;
        if (id && expandedRowIds.has(id)) out.push({kind: "expansion", objectId: id});
      }
    }
    return out;
  }, [displayRows, expandedRowIds]);
  // moveToAdjacentEditableCell below computes positions in terms of
  // `displayRows`, but the row virtualizer now indexes `gridRowEntries` —
  // this converts one to the other for its scrollToIndex call.
  const gridIndexForDisplayRow = (displayRow: DisplayRow) =>
    gridRowEntries.findIndex((e) => e.kind === "data" && e.displayRow === displayRow);

  const throughPointers = linkEditMode?.throughPointers ?? viewThroughPointers ?? [];
  const allColumns = useMemo<GridColumn[]>(() => {
    const cols: GridColumn[] = [{kind: "gutter"}];
    for (const p of pointers) cols.push({kind: "pointer", pointer: p});
    for (const tp of throughPointers) cols.push({kind: "through", pointer: tp});
    return cols;
  }, [pointers, throughPointers]);

  const defaultColumnWidth = (col: GridColumn): number => {
    if (col.kind === "gutter") return GUTTER_WIDTH;
    if (col.kind === "through") return THROUGH_COLUMN_DEFAULT_WIDTH;
    if (col.pointer.name === "id") return isMobile ? ID_COLUMN_WIDTH_MOBILE : ID_COLUMN_WIDTH_DESKTOP;
    return COLUMN_DEFAULT_WIDTH;
  };
  const columnWidth = (col: GridColumn): number => columnWidths[columnKey(col)] ?? defaultColumnWidth(col);

  // Pinned prefix: gutter always, id too on desktop (un-stickies on mobile,
  // where the gutter becomes the last pinned column instead) — assumes id is
  // the first pointer when present, matching Pylon's own schema convention.
  const pinnedCount = !isMobile && pointers[0]?.name === "id" ? 2 : 1;
  const pinnedColumns = allColumns.slice(0, pinnedCount);
  const scrollableColumns = allColumns.slice(pinnedCount);
  const pinnedWidth = pinnedColumns.reduce((sum, c) => sum + columnWidth(c), 0);

  const rowVirtualizer = useVirtualizer({
    count: gridRowEntries.length,
    getScrollElement: () => scrollRef.current,
    // An expansion entry's real height isn't known until its content
    // renders (it depends on the fetched object's own shape) — this initial
    // guess only matters for the first paint; measureElement (passed as
    // this row's ref below) corrects it afterward.
    estimateSize: (index) => (gridRowEntries[index].kind === "expansion" ? 160 : ROW_HEIGHT),
    overscan: 10,
    // measureElement's cache is keyed by item identity — without this, it
    // defaults to raw array index, so collapsing a row (which removes its
    // expansion entry and shifts every later index down by one) makes each
    // shifted row inherit whatever size was previously cached for that
    // index rather than its own, leaving stale gaps behind.
    getItemKey: (index) => {
      const e = gridRowEntries[index];
      if (e.kind === "expansion") return `expansion-${e.objectId}`;
      return e.displayRow.kind === "insert" ? `insert-${e.displayRow.tempId}` : ((e.displayRow.row.id as string | undefined) ?? `row-${index}`);
    },
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: scrollableColumns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => columnWidth(scrollableColumns[index]),
    overscan: 5,
  });

  // estimateSize's return value isn't itself a tracked dependency inside
  // @tanstack/virtual-core's measurement cache — a resize (which changes what
  // estimateSize returns for an index, not the column count) needs an
  // explicit remeasure to actually take effect.
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnWidths]);

  // Tab/Shift+Tab while editing a cell — advances to the next/previous
  // editable cell in reading order (row-major: across a row's pointers, then
  // down to the next row), skipping non-editable pointers (links, readonly
  // post-creation, id). Stops at the first/last row rather than wrapping —
  // `displayRows` holds the *entire* dataset (virtualization only limits
  // what's rendered), so this reaches rows outside the current scroll
  // viewport too; scrollToIndex brings the target row into view when that
  // happens.
  const moveToAdjacentEditableCell = (backwards: boolean) => {
    if (!activePropertyEdit) return;
    const rowIndex = displayRows.findIndex((r) => rowObjectId(r) === activePropertyEdit.objectId);
    const pointerIndex = pointers.findIndex((p) => p.name === activePropertyEdit.pointerName);
    if (rowIndex === -1 || pointerIndex === -1) return;

    const step = backwards ? -1 : 1;
    let r = rowIndex;
    let p = pointerIndex;
    const totalCells = displayRows.length * pointers.length;
    for (let i = 0; i < totalCells; i++) {
      p += step;
      if (p < 0) {
        p = pointers.length - 1;
        r -= 1;
      } else if (p >= pointers.length) {
        p = 0;
        r += 1;
      }
      if (r < 0 || r >= displayRows.length) return;

      const candidateRow = displayRows[r];
      const candidatePointer = pointers[p];
      if (isEditableCell(candidatePointer, candidateRow.kind === "insert")) {
        startEditingCell({objectId: rowObjectId(candidateRow), objectTypeName: pylonType, pointerName: candidatePointer.name});
        if (r !== rowIndex) rowVirtualizer.scrollToIndex(gridIndexForDisplayRow(candidateRow), {align: "auto"});
        return;
      }
    }
  };

  const totalContentWidth = pinnedWidth + columnVirtualizer.getTotalSize();

  const renderHeaderCellContent = (col: GridColumn) => {
    if (col.kind === "gutter") return <Menu size={16} strokeWidth={2.25} className="text-fg-muted" />;
    if (col.kind === "through") {
      return (
        <>
          <div className="truncate font-[450] text-2sm text-fg">@{col.pointer.name}</div>
          {col.pointer.typeName && <div className="truncate text-2xs font-normal text-fg-muted">{col.pointer.typeName}</div>}
        </>
      );
    }
    const pointer = col.pointer;
    const sortable = isSortable(pointer);
    const typeLabel = headerTypeLabel(pointer);
    return (
      <button
        type="button"
        disabled={!sortable}
        onClick={() => onSort(pointer.name)}
        className="flex h-full w-full items-center justify-between gap-2 text-left disabled:cursor-default"
      >
        <span className="min-w-0">
          <div className="truncate font-[450] text-2sm text-fg">
            {pointer.name}
            {pointer.kind === "computed" && ":="}
          </div>
          {typeLabel && <div className="truncate text-2xs font-normal text-fg-muted">{typeLabel}</div>}
        </span>
        {sortable &&
          (sortField === pointer.name ? (
            sortDir === "ASC" ? (
              <ArrowUp size={14} className="shrink-0 text-accent" />
            ) : (
              <ArrowDown size={14} className="shrink-0 text-accent" />
            )
          ) : (
            <ArrowUpDown size={14} className="shrink-0 text-fg-muted" />
          ))}
      </button>
    );
  };

  // Output
  return (
    <div
      ref={scrollRef}
      role="grid"
      className="flex-1 overflow-auto bg-surface text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{width: totalContentWidth, minWidth: "100%", minHeight: "100%"}}>
        <div className="sticky top-0 z-20 w-full border-b border-border bg-header" style={{height: HEADER_HEIGHT}} role="row">
          <div className={clsx("sticky left-0 z-10 flex h-full bg-header", STICKY_COL_SHADOW)} style={{width: pinnedWidth}}>
            {pinnedColumns.map((col) => (
              <div
                key={columnKey(col)}
                role="columnheader"
                className={clsx("relative h-full shrink-0 px-2 py-1.5 font-mono whitespace-nowrap", col.kind === "gutter" && "flex items-center justify-center")}
                style={{ width: columnWidth(col) }}
              >
                {renderHeaderCellContent(col)}
                {col.kind !== "gutter" && (
                  <div
                    onMouseDown={startResize(columnKey(col))}
                    className="absolute inset-y-0 right-0 w-1 cursor-col-resize select-none hover:bg-accent/50 active:bg-accent"
                  />
                )}
              </div>
            ))}
          </div>
          {columnVirtualizer.getVirtualItems().map((vc) => {
            const col = scrollableColumns[vc.index];
            return (
              <div
                key={columnKey(col)}
                role="columnheader"
                className="absolute top-0 h-full px-2 py-1.5 font-mono whitespace-nowrap"
                style={{ left: pinnedWidth + vc.start, width: vc.size }}
              >
                {renderHeaderCellContent(col)}
                <div
                  onMouseDown={startResize(columnKey(col))}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-1 cursor-col-resize select-none"
                >
                  <div className="w-px h-[70%] bg-current/25" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative w-full" style={{height: rowVirtualizer.getTotalSize()}}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = gridRowEntries[virtualRow.index];
            if (entry.kind === "expansion") {
              return (
                <div
                  key={`expansion-${entry.objectId}`}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="row"
                  className="absolute left-0 w-full border-b border-border bg-surface"
                  style={{top: virtualRow.start}}
                >
                  <div className="sticky left-0 bg-surface" style={{width: viewportWidth || "100%"}}>
                    {schema && (
                      <ExpandedRowContent objectId={entry.objectId} pylonType={pylonType} schema={schema} onNavigateLink={onNavigateLink} />
                    )}
                  </div>
                </div>
              );
            }
            const displayRow = entry.displayRow;
            const isInsertRow = displayRow.kind === "insert";
            const objectId = rowObjectId(displayRow);
            const isDeletedRow = !isInsertRow && deleteEdits.has(objectId as string);

            let linkChecked = false;
            let linkProperties: Record<string, EditValue> | undefined;
            if (linkEditMode) {
              const parentKey = `${linkEditMode.parentId}__${linkEditMode.pointerName}`;
              const parentEdit = linkEdits.get(parentKey);
              if (isInsertRow) {
                linkChecked = parentEdit?.inserts.has(objectId as number) ?? false;
                linkProperties = parentEdit?.insertProperties.get(objectId as number);
              } else {
                const change = parentEdit?.changes.get(objectId as string);
                // A single-link's `changes` map holds *at most one* entry
                // (addLinkUpdate replaces it wholesale, never appends — see
                // editsStore.ts) — so once any edit exists for this pointer
                // at all, `changes` is the full, authoritative new state:
                // whichever row it names is linked, every other row isn't,
                // regardless of what was linked on the server before. Only
                // fall back to the server's own linkedIds when the pointer
                // hasn't been touched this session yet. A multi-link's
                // `changes` are incremental adds/removes on top of the
                // server state, so untouched rows there must still consult
                // linkedIds even after other rows have been edited.
                const singleLinkReplaced = linkEditMode.single && !!parentEdit;
                linkChecked = change
                  ? change.kind === "add"
                  : singleLinkReplaced
                    ? false
                    : linkEditMode.linkedIds.has(objectId as string);
                linkProperties = change?.properties;
                // No pending edit of its own yet — an already-linked row
                // still has its *existing* server-side property values to
                // show, so the input isn't blank just because the user
                // hasn't touched it this session.
                if (!linkProperties && linkChecked) {
                  const existing = linkEditMode.linkedProperties?.get(objectId as string);
                  if (existing) {
                    linkProperties = Object.fromEntries(
                      Object.entries(existing).map(([k, v]) => [k, {valid: true, value: v} as EditValue])
                    );
                  }
                }
              }
            } else if (viewLinkContext && !isInsertRow) {
              // Nested view of a real persisted parent, not in "Edit links"
              // mode — every row here is already the linked target (no
              // pick/checkbox state), so its through-properties are editable
              // in place: a pending edit from this same session wins, else
              // fall back to the value the nested-view query already fetched
              // inline (`@name`, from viewThroughPointers' shape element).
              const parentKey = `${viewLinkContext.parentId}__${viewLinkContext.pointerName}`;
              const change = linkEdits.get(parentKey)?.changes.get(objectId as string);
              linkProperties = change?.properties;
            }

            const onCopyToClipboard = (value: string) => {
              if (!value) return;

              navigator.clipboard.writeText(value).then(() => {
                toast.success('Copied ID to clipboard');
              });
            };
            const onToggleDelete = () => {
              if (isInsertRow) removeInsertedRow(objectId as number);
              else toggleRowDelete(objectId as string, pylonType);
            };
            const onToggleLink = () => {
              if (!linkEditMode) return;
              const {parentId, parentObjectTypeName, pointerName, linkTypeName, single} = linkEditMode;
              if (isInsertRow) {
                toggleLinkInsert(parentId, parentObjectTypeName, pointerName, linkTypeName, objectId as number, single);
              } else if (linkChecked) {
                removeLinkUpdate(parentId, parentObjectTypeName, pointerName, linkTypeName, objectId as string);
              } else {
                addLinkUpdate(
                  parentId,
                  parentObjectTypeName,
                  pointerName,
                  linkTypeName,
                  {id: objectId as string, typename: pylonType},
                  single,
                  linkEditMode.linkedIds.has(objectId as string)
                );
              }
            };

            const renderPointerCell = (pointer: SchemaPointer, style: React.CSSProperties) => {
              const isLink = pointer.kind === "link" || pointer.kind === "multiLink";
              const cellEditable = isEditableCell(pointer, isInsertRow);
              const isEditing = activePropertyEdit?.objectId === objectId && activePropertyEdit.pointerName === pointer.name;

              const rawFetchedValue = displayRow.kind === "fetched" ? displayRow.row[pointer.name] : undefined;
              const insertValue = isInsertRow ? insertEdits.get(objectId as number)?.data[pointer.name] : undefined;
              const pendingEdit = !isInsertRow ? propertyEdits.get(`${objectId}__${pointer.name}`) : undefined;
              const editValue = insertValue ?? pendingEdit?.value;
              const hasEdit = editValue !== undefined;
              const isInvalid = hasEdit && !editValue.valid;
              const displayValue = hasEdit ? (editValue.valid ? editValue.value : editValue.raw) : rawFetchedValue;
              // A new row's required-with-no-default property has nothing to
              // show yet but "{}" — same as an optional one at rest — so
              // without its own highlight there's no way to tell it still
              // needs a value before commit can succeed (matches
              // generateStatements.ts's own missing-required-property check).
              const isMissingRequired =
                isInsertRow && !isLink && !hasEdit && pointer.required && !pointer.hasDefault && pointer.name !== "id";

              return (
                <div
                  key={pointer.name}
                  role="gridcell"
                  style={style}
                  onClick={() => {
                    if (!isLink) return;
                    if (isInsertRow) onNavigateInsertLink(objectId as number, pointer);
                    else onNavigateLink(displayRow.kind === "fetched" ? displayRow.row : {}, pointer);
                  }}
                  onDoubleClick={() => {
                    if (!cellEditable && pointer.name !== 'id') return;
                    if (pointer.name === 'id') {
                      if (typeof displayValue === "string") {
                        onCopyToClipboard(displayValue);
                      }
                    } else {
                      startEditingCell({objectId, objectTypeName: pylonType, pointerName: pointer.name});
                    }
                  }}
                  className={clsx(
                    "h-full shrink-0 font-mono",
                    // Editing drops the cell's own padding so the editor
                    // inside (ScalarMemberInput et al.) can sit flush
                    // against the cell's edges, instead of being inset
                    // within it.
                    isEditing ? "p-0" : "px-2 py-2.5",
                    isLink && "cursor-pointer",
                    // Hints a cell is double-click-editable before the user
                    // commits to it — a ring (not border) so it draws inset,
                    // inside the existing border-box, rather than shifting
                    // layout.
                    cellEditable && !isEditing && "cursor-text hover:ring-[1.5px] hover:ring-inset hover:ring-accent",
                    isMissingRequired && !isEditing && "border-l-2 border-l-red-500 bg-red-500/10"
                  )}
                >
                  {isEditing ? (
                    <DataEditorCell
                      pointer={pointer}
                      schema={schema!}
                      initialValue={displayValue}
                      onCommit={commitPropertyEdit}
                      onDiscard={discardActiveEdit}
                      onTabNext={moveToAdjacentEditableCell}
                    />
                  ) : (
                    <div className="h-full overflow-hidden text-ellipsis whitespace-nowrap">
                      {isLink ? (
                        isInsertRow ? (
                          <InsertLinkCell tempId={objectId as number} pointer={pointer} linkEdits={linkEdits} />
                        ) : (
                          <LinkCell value={rawFetchedValue} pointer={pointer} />
                        )
                      ) : (
                        <span className={clsx("flex items-center gap-1", isInvalid && "text-red-500")}>
                          {isInvalid ? (
                            <span>{editValue.raw || "(empty)"}</span>
                          ) : (
                            <ScalarValue
                              value={displayValue}
                              typeTag={lookupPointerTypeTag(schema, pylonType, pointer.name)}
                              schema={schema}
                              compact
                            />
                          )}
                          {hasEdit && !isInsertRow && (
                            <button
                              type="button"
                              title="Undo edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearPropertyEdit(objectId, pointer.name);
                              }}
                              className="text-orange-500 hover:text-orange-400"
                            >
                              <Undo2 size={14} strokeWidth={1.75} />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div
                key={isInsertRow ? `insert-${objectId}` : (objectId as string)}
                role="row"
                className={clsx(
                  "group/row absolute left-0 border-b border-border hover:bg-surface-hover",
                  isDeletedRow && "pointer-events-none opacity-50"
                )}
                style={{top: virtualRow.start, width: "100%", height: ROW_HEIGHT}}
              >
                <div
                  className={clsx("sticky left-0 z-10 flex h-full bg-surface group-hover/row:bg-surface-hover", STICKY_COL_SHADOW)}
                  style={{width: pinnedWidth}}
                >
                  {pinnedColumns.map((col) => {
                    if (col.kind === "gutter") {
                      return (
                        <div
                          key="__gutter__"
                          role="gridcell"
                          className={clsx(
                            "h-full shrink-0 border-l-2 px-2 py-2.5 text-right font-mono text-xs text-fg-muted",
                            isInsertRow ? "border-l-green-500" : isDeletedRow ? "border-l-red-500" : "border-l-transparent"
                          )}
                          style={{width: columnWidth(col)}}
                        >
                          <GutterCell
                            isInsertRow={isInsertRow}
                            isDeletedRow={isDeletedRow}
                            linkEditMode={linkEditMode !== undefined}
                            linkChecked={linkChecked}
                            linkSingle={linkEditMode?.single ?? false}
                            rowIndex={virtualRow.index}
                            onToggleDelete={onToggleDelete}
                            onToggleLink={onToggleLink}
                            canExpand={!isInsertRow && linkEditMode === undefined}
                            expanded={typeof objectId === "string" && expandedRowIds.has(objectId)}
                            onToggleExpand={() => {
                              if (typeof objectId === "string") toggleRowExpanded(objectId);
                            }}
                          />
                        </div>
                      );
                    }
                    return renderPointerCell(col.pointer, {width: columnWidth(col)});
                  })}
                </div>
                {columnVirtualizer.getVirtualItems().map((vc) => {
                  const col = scrollableColumns[vc.index];
                  const positionStyle: React.CSSProperties = {
                    position: "absolute",
                    top: 0,
                    left: pinnedWidth + vc.start,
                    width: vc.size,
                    height: ROW_HEIGHT,
                  };
                  if (col.kind === "through") {
                    if (linkEditMode) {
                      return (
                        <div
                          key={`@${col.pointer.name}`}
                          role="gridcell"
                          style={positionStyle}
                          className={clsx("h-full", linkChecked ? "p-0" : "px-2 py-2.5")}
                        >
                          <LinkPropertyCell
                            pointer={col.pointer}
                            schema={schema!}
                            value={linkProperties?.[col.pointer.name]}
                            disabled={!linkChecked}
                            onChange={(value) => {
                              const {parentId, parentObjectTypeName, pointerName, linkTypeName} = linkEditMode;
                              setLinkTargetProperty(parentId, parentObjectTypeName, pointerName, linkTypeName, objectId, col.pointer.name, value);
                            }}
                          />
                        </div>
                      );
                    }
                    if (viewLinkContext && !isInsertRow) {
                      // Same nested view, outside "Edit links" mode — still
                      // editable in place, same as a regular property cell:
                      // a pending edit from this session wins, else fall
                      // back to the value already fetched inline (`@name`).
                      const rawValue = displayRow.kind === "fetched" ? displayRow.row[`@${col.pointer.name}`] : undefined;
                      const value: EditValue | undefined =
                        linkProperties?.[col.pointer.name] ?? (rawValue !== undefined ? {valid: true, value: rawValue} : undefined);
                      return (
                        <div key={`@${col.pointer.name}`} role="gridcell" style={positionStyle} className="h-full p-0">
                          <LinkPropertyCell
                            pointer={col.pointer}
                            schema={schema!}
                            value={value}
                            disabled={false}
                            onChange={(newValue) => {
                              const {parentId, parentObjectTypeName, pointerName, linkTypeName} = viewLinkContext;
                              setLinkTargetProperty(parentId, parentObjectTypeName, pointerName, linkTypeName, objectId, col.pointer.name, newValue);
                            }}
                          />
                        </div>
                      );
                    }
                    // Read-only fallback (no link context at all — shouldn't
                    // normally happen, since a through column is only added
                    // when one of the above is set).
                    const rawValue = displayRow.kind === "fetched" ? displayRow.row[`@${col.pointer.name}`] : undefined;
                    return (
                      <div key={`@${col.pointer.name}`} role="gridcell" style={positionStyle} className="h-full px-2 py-2.5 font-mono">
                        <ScalarValue value={rawValue} typeTag={pointerTypeTag(col.pointer, schema!)} schema={schema} compact />
                      </div>
                    );
                  }
                  if (col.kind === "gutter") return null; // gutter is always pinned, never scrollable
                  return renderPointerCell(col.pointer, positionStyle);
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface GutterCellProps {
  isInsertRow: boolean;
  isDeletedRow: boolean;
  linkEditMode: boolean;
  linkChecked: boolean;
  linkSingle: boolean;
  rowIndex: number;
  onToggleDelete: () => void;
  onToggleLink: () => void;
  // Row-expansion (inline object inspector) toggle — only offered for real,
  // persisted rows outside link-edit mode (see the call site).
  canExpand: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}

const GutterCell: React.FC<GutterCellProps> = ({
  isInsertRow,
  isDeletedRow,
  linkEditMode,
  linkChecked,
  linkSingle,
  rowIndex,
  onToggleDelete,
  onToggleLink,
  canExpand,
  expanded,
  onToggleExpand,
}) => {
  let content: React.ReactNode;
  if (linkEditMode) {
    // A custom button in every state (never a native input) — sidestepping
    // a real bug a native radio/checkbox has here: clicking a *different*
    // row's native radio
    // fires that row's own onChange, but the previously-checked row's own
    // input never gets one (browsers only fire onChange for the input whose
    // own checked state actually changed via user interaction — the
    // previously-checked one's checked prop flips from true to false purely
    // by React re-rendering it, which isn't a "change event" at all), so its
    // visual state relied entirely on the checked prop taking effect — a
    // plain button re-rendered off the same linkChecked prop has no such
    // gap. Single-link (radio) renders fully rounded; multi-link (checkbox)
    // renders a square with slightly rounded corners.
    content = (
      <button
        type="button"
        onClick={onToggleLink}
        title={linkChecked ? "Unlink" : "Link"}
        className={clsx(
          "flex h-4 w-4 shrink-0 items-center justify-center border-2",
          linkSingle ? "rounded-full" : "rounded-[3px]",
          linkChecked ? "border-transparent bg-accent text-accent-fg" : "border-border bg-surface hover:border-accent"
        )}
      >
        {linkChecked && <Link2 size={10} strokeWidth={2.5} />}
      </button>
    );
  } else if (isInsertRow) {
    content = (
      <button type="button" onClick={onToggleDelete} title="Remove" className="flex h-full w-full items-center justify-end text-fg-muted hover:text-red-500">
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    );
  } else if (isDeletedRow) {
    content = (
      <button type="button" onClick={onToggleDelete} title="Undo delete" className="flex h-full w-full items-center justify-end text-fg-muted hover:text-fg">
        <Undo2 size={12} strokeWidth={1.75} />
      </button>
    );
  } else {
    content = (
      <button
        type="button"
        onClick={onToggleDelete}
        title="Delete"
        className="group/gutter flex h-full w-full items-center justify-end text-fg-muted hover:text-red-500"
      >
        <span className="group-hover/gutter:hidden">{rowIndex + 1}</span>
        <Trash2 size={16} strokeWidth={1.75} className="hidden group-hover/gutter:block" />
      </button>
    );
  }

  return (
    <div className="flex h-full w-full items-stretch gap-1">
      {canExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          title={expanded ? "Collapse" : "Expand"}
          className="flex w-4 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
        >
          <ChevronRight size={12} strokeWidth={2} className={clsx("shrink-0 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">{content}</div>
    </div>
  );
};

// The expanded row's own content — fetches the full object (one level of
// links deep, see buildExpandedRowShape) and renders it with the same
// JsonTree used by the REPL/Query Editor's own results, plus "View objects"
// actions on link fields (wired to the same nested-view navigation a link
// cell click already uses elsewhere in this grid).
const ExpandedRowContent: React.FC<{
  objectId: string;
  pylonType: string;
  schema: SchemaResponse;
  onNavigateLink: (row: Row, pointer: SchemaPointer) => void;
}> = ({objectId, pylonType, schema, onNavigateLink}) => {
  const schemaType = schema.types.find((t) => qualname(t) === pylonType);

  const dataQuery = useQuery({
    queryKey: ["dataExplorer", "expandedRow", objectId],
    queryFn: async () => {
      const shapeText = buildExpandedRowShape(schemaType!, schema);
      const res = await api.runQuery(`select ${pylonType} { ${shapeText} } filter .id = <uuid>$objectId`, {objectId});
      const row = res.objects[0] as Row | undefined;
      if (!row) return null;
      // __count_* fields are internal (a multi-link's true total, beyond
      // the 10-item preview cap) — not meant to render as their own entry.
      const cleaned = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("__count_"))) as Row;
      // res.shape (the compiled query's own value-shape tag) is what lets
      // JsonTree tell a structural tuple apart from a plain nested object —
      // same convention ResultPanel.tsx/ReplEntry.tsx already use for their
      // own query results. res.floatMarkers aligns with the whole objects
      // array; this view only ever renders row 0.
      return {row: cleaned, valueShape: res.shape, floatMarkers: floatMarkerChild(res.floatMarkers, "0")};
    },
    enabled: !!schemaType,
  });

  return (
    <div className="px-4 py-3">
      {dataQuery.isLoading ? (
        <div className="text-sm text-fg-muted">Loading data…</div>
      ) : dataQuery.data ? (
        <JsonTree
          value={dataQuery.data.row}
          valueShape={dataQuery.data.valueShape}
          floatMarkers={dataQuery.data.floatMarkers}
          rootPylonType={pylonType}
          hideCopyButton
          onNavigateLink={(pointer) => onNavigateLink({id: objectId} as Row, pointer)}
        />
      ) : (
        <div className="text-sm text-fg-muted">Not found.</div>
      )}
    </div>
  );
};

const LinkCell: React.FC<{value: unknown; pointer: SchemaPointer}> = ({value, pointer}) => {
  const items = pointer.kind === "multiLink" ? ((value as unknown[] | null) ?? []) : value ? [value] : [];
  return (
    <span className={clsx("flex items-center gap-1", items.length === 0 ? "text-fg-muted" : "text-fg")}>
      {items.length === 0 ? "{}" : `${items.length} object${items.length === 1 ? "" : "s"}`}
      <ArrowRight size={12} />
    </span>
  );
};

// Same "N objects →" display as LinkCell, but counting pending link-edit
// state for a not-yet-saved insert row — it has no fetched server value to
// read from, only whatever's been added via the insert-link picker so far
// (existing-object adds in `changes`, plus same-batch pending-insert targets
// in `inserts`).
const InsertLinkCell: React.FC<{tempId: number; pointer: SchemaPointer; linkEdits: Map<string, UpdateLinkEdit>}> = ({
  tempId,
  pointer,
  linkEdits,
}) => {
  const edit = linkEdits.get(`${tempId}__${pointer.name}`);
  const count = edit ? Array.from(edit.changes.values()).filter((c) => c.kind === "add").length + edit.inserts.size : 0;
  return (
    <span className={clsx("flex items-center gap-1", count === 0 ? "text-fg-muted" : "text-fg")}>
      {count === 0 ? "{}" : `${count} object${count === 1 ? "" : "s"}`}
      <ArrowRight size={12} />
    </span>
  );
};
