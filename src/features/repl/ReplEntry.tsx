import type React from "react";

import type {HistoryEntry} from "@/features/repl/ReplTab";

interface ReplEntryProps {
  entry: HistoryEntry;
}

// One query/result pair in the REPL scrollback. Results are shown as
// pretty-printed JSON for now — a real row grid is the Data Explorer's job.
export const ReplEntry: React.FC<ReplEntryProps> = ({entry}) => (
  <div className="mb-3 font-mono text-sm">
    <div className="text-fg-muted">
      <span className="text-accent">›</span> {entry.pyql}
    </div>
    {entry.error ? (
      <pre className="mt-1 whitespace-pre-wrap text-red-500">{entry.error}</pre>
    ) : (
      <>
        <pre className="mt-1 whitespace-pre-wrap text-fg">
          {JSON.stringify(entry.rows, null, 2)}
        </pre>
        {entry.durationMs !== undefined && (
          <div className="mt-0.5 text-xs text-fg-muted">{entry.durationMs.toFixed(1)}ms</div>
        )}
      </>
    )}
  </div>
);
