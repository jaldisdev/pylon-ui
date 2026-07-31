import type React from "react";
import {useEffect, useMemo, useRef} from "react";
import clsx from "clsx";

import type {QueryErrorInfo} from "@/lib/api/client";
import type {QueryResult} from "@/features/queryEditor/ResultPanel";
import {getThumbnailData, renderThumbnail} from "@/features/queryEditor/historyThumbnail";

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
  // null means "the draft" (the query/result active before the panel was
  // opened) — matches gel-ui's historyCursor === -1 convention.
  previewedId: string | null;
  onPreviewDraft: () => void;
  onPreviewEntry: (entry: HistoryEntry) => void;
  onLoadEntry: (entry: HistoryEntry) => void;
  onCancel: () => void;
}

// Ported from gel-ui's shared/studio/tabs/queryEditor/history.tsx: clicking
// an entry only *previews* it (updates the editor/result panes live so you
// can look through history without committing to anything — see
// QueryEditorTab.tsx's previewEntry), while hovering (or having it be the
// currently-previewed one) reveals a "Load" button that actually applies it.
// "Cancel" restores whatever was active before the panel opened and closes
// it — it does not just close, unlike a plain X button would.
export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  entries,
  open,
  previewedId,
  onPreviewDraft,
  onPreviewEntry,
  onLoadEntry,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) containerRef.current?.focus();
  }, [open]);

  // Newest first, matching gel-ui's own queryHistory ordering (new entries
  // are prepended there; pylon-ui's own `history` array appends, so this is
  // reversed once here rather than changing that storage convention).
  const displayEntries = useMemo(() => [...entries].reverse(), [entries]);

  if (!open) return null;

  const previewedIndex = previewedId === null ? -1 : displayEntries.findIndex((e) => e.id === previewedId);

  const navigate = (direction: 1 | -1) => {
    const next = Math.max(-1, Math.min(previewedIndex + direction, displayEntries.length - 1));
    if (next === -1) onPreviewDraft();
    else onPreviewEntry(displayEntries[next]);
  };

  // Output
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          navigate(-1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          navigate(1);
        } else if (e.key === "Enter" && previewedIndex !== -1) {
          onLoadEntry(displayEntries[previewedIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="flex w-[194px] shrink-0 flex-col border-r border-border bg-surface outline-none"
    >
      <div className="flex-1 overflow-auto">
        <button
          type="button"
          onClick={onPreviewDraft}
          className={clsx(
            "mx-4 mt-4 flex h-16 w-[162px] items-center justify-center rounded-lg border border-dashed text-xs italic text-fg-muted hover:bg-surface-hover",
            previewedId === null ? "border-accent" : "border-border"
          )}
        >
          draft query
        </button>
        {displayEntries.length === 0 ? (
          <div className="mx-4 mt-4 text-xs text-fg-muted italic">No queries run yet</div>
        ) : (
          displayEntries.map((entry, i) => {
            const showDateHeader = i === 0 || !sameDay(displayEntries[i - 1].timestamp, entry.timestamp);
            const selected = entry.id === previewedId;
            return (
              <div key={entry.id}>
                {showDateHeader && (
                  <div className="mx-4 mt-4 mb-2 flex items-center gap-2 text-2xs text-fg-muted">
                    <div className="h-px flex-1 bg-border" />
                    {new Date(entry.timestamp).toLocaleDateString()}
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={-1}
                  onClick={() => onPreviewEntry(entry)}
                  className={clsx(
                    "group relative mx-4 mb-4 h-[105px] w-[162px] cursor-pointer overflow-hidden rounded-lg border bg-surface-hover/40 hover:bg-surface-hover",
                    selected ? "border-accent outline-2 outline-accent -outline-offset-2" : "border-border"
                  )}
                >
                  {renderThumbnail(getThumbnailData(entry.pyql))}
                  <div
                    className={clsx(
                      "absolute bottom-2 right-2 rounded-full bg-surface px-2 py-0.5 text-2xs",
                      entry.error ? "text-red-500" : "text-fg-muted"
                    )}
                  >
                    {entry.error
                      ? "error"
                      : entry.result?.kind === "analyze"
                        ? "analyze"
                        : `${entry.objectCount} object${entry.objectCount === 1 ? "" : "s"}`}
                    {" · "}
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoadEntry(entry);
                    }}
                    className={clsx(
                      "absolute bottom-2 left-2 rounded-full bg-accent px-2.5 py-0.5 text-2xs font-medium text-accent-fg opacity-0 transition-opacity group-hover:opacity-100",
                      selected && "opacity-100"
                    )}
                  >
                    Load
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex h-11 shrink-0 items-center border-t border-border px-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full bg-surface-active px-3 py-1 text-xs text-fg hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
