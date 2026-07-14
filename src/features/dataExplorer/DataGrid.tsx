import type React from "react";
import {useMemo, useRef, useState} from "react";
import clsx from "clsx";
import {getCoreRowModel, useReactTable, type ColumnDef} from "@tanstack/react-table";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Link2, Menu, Trash2, Undo2} from "lucide-react";

import type {SchemaPointer, SchemaResponse} from "@/lib/api/client";
import {isSelfOrDescendant, qualname} from "@/lib/schema/inheritance";
import {lookupPointerTypeTag} from "@/lib/schema/typeTags";
import {formatTupleType} from "@/lib/schema/tupleTypeCast";
import {ScalarValue} from "@/ui/ScalarValue";
import {DataEditorCell} from "@/ui/dataEditor/DataEditorCell";
import {LinkPropertyCell} from "@/ui/dataEditor/LinkPropertyCell";
import {useDataEditsStore, type EditValue, type UpdateLinkEdit} from "@/features/dataExplorer/state/editsStore";

export type SortDir = "ASC" | "DESC";
type Row = Record<string, unknown>;

// A displayed row is either fetched from the server or a not-yet-saved
// pending insert (sourced from the edits store, not the query result) —
// spliced onto the front of the grid, matching gel-ui's insertedRows.
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
}

// Only plain scalar/enum properties (other than id) are sortable — links,
// multi-links, and computed pointers aren't, matching gel-ui's grid.
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

// The virtualizer assumes every row is exactly this tall (see
// rowVirtualizer's estimateSize below) to position rows via a fixed
// translateY offset — it never remeasures, so an *actual* rendered row
// height that drifts from this causes rows to visibly overlap/gap ("jump")
// as soon as one does. Applied as an explicit height (with overflow-hidden)
// on every data cell, both displaying and editing, so entering/leaving edit
// mode can never change a row's real height.
const ROW_HEIGHT = 42;

const GUTTER_WIDTH = 40;
const THROUGH_COLUMN_DEFAULT_WIDTH = 112;
const COLUMN_DEFAULT_WIDTH = 180;
const COLUMN_MIN_WIDTH = 60;
// Wide enough for a full uuidv7 (36 chars, e.g.
// "019f3395-7177-787e-b3d0-97acd3b9ffc0") in the grid's font-mono text-sm —
// the id column's own default width, applied only at md+ via Tailwind's
// responsive variant directly on its <col> (see the colgroup below): it's
// sticky and worth always reading in full there, but on mobile it scrolls
// with everything else, so it isn't worth the extra space it'd otherwise
// cost. A user-dragged resize (tracked in `columnWidths`) overrides this at
// any breakpoint, same as any other column.
const ID_COLUMN_CLASS = "w-45 md:w-80";

// Non-computed, non-id property/enum/namedTuple/array cells are
// double-click editable. A readonly pointer is still settable once, at
// insert time — only post-creation updates are blocked (matches
// Pylon/gel-ui's readonly rule).
const isEditableCell = (pointer: SchemaPointer, isInsertRow: boolean) =>
  (pointer.kind === "property" || pointer.kind === "enum" || pointer.kind === "namedTuple" || pointer.kind === "array") &&
  pointer.name !== "id" &&
  (!pointer.readonly || isInsertRow);

// A pending insert's temp id, or a fetched row's real uuid — same identity
// DataEditsStore keys edits by (see ActivePropertyEdit.objectId).
const rowObjectId = (row: DisplayRow): string | number => (row.kind === "insert" ? row.tempId : ((row.row.id as string | undefined) ?? ""));

// Virtualized (rows) data grid: a gutter column (row number / delete-undo
// icon / link-edit-mode checkbox), a pinned id column, sortable
// property/enum headers, type-aware cells, and double-click-to-edit on
// non-readonly property/enum cells. Link/multi-link cells show "N objects →"
// and are clickable to navigate — both push a URL-based nested view; a
// pending-insert row has no real id to address by, so onNavigateInsertLink
// builds that path segment from its position among same-type pending
// inserts instead (matching Gel's own convention — see stack.ts).
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
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Per-column widths (keyed by pointer name, or `@name` for a through-type
  // property column) — drag-resized via the handle on each header's right
  // edge; unset columns fall back to their default width (from the
  // <colgroup> below). Table uses a <colgroup> (not per-cell width classes)
  // so header and body cells for the same column always agree, which
  // `table-fixed` layout requires anyway.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Reads the column's actual rendered width off the DOM at drag-start
  // (rather than duplicating its default width as a JS constant) so this
  // stays correct regardless of how that default was set — including the id
  // column's own md+-only default, which only exists as a Tailwind class.
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
  // just its own concrete type) — matching Gel: inserting a Person on the
  // abstract Account grid stays visible there (only Account's own pointers
  // editable) and again once you drill into the concrete Person type (its
  // additional pointers now editable too), rather than only ever appearing
  // after switching to the concrete type.
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

  const columns = useMemo<ColumnDef<Row>[]>(
    () => pointers.map((pointer) => ({id: pointer.name, accessorKey: pointer.name})),
    [pointers]
  );

  // Only used for getHeaderGroups() — header rendering depends solely on
  // `columns`, not `data`, so the actual (possibly-mixed insert/fetched) row
  // list below is handled entirely outside this table instance.
  const table = useReactTable({data: rows, columns, getCoreRowModel: getCoreRowModel()});

  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = totalHeight - (virtualRows[virtualRows.length - 1]?.end ?? 0);

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
        if (r !== rowIndex) rowVirtualizer.scrollToIndex(r, {align: "auto"});
        return;
      }
    }
  };

  // Output
  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{width: GUTTER_WIDTH}} />
          {linkEditMode?.throughPointers?.map((tp) => (
            <col key={`@${tp.name}`} style={{width: columnWidths[`@${tp.name}`] ?? THROUGH_COLUMN_DEFAULT_WIDTH}} />
          ))}
          {pointers.map((pointer) => {
            const resized = columnWidths[pointer.name];
            if (resized !== undefined) return <col key={pointer.name} style={{width: resized}} />;
            return <col key={pointer.name} className={pointer.name === "id" ? ID_COLUMN_CLASS : undefined} style={pointer.name === "id" ? undefined : {width: COLUMN_DEFAULT_WIDTH}} />;
          })}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-header">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              <th className="sticky left-0 z-20 border-b border-border bg-header px-2 py-1.5 text-fg-muted shadow-(--shadow-sticky-col) md:shadow-none">
                <Menu size={12} strokeWidth={1.75} />
              </th>
              {linkEditMode?.throughPointers?.map((tp) => (
                <th key={`@${tp.name}`} className="relative border-b border-border px-2 py-1.5 text-left font-mono whitespace-nowrap">
                  <div className="truncate font-[450] text-2sm text-fg">@{tp.name}</div>
                  {tp.typeName && <div className="truncate text-2xs font-normal text-fg-muted">{tp.typeName}</div>}
                  <div
                    onMouseDown={startResize(`@${tp.name}`)}
                    className="absolute inset-y-0 right-0 w-1 cursor-col-resize select-none hover:bg-accent/50 active:bg-accent"
                  />
                </th>
              ))}
              {headerGroup.headers.map((header) => {
                const pointer = pointers.find((p) => p.name === header.id)!;
                const sortable = isSortable(pointer);
                const typeLabel = headerTypeLabel(pointer);
                return (
                  <th
                    key={header.id}
                    className={clsx(
                      "relative border-b border-border px-2 py-1.5 text-left font-mono whitespace-nowrap",
                      // Sticky on desktop so id stays visible while scrolling
                      // horizontally; on narrow (mobile) widths it eats too
                      // much of the already-tight viewport, so it scrolls
                      // with the rest of the row there instead. The pinned-
                      // column shadow moves to the gutter in that case (see
                      // its own className above) since id is then the one
                      // scrolling normally.
                      pointer.name === "id" &&
                        "sticky left-10 z-20 bg-header shadow-(--shadow-sticky-col) max-md:static max-md:left-auto max-md:z-auto max-md:shadow-none"
                    )}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={() => onSort(pointer.name)}
                      className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
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
                    <div
                      onMouseDown={startResize(pointer.name)}
                      className="absolute inset-y-0 right-0 w-1 cursor-col-resize select-none hover:bg-accent/50 active:bg-accent"
                    />
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{height: paddingTop}} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const displayRow = displayRows[virtualRow.index];
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
                linkChecked = change ? change.kind === "add" : linkEditMode.linkedIds.has(objectId as string);
                linkProperties = change?.properties;
              }
            }

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
                addLinkUpdate(parentId, parentObjectTypeName, pointerName, linkTypeName, {id: objectId as string, typename: pylonType}, single);
              }
            };

            return (
              <tr
                key={isInsertRow ? `insert-${objectId}` : (objectId as string)}
                className={clsx("group/row hover:bg-surface-hover", isDeletedRow && "pointer-events-none opacity-50")}
              >
                <td
                  style={{height: ROW_HEIGHT}}
                  className={clsx(
                    "sticky left-0 overflow-hidden border-b border-l-2 bg-surface px-2 py-2.5 text-right font-mono text-xs text-fg-muted shadow-(--shadow-sticky-col) group-hover/row:bg-surface-hover md:shadow-none",
                    isInsertRow ? "border-b-border border-l-green-500" : isDeletedRow ? "border-b-border border-l-red-500" : "border-border border-l-transparent"
                  )}
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
                  />
                </td>
                {linkEditMode?.throughPointers?.map((tp) => (
                  <td key={`@${tp.name}`} style={{height: ROW_HEIGHT}} className="overflow-hidden border-b border-border px-2 py-1.5">
                    <LinkPropertyCell
                      pointer={tp}
                      schema={schema!}
                      value={linkProperties?.[tp.name]}
                      disabled={!linkChecked}
                      onChange={(value) => {
                        const {parentId, parentObjectTypeName, pointerName, linkTypeName} = linkEditMode;
                        setLinkTargetProperty(parentId, parentObjectTypeName, pointerName, linkTypeName, objectId, tp.name, value);
                      }}
                    />
                  </td>
                ))}
                {pointers.map((pointer) => {
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

                  return (
                    <td
                      key={pointer.name}
                      onClick={() => {
                        if (!isLink) return;
                        if (isInsertRow) onNavigateInsertLink(objectId as number, pointer);
                        else onNavigateLink(displayRow.kind === "fetched" ? displayRow.row : {}, pointer);
                      }}
                      onDoubleClick={() => {
                        if (!cellEditable) return;
                        startEditingCell({objectId, objectTypeName: pylonType, pointerName: pointer.name});
                      }}
                      style={{height: ROW_HEIGHT}}
                      className={clsx(
                        "border-b border-border font-mono text-ellipsis whitespace-nowrap",
                        // Editing drops the cell's own padding so the editor
                        // inside (ScalarMemberInput et al.) can sit flush
                        // against the cell's edges, matching Gel's own inline
                        // editor look, instead of being inset within it. Also
                        // drops overflow-hidden — needed the rest of the time
                        // for text-ellipsis truncation, but while editing it
                        // would clip the optional "unset" button, which
                        // deliberately renders past this cell's own right
                        // edge (translate-x-full, see DataEditorCell.tsx).
                        // Safe to drop here: the editor's own height is now
                        // exact (see ScalarMemberInput's leading-0 fix), so
                        // there's nothing left for it to still be guarding
                        // against vertically.
                        isEditing ? "p-0" : "overflow-hidden px-2 py-2.5",
                        pointer.name === "id" &&
                          "sticky left-10 bg-surface shadow-(--shadow-sticky-col) group-hover/row:bg-surface-hover max-md:static max-md:left-auto max-md:shadow-none",
                        isLink && "cursor-pointer",
                        // Hints a cell is double-click-editable before the
                        // user commits to it, matching Gel's own hover state
                        // — ring (not border) so it draws inset, inside the
                        // existing border-box, rather than shifting layout.
                        cellEditable && !isEditing && "cursor-text hover:ring-1 hover:ring-inset hover:ring-accent"
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
                      ) : isLink ? (
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
                              <Undo2 size={11} strokeWidth={1.75} />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{height: paddingBottom}} />
            </tr>
          )}
        </tbody>
      </table>
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
}) => {
  if (linkEditMode) {
    // A single-link's *checked* row can't be a plain radio: browsers never
    // fire onChange for a click on an already-checked radio (no state
    // transition to report), so there'd be no way to clear it back to
    // unset. Once checked, it switches to a real button instead — clicking
    // it always fires, unlinking it — matching Gel's own solid "linked"
    // badge for this exact reason.
    if (linkSingle && linkChecked) {
      return (
        <button
          type="button"
          onClick={onToggleLink}
          title="Unlink"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg hover:opacity-90"
        >
          <Link2 size={12} strokeWidth={2} />
        </button>
      );
    }
    return (
      <input
        type={linkSingle ? "radio" : "checkbox"}
        checked={linkChecked}
        onChange={onToggleLink}
        className="cursor-pointer accent-(--color-accent)"
      />
    );
  }
  if (isInsertRow) {
    return (
      <button type="button" onClick={onToggleDelete} title="Remove" className="flex h-full w-full items-center justify-end text-fg-muted hover:text-red-500">
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    );
  }
  if (isDeletedRow) {
    return (
      <button type="button" onClick={onToggleDelete} title="Undo delete" className="flex h-full w-full items-center justify-end text-fg-muted hover:text-fg">
        <Undo2 size={12} strokeWidth={1.75} />
      </button>
    );
  }
  return (
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
