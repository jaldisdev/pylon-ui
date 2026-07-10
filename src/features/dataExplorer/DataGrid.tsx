import type React from "react";
import {useMemo, useRef} from "react";
import clsx from "clsx";
import {getCoreRowModel, useReactTable, type ColumnDef} from "@tanstack/react-table";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Menu} from "lucide-react";

import type {SchemaField, SchemaResponse} from "@/lib/api/client";
import {lookupFieldTypeTag} from "@/lib/schema/typeTags";
import {ScalarValue} from "@/ui/ScalarValue";

export type SortDir = "ASC" | "DESC";
type Row = Record<string, unknown>;

interface DataGridProps {
  pylonType: string; // "module::Name" of the row's own type, for type-tag lookups
  fields: SchemaField[];
  rows: Row[];
  schema: SchemaResponse | undefined;
  sortField: string | null;
  sortDir: SortDir | null;
  onSort: (fieldName: string) => void;
  onNavigateLink: (row: Row, field: SchemaField) => void;
}

// Only plain scalar/enum fields (other than id) are sortable — links,
// multi-links, and computed fields aren't, matching gel-ui's grid.
const isSortable = (field: SchemaField) => (field.kind === "property" || field.kind === "enum") && field.name !== "id";

// The type description shown below a field's name in its column header —
// e.g. "std::str", "default::Gender", "multi default::Tag".
const headerTypeLabel = (field: SchemaField): string | null => {
  if (field.kind === "link" || field.kind === "enum") return field.target ?? null;
  if (field.kind === "multiLink") return field.target ? `multi ${field.target}` : "multi";
  return field.typeName ?? null;
};

// Virtualized (rows) data grid: a row-number column, a pinned id column,
// sortable property/enum headers (name + type-name subtitle), and
// type-aware cells (uuid/datetime/enum tags via ScalarValue). Link/
// multi-link cells show "N objects →" and are clickable to navigate.
export const DataGrid: React.FC<DataGridProps> = ({
  pylonType,
  fields,
  rows,
  schema,
  sortField,
  sortDir,
  onSort,
  onNavigateLink,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => fields.map((field) => ({id: field.name, accessorKey: field.name})),
    [fields]
  );

  const table = useReactTable({data: rows, columns, getCoreRowModel: getCoreRowModel()});

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
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
                const field = fields.find((f) => f.name === header.id)!;
                const sortable = isSortable(field);
                const typeLabel = headerTypeLabel(field);
                return (
                  <th
                    key={header.id}
                    className={clsx(
                      "max-w-60 border-b border-border px-2 py-1.5 text-left font-mono whitespace-nowrap",
                      field.name === "id" && "sticky left-10 z-20 bg-header"
                    )}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={() => onSort(field.name)}
                      className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
                    >
                      <span className="min-w-0">
                        <div className="truncate font-[450] text-2sm text-fg">
                          {field.name}
                          {field.kind === "computed" && ":="}
                        </div>
                        {typeLabel && <div className="truncate text-2xs font-normal text-fg-muted">{typeLabel}</div>}
                      </span>
                      {sortable &&
                        (sortField === field.name ? (
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
            const row = rows[virtualRow.index];
            return (
              <tr key={virtualRow.key} className="group/row hover:bg-surface-hover">
                <td className="sticky left-0 w-10 border-b border-border bg-surface px-2 py-2.5 text-right font-mono text-xs text-fg-muted group-hover/row:bg-surface-hover">
                  {virtualRow.index + 1}
                </td>
                {fields.map((field) => {
                  const isLink = field.kind === "link" || field.kind === "multiLink";
                  return (
                    <td
                      key={field.name}
                      onClick={() => isLink && onNavigateLink(row, field)}
                      className={clsx(
                        "max-w-60 overflow-hidden border-b border-border px-2 py-2.5 font-mono text-ellipsis whitespace-nowrap",
                        field.name === "id" && "sticky left-10 bg-surface group-hover/row:bg-surface-hover",
                        isLink && "cursor-pointer"
                      )}
                    >
                      <DataCell pylonType={pylonType} field={field} value={row[field.name]} schema={schema} />
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

interface DataCellProps {
  pylonType: string;
  field: SchemaField;
  value: unknown;
  schema: SchemaResponse | undefined;
}

const DataCell: React.FC<DataCellProps> = ({pylonType, field, value, schema}) => {
  if (field.kind === "link" || field.kind === "multiLink") {
    const items = field.kind === "multiLink" ? ((value as unknown[] | null) ?? []) : value ? [value] : [];
    return (
      <span className={clsx("flex items-center gap-1", items.length === 0 ? "text-fg-muted" : "text-fg")}>
        {items.length === 0 ? "{}" : `${items.length} object${items.length === 1 ? "" : "s"}`}
        <ArrowRight size={12} />
      </span>
    );
  }

  const typeTag = lookupFieldTypeTag(schema, pylonType, field.name);
  return <ScalarValue value={value} typeTag={typeTag} compact />;
};
