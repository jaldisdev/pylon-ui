import type React from "react";
import {Loader2} from "lucide-react";

import {JsonTree} from "@/ui/JsonTree";

export interface QueryResult {
  rows: unknown[];
  durationMs: number;
}

interface ResultPanelProps {
  isRunning: boolean;
  result: QueryResult | null;
  error: string | null;
}

// Current query's result, rendered as a collapsible JsonTree (same component
// the REPL uses). No grid/tree toggle yet (that arrives with Data Explorer's
// TanStack Table work).
export const ResultPanel: React.FC<ResultPanelProps> = ({isRunning, result, error}) => {
  if (isRunning) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <pre className="h-full overflow-auto p-3 font-mono text-sm whitespace-pre-wrap text-red-500">
        {error}
      </pre>
    );
  }

  if (!result) {
    return <div className="flex h-full items-center justify-center text-sm text-fg-muted">No result yet</div>;
  }

  // Output
  return (
    <div className="h-full overflow-auto p-3">
      <JsonTree value={result.rows} />
      <div className="mt-1.5 text-xs text-fg-muted">
        {result.rows.length} row{result.rows.length === 1 ? "" : "s"} · {result.durationMs.toFixed(1)}ms
      </div>
    </div>
  );
};
