import type React from "react";
import {useMemo, useRef} from "react";
import clsx from "clsx";
import {getCoreRowModel, useReactTable, type ColumnDef} from "@tanstack/react-table";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Menu, Trash2, Undo2} from "lucide-react";

import type {SchemaPointer, SchemaResponse} from "@/lib/api/client";
import {lookupPointerTypeTag} from "@/lib/schema/typeTags";
import {ScalarValue} from "@/ui/ScalarValue";
import {DataEditorCell} from "@/ui/dataEditor/DataEditorCell";
import {useDataEditsStore} from "@/features/dataExplorer/state/editsStore";

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
  return pointer.typeName ?? null;
};

// Non-computed, non-id property/enum cells are double-click editable. A
// readonly pointer is still settable once, at insert time — only
// post-creation updates are blocked (matches Pylon/gel-ui's readonly rule).
const isEditableCell = (pointer: SchemaPointer, isInsertRow: boolean) =>
  (pointer.kind === "property" || pointer.kind === "enum") &&
  pointer.name !== "id" &&
  (!pointer.readonly || isInsertRow);

// Virtualized (rows) data grid: a gutter column (row number / delete-undo
// icon / link-edit-mode checkbox), a pinned id column, sortable
// property/enum headers, type-aware cells, and double-click-to-edit on
// non-readonly property/enum cells. Link/multi-link cells show "N objects →"
// and are clickable to navigate; pending-insert rows can't be navigated into
// yet (see the LinkCell branch below) — setting their own links happens via
// auto-link-on-create from a parent's link-edit mode instead.
export const DataGrid: React.FC<DataGridProps> = ({
  pylonType,
  pointers,
  rows,
  schema,
  sortField,
  sortDir,
  onSort,
  onNavigateLink,
  linkEditMode,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const displayRows = useMemo<DisplayRow[]>(() => {
    const pendingInserts = Array.from(insertEdits.values()).filter((ins) => ins.objectTypeName === pylonType);
    return [
      ...pendingInserts.map((ins): DisplayRow => ({kind: "insert", tempId: ins.id})),
      ...rows.map((row): DisplayRow => ({kind: "fetched", row})),
    ];
  }, [insertEdits, pylonType, rows]);

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
    estimateSize: () => 42,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = totalHeight - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  // Output
  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-header">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              <th className="sticky left-0 z-20 w-10 border-b border-border bg-header px-2 py-1.5 text-fg-muted">
                <Menu size={12} strokeWidth={1.75} />
              </th>
              {headerGroup.headers.map((header) => {
                const pointer = pointers.find((p) => p.name === header.id)!;
                const sortable = isSortable(pointer);
                const typeLabel = headerTypeLabel(pointer);
                return (
                  <th
                    key={header.id}
                    className={clsx(
                      "max-w-60 border-b border-border px-2 py-1.5 text-left font-mono whitespace-nowrap",
                      pointer.name === "id" && "sticky left-10 z-20 bg-header"
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
            const objectId: string | number = isInsertRow ? displayRow.tempId : ((displayRow.row.id as string | undefined) ?? "");
            const isDeletedRow = !isInsertRow && deleteEdits.has(objectId as string);

            let linkChecked = false;
            if (linkEditMode) {
              const parentKey = `${linkEditMode.parentId}__${linkEditMode.pointerName}`;
              const parentEdit = linkEdits.get(parentKey);
              if (isInsertRow) {
                linkChecked = parentEdit?.inserts.has(objectId as number) ?? false;
              } else {
                const change = parentEdit?.changes.get(objectId as string);
                linkChecked = change ? change.kind === "add" : linkEditMode.linkedIds.has(objectId as string);
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
                  className={clsx(
                    "sticky left-0 w-10 border-b border-l-2 bg-surface px-2 py-2.5 text-right font-mono text-xs text-fg-muted group-hover/row:bg-surface-hover",
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
                      onClick={() => isLink && !isInsertRow && onNavigateLink(displayRow.kind === "fetched" ? displayRow.row : {}, pointer)}
                      onDoubleClick={() => {
                        if (!cellEditable) return;
                        startEditingCell({objectId, objectTypeName: pylonType, pointerName: pointer.name});
                      }}
                      className={clsx(
                        "max-w-60 overflow-hidden border-b border-border px-2 py-2.5 font-mono text-ellipsis whitespace-nowrap",
                        pointer.name === "id" && "sticky left-10 bg-surface group-hover/row:bg-surface-hover",
                        isLink && !isInsertRow && "cursor-pointer"
                      )}
                    >
                      {isEditing ? (
                        <DataEditorCell
                          pointer={pointer}
                          schema={schema!}
                          initialValue={displayValue}
                          onCommit={commitPropertyEdit}
                          onDiscard={discardActiveEdit}
                        />
                      ) : isLink ? (
                        isInsertRow ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          <LinkCell value={rawFetchedValue} pointer={pointer} />
                        )
                      ) : (
                        <span className={clsx("flex items-center gap-1", isInvalid && "text-red-500")}>
                          {isInvalid ? (
                            <span>{editValue.raw || "(empty)"}</span>
                          ) : (
                            <ScalarValue value={displayValue} typeTag={lookupPointerTypeTag(schema, pylonType, pointer.name)} compact />
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
    return (
      <input
        type={linkSingle ? "radio" : "checkbox"}
        checked={linkChecked}
        onChange={onToggleLink}
        className="cursor-pointer accent-[var(--color-accent)]"
      />
    );
  }
  if (isInsertRow) {
    return (
      <button type="button" onClick={onToggleDelete} title="Remove" className="flex h-full w-full items-center justify-end text-fg-muted hover:text-red-500">
        <Trash2 size={12} strokeWidth={1.75} />
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
      <Trash2 size={12} strokeWidth={1.75} className="hidden group-hover/gutter:block" />
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
