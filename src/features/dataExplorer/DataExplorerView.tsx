import type React from "react";
import {useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {ArrowLeft, Filter, Link2, RefreshCw} from "lucide-react";
import clsx from "clsx";

import {api} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {useTheme} from "@/lib/theme/useTheme";
import {DataGrid, type LinkEditMode, type SortDir} from "@/features/dataExplorer/DataGrid";
import {FilterPanel} from "@/features/dataExplorer/FilterPanel";
import {InsertRowButton} from "@/features/dataExplorer/InsertRowButton";
import {ObjectTypeSelect} from "@/features/dataExplorer/ObjectTypeSelect";
import {stackToPath, type StackEntry} from "@/features/dataExplorer/stack";
import {useDataEditsStore} from "@/features/dataExplorer/state/editsStore";

type Row = Record<string, unknown>;

interface DataExplorerViewProps {
  stack: StackEntry[];
  basePath: string; // e.g. "/main/data"
}

// Builds the shape fragment for a SELECT — links/multi-links are
// requested as `{id}` only (the grid just needs a count + the id to
// navigate), verified against the real backend rather than assumed.
const buildShape = (pointers: {name: string; kind: string}[]) =>
  pointers.map((p) => (p.kind === "link" || p.kind === "multiLink" ? `${p.name}: {id}` : p.name)).join(", ");

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
  const pointers = schemaType?.pointers ?? [];

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("ASC");
  const [filterExpr, setFilterExpr] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  // "Edit links" mode for a nested link view — while on, the grid shows
  // every object of the target type (not just currently-linked ones) with a
  // checkbox/radio per row, matching gel-ui's link-picker-is-the-grid design.
  const [linkEditModeOn, setLinkEditModeOn] = useState(false);
  const createNewRow = useDataEditsStore((s) => s.createNewRow);

  // The parent's own pointer for this link (only set when nested) — tells us
  // whether it's a single-link (radio, exclusive) or multi-link (checkbox),
  // and gates the "Edit links" toggle (hidden for computed backlinks).
  const parentSchemaType = schema?.types.find((t) => `${t.module}::${t.name}` === current.parent?.parentType);
  const parentPointer = parentSchemaType?.pointers.find((p) => p.name === current.parent?.fieldName);
  const isSingleLink = parentPointer?.kind === "link";
  // The junction (through-type)'s own properties (e.g. ProductTag.weight),
  // if any — powers the inline per-row property inputs in "Edit links" mode.
  const throughType = parentPointer?.through
    ? schema?.types.find((t) => `${t.module}::${t.name}` === parentPointer.through)
    : undefined;
  const throughPointers = throughType?.pointers.filter((p) => p.name !== "id");

  const query = useMemo(() => {
    if (pointers.length === 0) return null;
    const shape = buildShape(pointers);
    const orderClause = sortField ? ` order by .${sortField} ${sortDir}` : "";
    const filterClause = filterExpr ? ` filter ${filterExpr}` : "";

    if (current.parent && !linkEditModeOn) {
      // Nested view (not editing links): fetch the parent by id with the
      // link field's shape embedded — simpler and verified-working, vs.
      // trying to make the *target* type the top-level SELECT subject via a
      // reverse filter.
      return {
        pyql: `select ${current.parent.parentType} { ${current.parent.fieldName}: { ${shape} }${filterClause}${orderClause} limit 500 } filter .id = <uuid>$parentId`,
        params: {parentId: current.parent.id},
        extractField: current.parent.fieldName,
      };
    }
    // Root view, or a nested view in "Edit links" mode — either way we want
    // every object of the target type as a normal top-level SELECT, so link
    // candidates aren't limited to what's already linked.
    return {
      pyql: `SELECT ${current.pylonType} { ${shape} }${filterClause}${orderClause} offset 0 limit 500`,
      params: undefined,
      extractField: null as string | null,
    };
  }, [pointers, sortField, sortDir, filterExpr, current, linkEditModeOn]);

  const dataQuery = useQuery({
    queryKey: ["dataExplorer", "objects", current, sortField, sortDir, filterExpr, linkEditModeOn],
    queryFn: async () => {
      const res = await api.runQuery(query!.pyql, query!.params);
      if (!query!.extractField) return res.objects as Row[];
      // A single-link field (e.g. "company") extracts to one object or null,
      // not an array like a multi-link does — normalize both cases to Row[].
      const extracted = (res.objects[0] as Row | undefined)?.[query!.extractField];
      return (Array.isArray(extracted) ? extracted : extracted ? [extracted] : []) as Row[];
    },
    enabled: query !== null,
  });

  // Nested views (not editing links) approximate the total count from the
  // fetched objects (no separate count query — a deliberate v1
  // simplification, see the plan); root views and edit-links mode (which is
  // really just a root view of the target type) get a real count via count().
  const countQuery = useQuery({
    queryKey: ["dataExplorer", "count", current.pylonType, filterExpr],
    queryFn: async () => {
      const filterClause = filterExpr ? ` filter ${filterExpr}` : "";
      const res = await api.runQuery(`select count((select ${current.pylonType}${filterClause}))`);
      return res.objects[0] as number;
    },
    enabled: !current.parent || linkEditModeOn,
  });

  // Which target ids are already linked on the server — only needed in
  // "Edit links" mode, to seed each row's checkbox/radio starting state.
  const linkedIdsQuery = useQuery({
    queryKey: ["dataExplorer", "linkedIds", current.parent?.parentType, current.parent?.id, current.parent?.fieldName],
    queryFn: async () => {
      const parent = current.parent!;
      const res = await api.runQuery(`select ${parent.parentType} { ${parent.fieldName}: {id} } filter .id = <uuid>$parentId`, {
        parentId: parent.id,
      });
      const extracted = (res.objects[0] as Row | undefined)?.[parent.fieldName];
      const items = (Array.isArray(extracted) ? extracted : extracted ? [extracted] : []) as Row[];
      return new Set(items.map((item) => item.id as string));
    },
    enabled: !!current.parent && linkEditModeOn,
  });

  const linkEditMode: LinkEditMode | undefined =
    current.parent && linkEditModeOn
      ? {
          parentId: current.parent.id,
          parentObjectTypeName: current.parent.parentType,
          pointerName: current.parent.fieldName,
          linkTypeName: current.pylonType,
          single: isSingleLink,
          linkedIds: linkedIdsQuery.data ?? new Set(),
          throughPointers: throughPointers && throughPointers.length > 0 ? throughPointers : undefined,
        }
      : undefined;

  const objectCount = current.parent && !linkEditModeOn ? (dataQuery.data?.length ?? null) : (countQuery.data ?? null);

  const goBack = () => navigate(`${basePath}/${stackToPath(stack.slice(0, -1))}`);

  const navigateLink = (row: Row, pointer: {name: string}) => {
    const id = (row.id as string | undefined) ?? "";
    navigate(`${basePath}/${stackToPath(stack)}/${id}/${pointer.name}`);
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
          {objectCount !== null ? (
            <>
              {objectCount} object{objectCount === 1 ? "" : "s"}
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

        {current.parent && parentPointer && parentPointer.kind !== "computed" && (
          <button
            type="button"
            onClick={() => setLinkEditModeOn((o) => !o)}
            className={clsx(
              "flex h-7 items-center gap-1 rounded-md px-2 text-2sm",
              linkEditModeOn ? "bg-surface-hover text-accent" : "text-fg-muted hover:bg-surface-hover"
            )}
          >
            <Link2 size={12} strokeWidth={1.75} />
            Edit links
          </button>
        )}

        {(!current.parent || linkEditModeOn) && schema && schemaType && (
          <InsertRowButton
            schema={schema}
            schemaType={schemaType}
            onInsert={(concreteTypeName) =>
              createNewRow(
                concreteTypeName,
                current.parent && linkEditModeOn
                  ? {
                      parentId: current.parent.id,
                      parentObjectTypeName: current.parent.parentType,
                      pointerName: current.parent.fieldName,
                      linkTypeName: current.pylonType,
                      single: isSingleLink,
                    }
                  : undefined
              )
            }
          />
        )}

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
          pointers={pointers}
          rows={dataQuery.data ?? []}
          schema={schema}
          sortField={sortField}
          sortDir={sortField ? sortDir : null}
          onSort={toggleSort}
          onNavigateLink={navigateLink}
          linkEditMode={linkEditMode}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
          {schema ? "Select an object type" : "Loading schema…"}
        </div>
      )}
    </>
  );
};
