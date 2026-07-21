import type React from "react";
import {useEffect, useRef, useState} from "react";
import {useParams} from "react-router-dom";
import {useMutation} from "@tanstack/react-query";
import {useHotkeys} from "react-hotkeys-hook";

import {api, ApiError, type QueryErrorInfo, type ValueShapeTag} from "@/lib/api/client";
import type {FloatMarkerTree} from "@/lib/api/floatMarkers";
import {useSchema} from "@/lib/api/useSchema";
import {CodeEditor, type CodeEditorHandle} from "@/lib/editor/CodeEditor";
import {useLocalStorageState} from "@/lib/hooks/useLocalStorageState";
import {useTheme} from "@/lib/theme/useTheme";
import {Card} from "@/ui/Card";
import {formatAnalyzeResult} from "@/features/repl/analyzeFormat";
import {ReplEntry} from "@/features/repl/ReplEntry";
import {ReplHeader} from "@/features/repl/ReplHeader";

const HISTORY_STORAGE_KEY = "pylon-ui-repl-history";

export interface HistoryEntry {
  id: number;
  pyql: string;
  timestamp: number;
  objects?: unknown[];
  durationMs?: number;
  // Entries persisted before this field was added won't have it; ReplEntry
  // falls back to a pointer-name guess when no shape is available.
  shape?: ValueShapeTag;
  // Same "persisted before this field existed" caveat as shape above.
  floatMarkers?: FloatMarkerTree;
  error?: QueryErrorInfo;
  isHelp?: boolean; // \help output — rendered as static text, not a query result
  // Pre-formatted `analyze <query>` text (see analyzeFormat.ts) — rendered
  // verbatim in a <pre>, the same way isHelp's static banner text is.
  analyze?: string;
}

// Soft keyword, same convention as pylon-core's own parser (see
// parse/parser.rs's at_analyze_keyword) — only recognized as the leading
// token, "analyze" stays a legal identifier everywhere else.
const ANALYZE_PREFIX_RE = /^\s*analyze\b/i;

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

// REPL: a Pylon ASCII banner, a scrollback of `branch[pyql]> query` entries,
// and a terminal-flavored prompt line at the bottom. Supports
// \help/\clear commands and Mod+ArrowUp/Down history navigation, matching
// the shortcuts the banner itself advertises.
export const ReplTab: React.FC = () => {
  const {branch = "main"} = useParams();
  const editorRef = useRef<CodeEditorHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // localStorage (not sessionStorage) — persists across reloads until
  // \clear.
  const [history, setHistory] = useLocalStorageState<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const draftBeforeHistoryRef = useRef("");
  const {resolvedTheme} = useTheme();
  const {data: schema} = useSchema();

  // Keep the newest entry (and the prompt line below it) in view as history
  // grows — a plain scrollTop bump after each render is sufficient for our
  // non-virtualized, session-sized history.
  useEffect(() => {
    scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight});
  }, [history]);

  // Land ready to type, matching a real terminal/REPL.
  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  // A discriminated union, not two separate mutations — runCurrentQuery
  // needs a single in-flight/error state regardless of which kind of query
  // was submitted.
  const mutation = useMutation({
    mutationFn: async (pyql: string) =>
      ANALYZE_PREFIX_RE.test(pyql)
        ? ({kind: "analyze", data: await api.analyzeQuery(pyql)} as const)
        : ({kind: "rows", data: await api.runQuery(pyql)} as const),
  });

  const runHelp = () => {
    setHistory((h) => [...h, {id: h.length, pyql: "\\help", timestamp: Date.now(), isHelp: true}]);
  };

  const clearHistory = () => setHistory([]);

  const runCurrentQuery = () => {
    const text = editorRef.current?.getValue().trim();
    if (!text) return;
    setHistoryIndex(null);

    if (text === "\\clear") {
      clearHistory();
      editorRef.current?.clear();
      return;
    }
    if (text === "\\help") {
      runHelp();
      editorRef.current?.clear();
      return;
    }

    mutation.mutate(text, {
      onSuccess: (result) => {
        setHistory((h) => [
          ...h,
          result.kind === "analyze"
            ? {
                id: h.length,
                pyql: text,
                timestamp: Date.now(),
                analyze: formatAnalyzeResult(text, result.data.coarse_grained),
                durationMs: result.data.duration_ms,
              }
            : {
                id: h.length,
                pyql: text,
                timestamp: Date.now(),
                objects: result.data.objects,
                durationMs: result.data.duration_ms,
                shape: result.data.shape,
                floatMarkers: result.data.floatMarkers,
              },
        ]);
      },
      onError: (err) => {
        setHistory((h) => [
          ...h,
          {
            id: h.length,
            pyql: text,
            timestamp: Date.now(),
            error: err instanceof ApiError ? err.toQueryErrorInfo() : {message: String(err)},
          },
        ]);
      },
    });
    editorRef.current?.clear();
  };

  // Shell-style history recall — only real queries (not \help entries),
  // most-recent-first on the first ArrowUp, restoring the in-progress draft
  // once you arrow back past the newest entry.
  const navigateHistory = (direction: -1 | 1) => {
    const queries = history.filter((e) => !e.isHelp).map((e) => e.pyql);
    if (queries.length === 0) return;

    if (historyIndex === null) {
      if (direction !== -1) return;
      draftBeforeHistoryRef.current = editorRef.current?.getValue() ?? "";
      const nextIndex = queries.length - 1;
      setHistoryIndex(nextIndex);
      editorRef.current?.setValue(queries[nextIndex]);
      return;
    }

    const nextIndex = historyIndex + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= queries.length) {
      setHistoryIndex(null);
      editorRef.current?.setValue(draftBeforeHistoryRef.current);
      return;
    }
    setHistoryIndex(nextIndex);
    editorRef.current?.setValue(queries[nextIndex]);
  };

  // enableOnContentEditable only bypasses react-hotkeys-hook's isContentEditable
  // check — CodeMirror's content div also carries role="textbox" for
  // accessibility, which trips a *separate*, earlier gate keyed off ARIA
  // roles/form tags. enableOnFormTags: true is required to get past that one too.
  // CodeMirror has its own Enter handler directly on that div, which would
  // otherwise still insert a newline: capture: true runs our listener before
  // the event reaches CodeMirror at all, and stopPropagation keeps it there.
  const hotkeyOptions = {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}};

  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      runCurrentQuery();
    },
    hotkeyOptions
  );
  useHotkeys(
    "mod+up",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigateHistory(-1);
    },
    hotkeyOptions
  );
  useHotkeys(
    "mod+down",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigateHistory(1);
    },
    hotkeyOptions
  );

  // Output — normal top-to-bottom flow: banner always first, entries in
  // chronological order, prompt line last (a plain sibling after the
  // scrollback content, not a reversed/pinned element). The useEffect above
  // keeps it scrolled to the bottom.
  return (
    <Card>
      <div ref={scrollRef} className="flex flex-1 flex-col overflow-auto p-3">
        <ReplHeader onRunHelp={runHelp} onClear={clearHistory} />
        {history.map((entry, i) => (
          <ReplEntry
            key={entry.id}
            entry={entry}
            branch={branch}
            showDateHeader={i === 0 || !sameDay(history[i - 1].timestamp, entry.timestamp)}
          />
        ))}
        <div className="flex items-center gap-1.5 font-mono text-sm">
          <span className="text-fg-muted">{branch}</span>
          <span className="font-medium text-fg">[pyql]</span>
          <span className="text-fg-muted">{">"}</span>
          <CodeEditor
            ref={editorRef}
            schema={schema}
            dark={resolvedTheme === "dark"}
            placeholder="select Type { field, ... }"
            className="min-h-6 flex-1"
          />
        </div>
      </div>
    </Card>
  );
};
