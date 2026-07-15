import type React from "react";
import {useState} from "react";
import {Navigate, useParams} from "react-router-dom";
import {useHotkeys} from "react-hotkeys-hook";

import {useSchema} from "@/lib/api/useSchema";
import {Card} from "@/ui/Card";
import {ComingSoon} from "@/ui/ComingSoon";
import {NotFound} from "@/ui/NotFound";
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

  // Mod+S opens Review Changes — only meaningful once there's something
  // pending; registered here (not DataExplorerView, which remounts on every
  // nested-view navigation) so it survives drilling into a link and back.
  useHotkeys(
    "mod+s",
    (event) => {
      event.preventDefault();
      if (hasPendingEdits) setReviewOpen(true);
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  if (!schema) {
    return (
      <Card>
        <ComingSoon label="Loading schema…" />
      </Card>
    );
  }

  const stack = splat ? parseStack(schema, splat) : null;

  if (!stack) {
    if (splat) {
      // An explicit path segment was given but didn't resolve (unknown
      // type, or a junction type — see SchemaType.junction — deliberately
      // excluded from browsing) — 404 rather than silently redirecting
      // somewhere the URL doesn't reflect.
      return (
        <Card>
          <NotFound label={`No object type named "${splat.split("/")[0]}"`} />
        </Card>
      );
    }
    // No type in the URL at all — redirect to the first available
    // (non-junction) type, mirroring gel-ui's own auto-redirect behavior.
    const first = schema.types.find((t) => !t.junction);
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
        {/* hasPendingEdits/reviewOpen live here, above DataExplorerView's
            per-navigation remount boundary — pending edits must survive
            drilling into a link and back, since they're tracked in a
            module-level store, not component state. The button itself
            renders inside DataExplorerView's own toolbar (not a separate bar
            above it) so it doesn't reflow the grid when it appears/disappears. */}
        <DataExplorerView
          key={stackToPath(stack)}
          stack={stack}
          basePath={basePath}
          hasPendingEdits={hasPendingEdits}
          onOpenReview={() => setReviewOpen(true)}
        />
      </Card>
      {reviewOpen && <ReviewEditsModal onClose={() => setReviewOpen(false)} />}
    </div>
  );
};
