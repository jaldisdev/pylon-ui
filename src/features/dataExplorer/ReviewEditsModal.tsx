import type React from "react";
import {useMemo, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useHotkeys} from "react-hotkeys-hook";

import {api} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {CodeBlock, type Range} from "@/lib/editor/CodeBlock";
import {getAllChildren} from "@/lib/editor/lang-pyql/syntaxTree";
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
// (discards everything). Each `<type>$paramName` reference is decorated in
// place with its real resolved value instead of showing the raw
// placeholder — the query still executes with real bound params underneath
// (see api.runQuery below), this is purely a display substitution over the
// syntax-highlighted code.
export const ReviewEditsModal: React.FC<ReviewEditsModalProps> = ({onClose}) => {
  const {data: schema} = useSchema();
  const queryClient = useQueryClient();

  const propertyEdits = useDataEditsStore((s) => s.propertyEdits);
  const linkEdits = useDataEditsStore((s) => s.linkEdits);
  const insertEdits = useDataEditsStore((s) => s.insertEdits);
  const deleteEdits = useDataEditsStore((s) => s.deleteEdits);
  const clearAllPendingEdits = useDataEditsStore((s) => s.clearAllPendingEdits);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Recomputed on every render (any edit-map change re-renders this
  // component, since each is its own store subscription above).
  const generated = useMemo(
    () => (schema ? generateStatements({propertyEdits, linkEdits, insertEdits, deleteEdits}, schema) : null),
    [propertyEdits, linkEdits, insertEdits, deleteEdits, schema]
  );

  // hasErrors/onCommit/onClearAll are plain consts, not hooks, but still
  // defined ahead of the early return below so useHotkeys (itself a hook,
  // and so unconditional-call-order-sensitive) can reference onCommit —
  // null-safe since `generated` may not exist yet on this render.
  const hasErrors = !!generated?.error || (generated?.statements.some((s) => s.error) ?? false);

  const onCommit = async () => {
    if (!generated?.finalQuery || hasErrors) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await api.runQuery(generated.finalQuery, generated.params);
      clearAllPendingEdits();
      await queryClient.invalidateQueries({queryKey: ["dataExplorer"]});
      onClose();
    } catch (e) {
      // Deliberately not clearing edits on failure — the user should be able
      // to fix/undo and retry.
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  };

  const onClearAll = () => {
    clearAllPendingEdits();
    onClose();
  };

  // DataExplorerTab's own Mod+S opens this modal; pressing it again while
  // already open commits instead.
  useHotkeys(
    "mod+s",
    (event) => {
      event.preventDefault();
      if (!committing) onCommit();
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  if (!generated) return null;

  // Output
  return (
    <Modal title="Review Changes" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        {generated.error && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{generated.error}</div>}

        {generated.statements.map((statement) => (
          <div key={statement.varName} className="flex flex-col gap-1">
            <div className="font-mono text-xs text-fg-muted">{statement.varName} :=</div>
            {/* The modal itself grows to fit this (see size="lg" above), but
                caps out at a viewport-relative max width — this scrolls
                horizontally instead of wrapping mid-pill once content
                exceeds that cap (e.g. on a narrow/mobile viewport). */}
            <div className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2">
              <CodeBlock
                code={statement.code}
                className="m-0 whitespace-pre font-mono text-xs"
                customRanges={(tree) =>
                getAllChildren(tree.topNode, "QueryParameter").map((node) => {
                  const range: Range = [node.from, node.to];
                  return {
                    range,
                    renderer: (_range, content) => {
                      const paramName = statement.code.slice(node.from, node.to).split("$")[1];
                      const value = generated.params[paramName];
                      const typeTag = generated.paramTypeTags[paramName] ?? null;
                      // Drop the last highlighted child — the `$paramName`
                      // text itself — keeping only the cast-bracket prefix
                      // (e.g. `<int64>`), then append the real value in its
                      // place.
                      const rawChildren = content.props.children;
                      const children = Array.isArray(rawChildren) ? rawChildren.slice(0, -1) : [];
                      // The source text's own cast (e.g. `<uuid>`, `<default::Gender>`)
                      // sits right before this value, so a scalar's `<tag>` here
                      // would just repeat it — drop it by nulling the tag out
                      // entirely. Only `compact` for enums, which purely
                      // suppresses that same redundant prefix; never for
                      // namedTuple, since `compact` also strips string quotes
                      // and that propagates to every nested member (a tuple's
                      // own member types aren't shown anywhere else, so their
                      // tags/quotes must stay intact).
                      const displayTypeTag = typeTag?.kind === "scalar" ? null : typeTag;
                      // Two-tone pill: the cast prefix sits on a muted
                      // capsule, the resolved value on a lighter inset
                      // segment butted up against it.
                      return (
                        <span className="inline-flex h-[22px] items-center overflow-hidden rounded-full bg-surface-active pl-1.5 align-middle">
                          <span className="whitespace-pre">{children}</span>
                          <span className="ml-1.5 flex h-full items-center bg-header px-1.5 font-semibold text-fg">
                            <ScalarValue
                              value={value}
                              typeTag={displayTypeTag}
                              compact={typeTag?.kind === "enum"}
                              schema={schema}
                            />
                          </span>
                        </span>
                      );
                    },
                  };
                })
                }
              />
            </div>
            {statement.error && <div className="text-xs text-red-500">{statement.error}</div>}
          </div>
        ))}

        {generated.statements.length === 0 && <div className="text-sm text-fg-muted">Nothing pending.</div>}

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
