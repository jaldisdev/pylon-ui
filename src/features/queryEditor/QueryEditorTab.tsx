import type React from "react";
import {useMemo, useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useHotkeys} from "react-hotkeys-hook";
import clsx from "clsx";
import {Group, Panel, Separator} from "react-resizable-panels";
import {Columns2, History, Play, Rows2, Square} from "lucide-react";

import {api, ApiError} from "@/lib/api/client";
import {CodeEditor, type CodeEditorHandle} from "@/lib/editor/CodeEditor";
import {coerceParamValue, extractParams} from "@/lib/editor/lang-pyql/extractParams";
import {useLocalStorageState} from "@/lib/hooks/useLocalStorageState";
import {useTheme} from "@/lib/theme/useTheme";
import {Card} from "@/ui/Card";
import {IconToggle} from "@/ui/IconToggle";
import {HistoryPanel, type HistoryEntry} from "@/features/queryEditor/HistoryPanel";
import {ParamsPanel} from "@/features/queryEditor/ParamsPanel";
import {ResultPanel, type QueryResult} from "@/features/queryEditor/ResultPanel";

type Orientation = "horizontal" | "vertical";

const ORIENTATION_OPTIONS = [
  {key: "horizontal" as const, icon: Columns2, label: "Side by side"},
  {key: "vertical" as const, icon: Rows2, label: "Stacked"},
];

const HISTORY_STORAGE_KEY = "pylon-ui-query-history";
const MAX_HISTORY_ENTRIES = 200;

// Query Editor: a PyQL input and its result, in a resizable split (toggle
// between side-by-side and stacked), a parameters panel for $name params,
// and a query history side panel persisted to localStorage (matching Gel's
// UI). Modeled on gel-ui's Query Editor tab, trimmed to PyQL-only (no SQL/
// Visual-Builder modes, no explain).
export const QueryEditorTab: React.FC = () => {
  const editorRef = useRef<CodeEditorHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const {resolvedTheme} = useTheme();

  const [queryText, setQueryText] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useLocalStorageState<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunQueryText, setLastRunQueryText] = useState<string | null>(null);

  const params = useMemo(() => extractParams(queryText), [queryText]);
  const isOutdated = result !== null && lastRunQueryText !== null && queryText !== lastRunQueryText;
  const canRun = queryText.trim().length > 0;

  const mutation = useMutation({
    mutationFn: ({pyql, paramsDict}: {pyql: string; paramsDict?: Record<string, unknown>}) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      return api.runQuery(pyql, paramsDict, controller.signal);
    },
  });

  const runQuery = () => {
    const pyql = editorRef.current?.getValue().trim();
    if (!pyql) return;

    const paramsDict =
      params.length > 0
        ? Object.fromEntries(params.map((p) => [p.name, coerceParamValue(paramValues[p.name] ?? "", p.castType)]))
        : undefined;

    mutation.mutate(
      {pyql, paramsDict},
      {
        onSuccess: (data) => {
          setResult({rows: data.rows, durationMs: data.duration_ms});
          setError(null);
          setLastRunQueryText(pyql);
          setHistory((h) =>
            [...h, {id: crypto.randomUUID(), pyql, timestamp: Date.now(), rowCount: data.rows.length}].slice(
              -MAX_HISTORY_ENTRIES
            )
          );
        },
        onError: (err) => {
          if (err instanceof DOMException && err.name === "AbortError") return; // cancelled, not a real error
          setResult(null);
          setError(err instanceof ApiError ? err.message : String(err));
          setLastRunQueryText(pyql);
          setHistory((h) =>
            [...h, {id: crypto.randomUUID(), pyql, timestamp: Date.now(), rowCount: null}].slice(-MAX_HISTORY_ENTRIES)
          );
        },
      }
    );
  };

  const loadHistoryEntry = (entry: HistoryEntry) => {
    editorRef.current?.setValue(entry.pyql);
    setQueryText(entry.pyql);
    setHistoryOpen(false);
  };

  // Same enableOnContentEditable/enableOnFormTags/capture+stopPropagation fix
  // as the REPL — CodeMirror's role="textbox" content div needs both opt-outs,
  // and capture phase + stopPropagation stop CodeMirror's own Enter handler
  // from also inserting a newline. See the REPL implementation for the full story.
  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      runQuery();
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );
  useHotkeys(
    "mod+h",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setHistoryOpen((open) => !open);
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Output
  return (
    <Card>
      <div className="flex h-11 shrink-0 items-center gap-2 bg-header border-b border-border px-2">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          title="History (Mod+H)"
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <History size={14} strokeWidth={1.75} />
        </button>

        <span className="text-xs font-medium text-fg-muted">PyQL</span>

        <div className="flex-1" />

        {isOutdated && <span className="text-xs text-fg-muted italic">Result outdated</span>}

        <IconToggle options={ORIENTATION_OPTIONS} selected={orientation} onSelect={setOrientation} />

        {mutation.isPending ? (
          <button
            type="button"
            onClick={() => abortControllerRef.current?.abort()}
            className="flex h-7.5 items-center gap-1 rounded-md bg-surface-hover px-2 text-xs text-fg"
          >
            <Square size={12} strokeWidth={1.75} />
            <span>Cancel</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={runQuery}
            disabled={!canRun}
            title="Mod+Enter"
            className={clsx(
              "flex items-center gap-2 h-7.5 rounded-md px-2 text-sm text-success-fg transition duration-300",
              canRun ? "bg-success hover:opacity-90" : "cursor-not-allowed bg-success/50 opacity-75"
            )}
          >
            <Play size={14} strokeWidth={1.75} />
            <span>Run</span>
            <span className="leading-none font-light text-xs opacity-85">⌘+Enter</span>
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <HistoryPanel
          entries={history}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onSelect={loadHistoryEntry}
        />

        <Group orientation={orientation} className="min-w-0 flex-1">
          <Panel defaultSize={50} minSize={20} className="flex flex-col">
            <CodeEditor
              ref={editorRef}
              onChange={setQueryText}
              dark={resolvedTheme === "dark"}
              placeholder="SELECT Type { field, ... }"
              className="flex-1"
            />
            <ParamsPanel
              params={params}
              values={paramValues}
              onChange={(name, raw) => setParamValues((v) => ({...v, [name]: raw}))}
            />
          </Panel>
          <Separator
            className={clsx(
              "bg-border hover:bg-accent",
              orientation === "horizontal" ? "w-px cursor-col-resize" : "h-px cursor-row-resize"
            )}
          />
          <Panel defaultSize={50} minSize={20}>
            <ResultPanel isRunning={mutation.isPending} result={result} error={error} />
          </Panel>
        </Group>
      </div>
    </Card>
  );
};
