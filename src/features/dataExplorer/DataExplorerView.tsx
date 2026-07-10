import type React from "react";
import {useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {ArrowLeft, Filter, RefreshCw} from "lucide-react";
import clsx from "clsx";

import {api} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {useTheme} from "@/lib/theme/useTheme";
import {DataGrid, type SortDir} from "@/features/dataExplorer/DataGrid";
import {FilterPanel} from "@/features/dataExplorer/FilterPanel";
import {ObjectTypeSelect} from "@/features/dataExplorer/ObjectTypeSelect";
import {stackToPath, type StackEntry} from "@/features/dataExplorer/stack";

type Row = Record<string, unknown>;

interface DataExplorerViewProps {
  stack: StackEntry[];
  basePath: string; // e.g. "/main/data"
}

// Builds the field shape fragment for a SELECT — links/multi-links are
// requested as `{id}` only (the grid just needs a count + the id to
// navigate), verified against the real backend rather than assumed.
const buildShape = (fields: {name: string; kind: string}[]) =>
  fields.map((f) => (f.kind === "link" || f.kind === "multiLink" ? `${f.name}: {id}` : f.name)).join(", ");

// One nested-view level: header (type picker or back-button breadcrumb),
// row count/refresh, filter toggle, and the grid itself. Re-mounted (see the
// `key` on DataExplorerTab's usage) whenever the view identity changes, so
// sort/filter state resets between levels instead of needing manual resets.
export const DataExplorerView: React.FC<DataExplorerViewProps> = ({stack, basePath}) => {
  const navigate = useNavigate();
  const {data: schema} = useSchema();
  const {resolvedTheme} = useTheme();

  const current = stack[stack.length - 1];
  const schemaType = schema?.types.find((t) => `${t.module}::${t.name}` === current.pylonType);
  const fields = schemaType?.fields ?? [];

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("ASC");
  const [filterExpr, setFilterExpr] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const query = useMemo(() => {
    if (fields.length === 0) return null;
    const shape = buildShape(fields);
    const orderClause = sortField ? ` order by .${sortField} ${sortDir}` : "";
    const filterClause = filterExpr ? ` filter ${filterExpr}` : "";

    if (current.parent) {
      // Nested view: fetch the parent by id with the link field's shape
      // embedded — simpler and verified-working, vs. trying to make the
      // *target* type the top-level SELECT subject via a reverse filter.
      return {
        pyql: `select ${current.parent.parentType} { ${current.parent.fieldName}: { ${shape} }${filterClause}${orderClause} limit 500 } filter .id = <uuid>$parentId`,
        params: {parentId: current.parent.id},
        extractField: current.parent.fieldName,
      };
    }
    return {
      pyql: `SELECT ${current.pylonType} { ${shape} }${filterClause}${orderClause} offset 0 limit 500`,
      params: undefined,
      extractField: null as string | null,
    };
  }, [fields, sortField, sortDir, filterExpr, current]);

  const dataQuery = useQuery({
    queryKey: ["dataExplorer", "rows", current, sortField, sortDir, filterExpr],
    queryFn: async () => {
      const res = await api.runQuery(query!.pyql, query!.params);
      if (!query!.extractField) return res.rows as Row[];
      // A single-link field (e.g. "company") extracts to one object or null,
      // not an array like a multi-link does — normalize both cases to Row[].
      const extracted = (res.rows[0] as Row | undefined)?.[query!.extractField];
      return (Array.isArray(extracted) ? extracted : extracted ? [extracted] : []) as Row[];
    },
    enabled: query !== null,
  });

  // Nested views approximate the total count from the fetched rows (no
  // separate count query — a deliberate v1 simplification, see the plan)
  // ; root views get a real count via count().
  const countQuery = useQuery({
    queryKey: ["dataExplorer", "count", current.pylonType, filterExpr],
    queryFn: async () => {
      const filterClause = filterExpr ? ` filter ${filterExpr}` : "";
      const res = await api.runQuery(`select count((select ${current.pylonType}${filterClause}))`);
      return res.rows[0] as number;
    },
    enabled: !current.parent,
  });

  const rowCount = current.parent ? (dataQuery.data?.length ?? null) : (countQuery.data ?? null);

  const goBack = () => navigate(`${basePath}/${stackToPath(stack.slice(0, -1))}`);

  const navigateLink = (row: Row, field: {name: string}) => {
    const id = (row.id as string | undefined) ?? "";
    navigate(`${basePath}/${stackToPath(stack)}/${id}/${field.name}`);
  };

  const toggleSort = (fieldName: string) => {
    if (sortField !== fieldName) {
      setSortField(fieldName);
      setSortDir("ASC");
    } else if (sortDir === "ASC") {
      setSortDir("DESC");
    } else {
      setSortField(null);
    }
  };

  // Output
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 bg-header border-b border-border px-2">
        {current.parent ? (
          <>
            <button
              type="button"
              onClick={goBack}
              className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg"
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
            <div className="font-mono text-sm">
              <div className="text-fg-muted">{current.parent.parentType}</div>
              <div className="text-2xs text-fg-muted/70">.{current.parent.fieldName}</div>
            </div>
          </>
        ) : schema ? (
          <ObjectTypeSelect
            types={schema.types}
            selected={schemaType ?? null}
            onSelect={(type) => navigate(`${basePath}/${type.module}::${type.name}`)}
          />
        ) : null}

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 font-mono text-2sm text-fg-muted">
          {rowCount !== null ? (
            <>
              {rowCount} object{rowCount === 1 ? "" : "s"}
              <button
                type="button"
                onClick={() => dataQuery.refetch()}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-hover hover:text-fg"
              >
                <RefreshCw size={12} strokeWidth={1.75} />
              </button>
            </>
          ) : (
            "loading…"
          )}
        </div>

        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          className={clsx(
            "flex h-7 items-center gap-1 rounded-md px-2 text-2sm",
            filterOpen || filterExpr ? "bg-surface-hover text-accent" : "text-fg-muted hover:bg-surface-hover"
          )}
        >
          <Filter size={12} strokeWidth={1.75} />
          Filter
        </button>
      </div>

      {filterOpen && (
        <FilterPanel
          defaultValue={filterExpr}
          hasActiveFilter={!!filterExpr}
          error={dataQuery.error instanceof Error ? dataQuery.error.message : null}
          dark={resolvedTheme === "dark"}
          onApply={(expr) => setFilterExpr(expr)}
          onClear={() => setFilterExpr("")}
        />
      )}

      {schemaType ? (
        <DataGrid
          pylonType={current.pylonType}
          fields={fields}
          rows={dataQuery.data ?? []}
          schema={schema}
          sortField={sortField}
          sortDir={sortField ? sortDir : null}
          onSort={toggleSort}
          onNavigateLink={navigateLink}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
          {schema ? "Select an object type" : "Loading schema…"}
        </div>
      )}
    </>
  );
};
