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
import {Loader2} from "lucide-react";

import type {CoarseGrainedNode, QueryErrorInfo, ValueShapeTag} from "@/lib/api/client";
import type {FloatMarkerTree} from "@/lib/api/floatMarkers";
import {AnalyzeView} from "@/features/queryEditor/AnalyzeView";
import {JsonTree} from "@/ui/JsonTree";
import {QueryErrorView} from "@/ui/QueryErrorView";

export interface RowsQueryResult {
  kind: "rows";
  objects: unknown[];
  durationMs: number;
  // Optional — a result restored from a history entry persisted before this
  // field was added won't have it; JsonTree falls back to a pointer-name
  // guess when no shape is available.
  shape?: ValueShapeTag;
  // Same "persisted before this field existed" caveat as shape above.
  floatMarkers?: FloatMarkerTree;
}

export interface AnalyzeQueryResult {
  kind: "analyze";
  coarseGrained: CoarseGrainedNode;
  durationMs: number;
}

export type QueryResult = RowsQueryResult | AnalyzeQueryResult;

interface ResultPanelProps {
  isRunning: boolean;
  result: QueryResult | null;
  error: QueryErrorInfo | null;
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
    return <QueryErrorView error={error} className="h-full overflow-auto p-3" />;
  }

  if (!result) {
    return <div className="flex h-full items-center justify-center text-sm text-fg-muted">No result yet</div>;
  }

  if (result.kind === "analyze") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-auto">
          <AnalyzeView root={result.coarseGrained} />
        </div>
        <div className="flex h-7 shrink-0 select-none items-center justify-center bg-surface text-2xs text-fg-muted">
          {result.durationMs.toFixed(1)}ms
        </div>
      </div>
    );
  }

  // Output — the row count/duration is a sticky footer (like a Finder status
  // bar), not part of the scrolling content, so it stays visible regardless
  // of scroll position.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto p-3">
        <JsonTree
          value={result.objects}
          valueShape={result.shape !== undefined ? {kind: "array", element: result.shape} : undefined}
          floatMarkers={result.floatMarkers}
        />
      </div>
      <div className="flex h-7 shrink-0 select-none items-center justify-center bg-surface text-2xs text-fg-muted">
        {result.objects.length} object{result.objects.length === 1 ? "" : "s"} · {result.durationMs.toFixed(1)}ms
      </div>
    </div>
  );
};
