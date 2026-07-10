import type React from "react";
import {useMemo, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";

import {api} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {useTheme} from "@/lib/theme/useTheme";
import {CodeEditor} from "@/lib/editor/CodeEditor";
import {ConfirmButton} from "@/ui/ConfirmButton";
import {Modal} from "@/ui/Modal";
import {ScalarValue} from "@/ui/ScalarValue";
import {useDataEditsStore} from "@/features/dataExplorer/state/editsStore";
import {generateStatements} from "@/features/dataExplorer/state/generateStatements";

interface ReviewEditsModalProps {
  onClose: () => void;
}

// Shows every pending edit as the real generated PyQL it'll run — confirm
// (executes the single combined query and clears all edits) or withdraw
// (discards everything) — matching gel-ui's Review Changes modal. Unlike
// gel-ui, params are shown as a separate list below each statement rather
// than substituted inline into the code block (that needs walking decoration
// widgets into a live CodeMirror view — a fair v1 simplification, not a
// silent drop: the same information is present, just laid out differently).
export const ReviewEditsModal: React.FC<ReviewEditsModalProps> = ({onClose}) => {
  const {data: schema} = useSchema();
  const {resolvedTheme} = useTheme();
  const queryClient = useQueryClient();

  const propertyEdits = useDataEditsStore((s) => s.propertyEdits);
  const linkEdits = useDataEditsStore((s) => s.linkEdits);
  const insertEdits = useDataEditsStore((s) => s.insertEdits);
  const deleteEdits = useDataEditsStore((s) => s.deleteEdits);
  const clearAllPendingEdits = useDataEditsStore((s) => s.clearAllPendingEdits);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Recomputed on every render (any edit-map change re-renders this
  // component, since each is its own store subscription above) — the plain-
  // React equivalent of gel-ui's MobX-observer-driven live recomputation.
  const generated = useMemo(
    () => (schema ? generateStatements({propertyEdits, linkEdits, insertEdits, deleteEdits}, schema) : null),
    [propertyEdits, linkEdits, insertEdits, deleteEdits, schema]
  );

  if (!generated) return null;

  const hasErrors = !!generated.error || generated.statements.some((s) => s.error);

  const onCommit = async () => {
    if (!generated.finalQuery || hasErrors) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await api.runQuery(generated.finalQuery, generated.params);
      clearAllPendingEdits();
      await queryClient.invalidateQueries({queryKey: ["dataExplorer"]});
      onClose();
    } catch (e) {
      // Deliberately not clearing edits on failure — the user should be able
      // to fix/undo and retry, matching gel-ui.
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  };

  const onClearAll = () => {
    clearAllPendingEdits();
    onClose();
  };

  // Output
  return (
    <Modal title="Review Changes" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {generated.error && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{generated.error}</div>}

        {generated.statements.map((statement) => (
          <div key={statement.varName} className="flex flex-col gap-1">
            <div className="font-mono text-xs text-fg-muted">{statement.varName} :=</div>
            <CodeEditor
              key={`${statement.varName}:${statement.code}`}
              defaultValue={statement.code}
              dark={resolvedTheme === "dark"}
              readOnly
              className="rounded-md border border-border text-xs"
            />
            {statement.error && <div className="text-xs text-red-500">{statement.error}</div>}
          </div>
        ))}

        {generated.statements.length === 0 && <div className="text-sm text-fg-muted">Nothing pending.</div>}

        {Object.keys(generated.params).length > 0 && (
          <div className="rounded-md border border-border p-2">
            <div className="mb-1 text-2xs tracking-wide text-fg-muted uppercase">Parameters</div>
            <div className="flex flex-col gap-0.5 font-mono text-xs">
              {Object.entries(generated.params).map(([name, value]) => (
                <div key={name} className="flex gap-2">
                  <span className="text-fg-muted">${name} =</span>
                  <ScalarValue value={value} typeTag={null} compact />
                </div>
              ))}
            </div>
          </div>
        )}

        {commitError && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{commitError}</div>}

        <div className="flex items-center justify-between gap-2 pt-2">
          <ConfirmButton label="Clear all changes" onConfirm={onClearAll} />
          <button
            type="button"
            disabled={hasErrors || committing || !generated.finalQuery}
            onClick={onCommit}
            className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-fg transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {committing ? "Committing…" : "Commit changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
