import type React from "react";
import clsx from "clsx";
import {X} from "lucide-react";

import type {QueryErrorInfo} from "@/lib/api/client";
import type {QueryResult} from "@/features/queryEditor/ResultPanel";

export interface HistoryEntry {
  id: string;
  pyql: string;
  timestamp: number;
  // null for an errored run *or* an analyze run (no "objects" to count) —
  // the preview line below derives which from entry.error/entry.result.kind
  // directly rather than overloading this field further.
  objectCount: number | null;
  // Cached so selecting a past entry restores the exact same state (params,
  // result, error) instantly — not just the query text, which would
  // otherwise need a re-run against a possibly-since-changed database.
  paramValues: Record<string, string>;
  result: QueryResult | null;
  error: QueryErrorInfo | null;
}

interface HistoryPanelProps {
  entries: HistoryEntry[];
  open: boolean;
  onClose: () => void;
  onSelect: (entry: HistoryEntry) => void;
}

// Slide-in side panel listing past queries, persisted to localStorage (see
// useLocalStorageState in QueryEditorTab) so it survives a page reload.
// Capped at a few hundred entries, so no virtualization.
export const HistoryPanel: React.FC<HistoryPanelProps> = ({entries, open, onClose, onSelect}) => {
  if (!open) return null;

  // Output
  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="text-xs font-medium text-fg-muted">History</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="p-3 text-xs text-fg-muted italic">No queries run yet</div>
        ) : (
          [...entries].reverse().map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry)}
              className="block w-full border-b border-border px-2 py-1.5 text-left hover:bg-surface-hover"
            >
              <div className="truncate font-mono text-xs text-fg">{entry.pyql}</div>
              <div className={clsx("mt-0.5 text-2xs", entry.error ? "text-red-500" : "text-fg-muted")}>
                {entry.error
                  ? "error"
                  : entry.result?.kind === "analyze"
                    ? "analyze"
                    : `${entry.objectCount} object${entry.objectCount === 1 ? "" : "s"}`}
                {" · "}
                {new Date(entry.timestamp).toLocaleTimeString()}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
