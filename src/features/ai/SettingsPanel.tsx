import type React from "react";
import {useMemo} from "react";

import type {SchemaType} from "@/lib/api/client";
import {useModels} from "@/lib/api/useModels";
import {CodeEditor} from "@/lib/editor/CodeEditor";
import {useSchema} from "@/lib/api/useSchema";
import {useTheme} from "@/lib/theme/useTheme";
import {Select, type SelectOption} from "@/ui/Select";

// A bare/default VectorIndex has indexName === null — react-select needs a
// string value, so it's represented as this sentinel on the wire between
// SettingsPanel and its Select options only (never sent to the backend).
const DEFAULT_INDEX_VALUE = "__default__";

interface SettingsPanelProps {
  searchableTypes: SchemaType[];
  selectedType: SchemaType | null;
  pylonType: string | null;
  indexName: string | null;
  modelName: string | null;
  contextQuery: string;
  onTypeChange: (pylonType: string | null) => void;
  onIndexChange: (indexName: string | null) => void;
  onModelChange: (modelName: string | null) => void;
  onContextQueryChange: (query: string) => void;
}

const Field: React.FC<{label: string; className?: string; children: React.ReactNode}> = ({
  label,
  className,
  children,
}) => (
  <div className={className}>
    <div className="mb-1 text-xs font-medium text-fg-muted">{label}</div>
    {children}
  </div>
);

// Right-hand settings rail for the AI tab's RAG search: which model answers,
// which VectorIndex-bearing type/index to search, and an optional Context
// Query (a PyQL expression narrowing which objects vector::search scopes
// over — empty searches every object of the type).
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  searchableTypes,
  selectedType,
  pylonType,
  indexName,
  modelName,
  contextQuery,
  onTypeChange,
  onIndexChange,
  onModelChange,
  onContextQueryChange,
}) => {
  const {data: modelsData} = useModels();
  const {data: schema} = useSchema();
  const {resolvedTheme} = useTheme();

  const modelOptions = useMemo<SelectOption[]>(
    () => (modelsData?.models ?? []).map((m) => ({value: m.name, label: m.name})),
    [modelsData]
  );
  const typeOptions = useMemo<SelectOption[]>(
    () => searchableTypes.map((t) => ({value: `${t.module}::${t.name}`, label: `${t.module}::${t.name}`})),
    [searchableTypes]
  );
  const indexOptions = useMemo<SelectOption[]>(
    () =>
      (selectedType?.vectorIndexes ?? []).map((vi) => ({
        value: vi.indexName ?? DEFAULT_INDEX_VALUE,
        label: vi.indexName ?? "default",
      })),
    [selectedType]
  );
  const promptOptions: SelectOption[] = [{value: "builtin::rag-default", label: "builtin::rag-default"}];

  // Output — a compact 2-column grid (Context Query spanning both) on
  // mobile, stacked full-width above the chat; a fixed sidebar on desktop.
  return (
    <div className="grid grid-cols-2 gap-3 border-b border-border p-3 md:flex md:w-72 md:shrink-0 md:flex-col md:gap-4 md:overflow-y-auto md:border-b-0 md:border-l md:p-4">
      <Field label="Model">
        <Select
          options={modelOptions}
          value={modelOptions.find((o) => o.value === modelName) ?? null}
          onChange={(opt) => onModelChange(opt?.value ?? null)}
          placeholder="Select a model…"
          isClearable={false}
          isDisabled={modelOptions.length === 0}
        />
      </Field>
      <Field label="Type">
        <Select
          options={typeOptions}
          value={typeOptions.find((o) => o.value === pylonType) ?? null}
          onChange={(opt) => onTypeChange(opt?.value ?? null)}
          placeholder="Select a type…"
          isClearable={false}
          isDisabled={typeOptions.length === 0}
        />
      </Field>
      <Field label="Index">
        <Select
          options={indexOptions}
          value={indexOptions.find((o) => o.value === (indexName ?? DEFAULT_INDEX_VALUE)) ?? null}
          onChange={(opt) => onIndexChange(opt?.value === DEFAULT_INDEX_VALUE ? null : (opt?.value ?? null))}
          isClearable={false}
          isDisabled={indexOptions.length <= 1}
        />
      </Field>
      <Field label="Prompt">
        <Select options={promptOptions} value={promptOptions[0]} onChange={() => {}} isClearable={false} isDisabled />
      </Field>
      <Field label="Context Query (optional)" className="col-span-2">
        <CodeEditor
          key={pylonType}
          defaultValue={contextQuery}
          onChange={onContextQueryChange}
          schema={schema}
          dark={resolvedTheme === "dark"}
          placeholder="select Type filter .field = value"
          className="h-24 rounded-md border border-border"
        />
      </Field>
    </div>
  );
};
