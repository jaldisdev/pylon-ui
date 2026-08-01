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
import {useMemo, useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useHotkeys} from "react-hotkeys-hook";
import clsx from "clsx";
import {Group, Panel, Separator} from "react-resizable-panels";
import {Columns2, History, Play, Rows2, Square} from "lucide-react";

import {api, ApiError, type QueryErrorInfo} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {CodeEditor, type CodeEditorHandle} from "@/lib/editor/CodeEditor";
import {coerceParamValue, extractParams, validateCastValue} from "@/lib/editor/lang-pyql/extractParams";
import {useLocalStorageState, useSessionStorageState} from "@/lib/hooks/useLocalStorageState";
import {useTheme} from "@/lib/theme/useTheme";
import {Card} from "@/ui/Card";
import {IconToggle} from "@/ui/IconToggle";
import {HistoryPanel, type HistoryEntry} from "@/features/queryEditor/HistoryPanel";
import {ParamsPanel} from "@/features/queryEditor/ParamsPanel";
import {ResultPanel, type QueryResult} from "@/features/queryEditor/ResultPanel";
import {resolveArrayParamElement, resolveTupleParamMembers} from "@/lib/schema/tupleTypeCast";
import {defaultTupleValue} from "@/ui/dataEditor/TupleEditor";

type Orientation = "horizontal" | "vertical";

const ORIENTATION_OPTIONS = [
  {key: "horizontal" as const, icon: Columns2, label: "Side by side"},
  {key: "vertical" as const, icon: Rows2, label: "Stacked"},
];

const HISTORY_STORAGE_KEY = "pylon-ui-query-history";
const MAX_HISTORY_ENTRIES = 200;
const DRAFT_TEXT_KEY = "pylon-ui-query-draft-text";
const DRAFT_PARAMS_KEY = "pylon-ui-query-draft-params";

// Query Editor: a PyQL input and its result, in a resizable split (toggle
// between side-by-side and stacked), a parameters panel for $name params,
// and a query history side panel persisted to localStorage. PyQL-only (no
// SQL/Visual-Builder modes, no explain).
export const QueryEditorTab: React.FC = () => {
  const editorRef = useRef<CodeEditorHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const {resolvedTheme} = useTheme();
  const {data: schema} = useSchema();

  // sessionStorage (not localStorage) — survives switching to another tab
  // (e.g. Data Explorer to look up an id) and back, but not closing the tab:
  // a "current input + params" draft, distinct from the permanent
  // (localStorage) history below.
  const [queryText, setQueryText] = useSessionStorageState(DRAFT_TEXT_KEY, "");
  const [paramValues, setParamValues] = useSessionStorageState<Record<string, string>>(DRAFT_PARAMS_KEY, {});
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [paramsResetKey, setParamsResetKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  // null means "not previewing a history entry" — while the panel is open,
  // that specifically means "previewing the draft" (see HistoryPanel's own
  // previewedId doc comment, ported from gel-ui's historyCursor === -1).
  const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null);
  // Snapshot of the live editor/result state taken the moment the history
  // panel opens, restored by Cancel — so browsing past entries as a preview
  // never loses whatever you were in the middle of before opening it.
  const historyDraftRef = useRef<{
    queryText: string;
    paramValues: Record<string, string>;
    result: QueryResult | null;
    error: QueryErrorInfo | null;
    lastRunQueryText: string | null;
  } | null>(null);
  const [history, setHistory] = useLocalStorageState<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<QueryErrorInfo | null>(null);
  const [lastRunQueryText, setLastRunQueryText] = useState<string | null>(null);

  const params = useMemo(() => extractParams(queryText), [queryText]);
  // Recomputed on every keystroke — same live-validation pattern as the
  // globals modal, so a malformed param value blocks Run before the backend
  // ever sees it, with the reason for the block shown right on the field.
  const paramErrors = useMemo(() => {
    const result: Record<string, string | null> = {};
    for (const p of params) {
      const raw = paramValues[p.name]?.trim();
      result[p.name] = raw ? validateCastValue(raw, p.castType) : null;
    }
    return result;
  }, [params, paramValues]);
  const hasParamErrors =
    Object.values(paramErrors).some((e) => e !== null) ||
    params.some(
      (p) =>
        p.castConflict !== null ||
        // A tuple/array param always has a valid default draft (a
        // fully-populated tuple, or an empty array — see ParamsPanel's
        // TupleParamEditor/ArrayParamEditor) — never "missing" the way a
        // blank scalar input is.
        (p.required &&
          !resolveTupleParamMembers(p.castType, schema) &&
          !resolveArrayParamElement(p.castType, schema) &&
          !paramValues[p.name]?.trim())
    );
  const isOutdated = result !== null && lastRunQueryText !== null && queryText !== lastRunQueryText;
  const canRun = queryText.trim().length > 0 && !hasParamErrors;

  // A discriminated union, not two separate mutations — runQuery needs a
  // single in-flight/error state regardless of which kind of query was
  // submitted. Same soft-keyword convention as pylon-core's own parser and
  // the REPL's ANALYZE_PREFIX_RE.
  const mutation = useMutation({
    mutationFn: async ({pyql, paramsDict}: {pyql: string; paramsDict?: Record<string, unknown>}) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      return /^\s*analyze\b/i.test(pyql)
        ? ({kind: "analyze", data: await api.analyzeQuery(pyql, paramsDict, controller.signal)} as const)
        : ({kind: "rows", data: await api.runQuery(pyql, paramsDict, controller.signal)} as const);
    },
  });

  const runQuery = () => {
    const pyql = editorRef.current?.getValue().trim();
    if (!pyql) return;

    const paramsDict =
      params.length > 0
        ? Object.fromEntries(
            params.map((p) => {
              const raw = paramValues[p.name] ?? "";
              const tupleMembers = resolveTupleParamMembers(p.castType, schema);
              if (tupleMembers) {
                try {
                  return [p.name, raw ? JSON.parse(raw) : defaultTupleValue(tupleMembers, schema!)];
                } catch {
                  return [p.name, defaultTupleValue(tupleMembers, schema!)];
                }
              }
              const arrayElement = resolveArrayParamElement(p.castType, schema);
              if (arrayElement) {
                try {
                  const parsed = raw ? JSON.parse(raw) : [];
                  return [p.name, Array.isArray(parsed) ? parsed : []];
                } catch {
                  return [p.name, []];
                }
              }
              return [p.name, coerceParamValue(raw, p.castType)];
            })
          )
        : undefined;

    mutation.mutate(
      {pyql, paramsDict},
      {
        onSuccess: (outcome) => {
          const result: QueryResult =
            outcome.kind === "analyze"
              ? {kind: "analyze", coarseGrained: outcome.data.coarse_grained, durationMs: outcome.data.duration_ms}
              : {
                  kind: "rows",
                  objects: outcome.data.objects,
                  durationMs: outcome.data.duration_ms,
                  shape: outcome.data.shape,
                  floatMarkers: outcome.data.floatMarkers,
                };
          setResult(result);
          setError(null);
          setLastRunQueryText(pyql);
          setHistory((h) =>
            [
              ...h,
              {
                id: crypto.randomUUID(),
                pyql,
                timestamp: Date.now(),
                objectCount: outcome.kind === "rows" ? outcome.data.objects.length : null,
                paramValues: {...paramValues},
                result,
                error: null,
              },
            ].slice(-MAX_HISTORY_ENTRIES)
          );
        },
        onError: (err) => {
          if (err instanceof DOMException && err.name === "AbortError") return; // cancelled, not a real error
          const errorInfo: QueryErrorInfo = err instanceof ApiError ? err.toQueryErrorInfo() : {message: String(err)};
          setResult(null);
          setError(errorInfo);
          setLastRunQueryText(pyql);
          setHistory((h) =>
            [
              ...h,
              {
                id: crypto.randomUUID(),
                pyql,
                timestamp: Date.now(),
                objectCount: null,
                paramValues: {...paramValues},
                result: null,
                error: errorInfo,
              },
            ].slice(-MAX_HISTORY_ENTRIES)
          );
        },
      }
    );
  };

  // Shared by both preview and load — the only difference between them is
  // whether the panel stays open afterward (see previewEntry/loadEntry).
  const applyToEditor = (
    pyql: string,
    nextParamValues: Record<string, string>,
    nextResult: QueryResult | null,
    nextError: QueryErrorInfo | null,
    nextLastRunQueryText: string | null
  ) => {
    editorRef.current?.setValue(pyql);
    setQueryText(pyql);
    setParamValues(nextParamValues);
    setParamsResetKey((k) => k + 1);
    setResult(nextResult);
    setError(nextError);
    setLastRunQueryText(nextLastRunQueryText);
  };

  const openHistory = () => {
    historyDraftRef.current = {queryText, paramValues, result, error, lastRunQueryText};
    setHistoryPreviewId(null);
    setHistoryOpen(true);
  };

  // Only updates the live editor/result panes — doesn't touch `history`
  // itself or close the panel, so you can click/arrow through past entries
  // and look at each one without committing to anything (see loadEntry for
  // the "actually apply this" action).
  const previewDraft = () => {
    if (historyPreviewId === null) return;
    const draft = historyDraftRef.current;
    if (draft) applyToEditor(draft.queryText, draft.paramValues, draft.result, draft.error, draft.lastRunQueryText);
    setHistoryPreviewId(null);
  };

  const previewEntry = (entry: HistoryEntry) => {
    if (historyPreviewId === entry.id) return;
    // Fallbacks guard against entries persisted before result/param caching
    // was added — localStorage may still hold those from an earlier session.
    applyToEditor(entry.pyql, entry.paramValues ?? {}, entry.result ?? null, entry.error ?? null, entry.pyql);
    setHistoryPreviewId(entry.id);
  };

  const loadEntry = (entry: HistoryEntry) => {
    applyToEditor(entry.pyql, entry.paramValues ?? {}, entry.result ?? null, entry.error ?? null, entry.pyql);
    setHistoryPreviewId(entry.id);
    setHistoryOpen(false);
  };

  const cancelHistory = () => {
    const draft = historyDraftRef.current;
    if (draft) applyToEditor(draft.queryText, draft.paramValues, draft.result, draft.error, draft.lastRunQueryText);
    setHistoryOpen(false);
  };

  const toggleHistory = () => (historyOpen ? cancelHistory() : openHistory());

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
      toggleHistory();
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Output
  return (
    <Card>
      <div className="flex h-11 shrink-0 items-center gap-2 bg-header border-b border-border px-2">
        <button
          type="button"
          onClick={toggleHistory}
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
          previewedId={historyPreviewId}
          onPreviewDraft={previewDraft}
          onPreviewEntry={previewEntry}
          onLoadEntry={loadEntry}
          onCancel={cancelHistory}
        />

        <Group orientation={orientation} className="min-w-0 flex-1">
          <Panel defaultSize={50} minSize={20} className="flex flex-col">
            <CodeEditor
              ref={editorRef}
              defaultValue={queryText}
              onChange={setQueryText}
              schema={schema}
              dark={resolvedTheme === "dark"}
              placeholder="SELECT Type { field, ... }"
              className="flex-1"
            />
            <ParamsPanel
              params={params}
              values={paramValues}
              errors={paramErrors}
              schema={schema}
              onChange={(name, raw) => setParamValues((v) => ({...v, [name]: raw}))}
              resetKey={paramsResetKey}
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
