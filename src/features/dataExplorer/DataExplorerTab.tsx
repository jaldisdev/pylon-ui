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
import {useEffect, useState} from "react";
import {Navigate, useParams} from "react-router-dom";
import {useHotkeys} from "react-hotkeys-hook";

import {useSchema} from "@/lib/api/useSchema";
import {useSessionStorageState} from "@/lib/hooks/useLocalStorageState";
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

  // Remembers the last splat (type + nested link-view stack) visited in this
  // tab session — sidebar/mobile nav always link to the bare "data" path
  // with no splat, so without this, navigating away (e.g. to the Query
  // Editor) and back always lost the nested view and fell back to the first
  // type, unlike gel-ui's own Data Explorer.
  const [lastPath, setLastPath] = useSessionStorageState<string | null>(`data-explorer-last-path:${branch}`, null);

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

  const stack = schema && splat ? parseStack(schema, splat) : null;

  // Keep the remembered path in sync with wherever the user actually
  // navigates to within Data Explorer — not just on mount, so drilling into
  // a link (or switching type) updates what's restored next time.
  useEffect(() => {
    if (splat && stack) setLastPath(splat);
  }, [splat, stack, setLastPath]);

  if (!schema) {
    return (
      <Card>
        <ComingSoon label="Loading schema…" />
      </Card>
    );
  }

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
    // No type in the URL at all — restore the last-visited path from this
    // session if it still resolves against the current schema (a type
    // could've been removed since), else fall back to the first available
    // (non-junction) type.
    const restored = lastPath && parseStack(schema, lastPath) ? lastPath : null;
    if (restored) {
      return <Navigate to={`${basePath}/${restored}`} replace />;
    }
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
