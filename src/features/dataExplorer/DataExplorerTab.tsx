import type React from "react";
import {useState} from "react";
import {Navigate, useParams} from "react-router-dom";

import {useSchema} from "@/lib/api/useSchema";
import {Card} from "@/ui/Card";
import {ComingSoon} from "@/ui/ComingSoon";
import {DataExplorerView} from "@/features/dataExplorer/DataExplorerView";
import {ReviewEditsModal} from "@/features/dataExplorer/ReviewEditsModal";
import {parseStack, stackToPath} from "@/features/dataExplorer/stack";
import {useHasPendingEdits} from "@/features/dataExplorer/state/editsStore";

// Data Explorer root: parses the deep-linkable nested-view path out of the
// URL (see stack.ts), and remounts DataExplorerView (via `key`) whenever the
// view identity changes so its sort/filter state resets between levels.
export const DataExplorerTab: React.FC = () => {
  const {branch, "*": splat} = useParams();
  const {data: schema} = useSchema();
  const basePath = `/${branch}/data`;
  const hasPendingEdits = useHasPendingEdits();
  const [reviewOpen, setReviewOpen] = useState(false);

  if (!schema) {
    return (
      <Card>
        <ComingSoon label="Loading schema…" />
      </Card>
    );
  }

  const stack = splat ? parseStack(schema, splat) : null;

  if (!stack) {
    // No (or an invalid/stale) type in the URL — redirect to the first
    // available type, mirroring gel-ui's own auto-redirect behavior rather
    // than silently rendering content the URL doesn't reflect.
    const first = schema.types[0];
    return first ? (
      <Navigate to={`${basePath}/${first.module}::${first.name}`} replace />
    ) : (
      <Card>
        <ComingSoon label="No object types in schema" />
      </Card>
    );
  }

  // Output
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {stack.length > 1 && (
        // The "peeking card behind this one" cue for a nested view — a
        // sibling *before* Card, not nested inside it: Card's own
        // overflow-hidden would otherwise clip this right off, since the
        // whole point is that it pokes out above Card's rounded top edge.
        <div className="mx-2 h-2 shrink-0 rounded-t-xl bg-surface-hover border-1 border-b-0 border-black/2.5 dark:border-white/2.5" />
      )}
      <Card className="flex-1">
        {/* Lives above DataExplorerView's per-navigation remount boundary —
            pending edits (and this trigger) must survive drilling into a
            link and back, since they're tracked in a module-level store, not
            component state. Only renders at all once there's something
            pending, matching gel-ui exactly (not just enabled/disabled). */}
        {hasPendingEdits && (
          <div className="flex h-9 shrink-0 items-center justify-end border-b border-border bg-header px-2">
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="rounded-md bg-success px-3 py-1 text-2sm font-medium text-success-fg transition duration-300 hover:opacity-90"
            >
              Review Changes
            </button>
          </div>
        )}
        <DataExplorerView key={stackToPath(stack)} stack={stack} basePath={basePath} />
      </Card>
      {reviewOpen && <ReviewEditsModal onClose={() => setReviewOpen(false)} />}
    </div>
  );
};
