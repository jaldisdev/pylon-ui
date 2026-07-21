import type React from "react";
import {useState} from "react";
import clsx from "clsx";

import {HELP_TEXT} from "@/features/repl/banner";
import type {HistoryEntry} from "@/features/repl/ReplTab";
import {JsonTree} from "@/ui/JsonTree";
import {QueryErrorView} from "@/ui/QueryErrorView";

interface ReplEntryProps {
  entry: HistoryEntry;
  branch: string;
  showDateHeader: boolean;
}

// Truncates by *rendered line count* (16 lines), not top-level item
// count — a handful of wide objects can blow past that just as easily as
// many narrow ones. Approximated here per top-level item: 1 line for the
// opening brace, 1 for the closing brace, plus 1 per field (nested values
// aren't walked further — close enough for typical REPL result shapes).
const MAX_VISIBLE_LINES = 16;

const estimateLines = (value: unknown): number => {
  if (value === null || typeof value !== "object") return 1;
  const keys = Object.keys(value as object).filter((k) => k !== "__pylon_type__");
  return 2 + keys.length;
};

// Always shows at least one item, even if it alone exceeds the budget.
const countVisible = (objects: unknown[]): number => {
  let linesUsed = 0;
  let count = 0;
  for (const obj of objects) {
    const lines = estimateLines(obj);
    if (count > 0 && linesUsed + lines > MAX_VISIBLE_LINES) break;
    linesUsed += lines;
    count++;
  }
  return count;
};

// One query/result pair, styled as its own bordered card: a lighter header
// strip (rounded top corners only) holding the `branch[pyql]> query` prompt
// line, with the result/error/help output below it inside the same card.
export const ReplEntry: React.FC<ReplEntryProps> = ({entry, branch, showDateHeader}) => {
  const [showAll, setShowAll] = useState(false);

  const objects = entry.objects ?? [];
  const visibleCount = showAll ? objects.length : countVisible(objects);
  const truncated = visibleCount < objects.length;
  const visible = truncated ? objects.slice(0, visibleCount) : objects;

  // Output
  return (
    <div>
      {showDateHeader && (
        <div className="my-2 text-center text-2xs text-fg-muted">{new Date(entry.timestamp).toLocaleDateString()}</div>
      )}
      <div className="my-3 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-1.5 bg-header px-2.5 py-1.5 font-mono text-sm">
          <span className="text-fg-muted">{branch}</span>
          <span className="font-medium text-fg">[pyql]</span>
          <span className="text-fg-muted">{">"}</span>
          <span className="min-w-0 flex-1 truncate text-fg">{entry.pyql}</span>
          <span className="shrink-0 text-2xs text-fg-muted">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className="px-3 py-2.5">
          {entry.isHelp ? (
            <pre className="font-mono text-sm whitespace-pre-wrap text-fg-muted">{HELP_TEXT}</pre>
          ) : entry.error ? (
            <QueryErrorView error={entry.error} />
          ) : entry.analyze !== undefined ? (
            <pre className="overflow-x-auto font-mono text-sm whitespace-pre text-fg">{entry.analyze}</pre>
          ) : (
            <>
              {/* A ::after overlay, absolutely positioned over the bottom of
                  this wrapper, guarantees it paints in front of the tree's
                  own rows regardless of DOM/margin order — fading the last
                  bit of the cut-off content into the card background. */}
              <div
                className={clsx(
                  "relative",
                  truncated &&
                    "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-8 after:content-[''] after:bg-[linear-gradient(0deg,var(--color-surface),var(--color-surface)_12px,transparent)]"
                )}
              >
                <JsonTree
                  value={visible}
                  valueShape={entry.shape !== undefined ? {kind: "array", element: entry.shape} : undefined}
                  floatMarkers={entry.floatMarkers}
                />
              </div>
              {truncated && (
                <div className="pb-1 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black uppercase opacity-80 shadow-[0_0_6px_rgba(0,0,0,0.06)] hover:opacity-100"
                  >
                    Show more…
                  </button>
                </div>
              )}
              {entry.durationMs !== undefined && (
                <div className="mt-2 text-center text-2xs text-fg-muted">{entry.durationMs.toFixed(1)}ms</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
