import type React from "react";
import {useRef, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useHotkeys} from "react-hotkeys-hook";

import {api, ApiError} from "@/lib/api/client";
import {CodeEditor, type CodeEditorHandle} from "@/lib/editor/CodeEditor";
import {useTheme} from "@/lib/theme/useTheme";
import {ReplEntry} from "@/features/repl/ReplEntry";

export interface HistoryEntry {
  id: number;
  pyql: string;
  rows?: unknown[];
  durationMs?: number;
  error?: string;
}

// Fully working REPL: a PyQL input (Mod+Enter to run) above a scrollback of
// query/result pairs. Calls POST /api/query directly — no saved queries or
// param inputs, that's the Query Editor's job.
export const ReplTab: React.FC = () => {
  const editorRef = useRef<CodeEditorHandle>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const {resolvedTheme} = useTheme();

  const mutation = useMutation({
    mutationFn: (pyql: string) => api.runQuery(pyql),
  });

  const runCurrentQuery = () => {
    const pyql = editorRef.current?.getValue().trim();
    if (!pyql) return;

    mutation.mutate(pyql, {
      onSuccess: (data) => {
        setHistory((h) => [
          ...h,
          {id: h.length, pyql, rows: data.rows, durationMs: data.duration_ms},
        ]);
      },
      onError: (err) => {
        setHistory((h) => [
          ...h,
          {id: h.length, pyql, error: err instanceof ApiError ? err.message : String(err)},
        ]);
      },
    });
    editorRef.current?.clear();
  };

  // enableOnContentEditable only bypasses react-hotkeys-hook's isContentEditable
  // check — CodeMirror's content div also carries role="textbox" for
  // accessibility, which trips a *separate*, earlier gate keyed off ARIA
  // roles/form tags. enableOnFormTags: true is required to get past that one too.
  // CodeMirror has its own Enter handler directly on that div, which would
  // otherwise still insert a newline: capture: true runs our listener before
  // the event reaches CodeMirror at all, and stopPropagation keeps it there.
  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      runCurrentQuery();
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Output
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-3">
        {history.map((entry) => (
          <ReplEntry key={entry.id} entry={entry} />
        ))}
      </div>
      <div className="border-t border-border p-2">
        <CodeEditor
          ref={editorRef}
          dark={resolvedTheme === "dark"}
          placeholder="SELECT Type { field, ... } — Mod+Enter to run"
          className="min-h-[4.5rem] rounded-md border border-border"
        />
      </div>
    </div>
  );
};
