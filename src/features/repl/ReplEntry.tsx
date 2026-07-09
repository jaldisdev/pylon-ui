import type React from "react";

import type {HistoryEntry} from "@/features/repl/ReplTab";
import {JsonTree} from "@/ui/JsonTree";

interface ReplEntryProps {
  entry: HistoryEntry;
}

// One query/result pair in the REPL scrollback, rendered with the same
// collapsible JsonTree the Query Editor uses.
export const ReplEntry: React.FC<ReplEntryProps> = ({entry}) => (
  <div className="mb-3 font-mono text-sm">
    <div className="text-fg-muted">
      <span className="text-accent">›</span> {entry.pyql}
    </div>
    {entry.error ? (
      <pre className="mt-1 whitespace-pre-wrap text-red-500">{entry.error}</pre>
    ) : (
      <>
        <JsonTree value={entry.rows} className="mt-1" />
        {entry.durationMs !== undefined && (
          <div className="mt-0.5 text-xs text-fg-muted">{entry.durationMs.toFixed(1)}ms</div>
        )}
      </>
    )}
  </div>
);
