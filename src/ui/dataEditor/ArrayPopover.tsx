import type React from "react";
import {useRef, useState} from "react";
import * as Popover from "@radix-ui/react-popover";

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import type {EditValue} from "@/features/dataExplorer/state/editsStore";
import {ArrayEditor} from "@/ui/dataEditor/ArrayEditor";

interface ArrayPopoverProps {
  element: NamedTupleMember;
  schema: SchemaResponse;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
  onDiscard: () => void;
  // Only set for an optional pointer — renders a "Set to {}" action inside
  // the popover itself, rather than a separate button next to the collapsed
  // cell (which the expanded, portalled popover floats away from, leaving it
  // visually orphaned behind/beside the panel instead of attached to it).
  optional?: boolean;
}

// Floating popover wrapper around ArrayEditor, anchored to the grid cell
// being edited — same commit/discard contract as TuplePopover: click-outside
// or Ctrl/Cmd+Enter commits the whole array atomically, Escape discards.
export const ArrayPopover: React.FC<ArrayPopoverProps> = ({element, schema, initialValue, onCommit, onDiscard, optional}) => {
  const [draft, setDraft] = useState<unknown[]>(() => (Array.isArray(initialValue) ? initialValue : []));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const resolvedRef = useRef(false);

  const commit = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onCommit({valid: true, value: draftRef.current});
  };
  const discard = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onDiscard();
  };
  const unset = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onCommit({valid: true, value: null});
  };

  return (
    <Popover.Root open modal={false}>
      <Popover.Anchor asChild>
        <div className="h-full w-full" />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onEscapeKeyDown={discard}
          onPointerDownOutside={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.stopPropagation();
              commit();
            }
          }}
          className="z-50 min-w-64 rounded-md border border-border bg-surface p-1 shadow-[var(--shadow-card)]"
        >
          {optional && (
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                title="Set to {}"
                onClick={unset}
                className="rounded-md bg-orange-500 px-2 py-1 font-mono text-2xs font-medium text-white hover:opacity-90 dark:bg-orange-600"
              >
                {"{}"}
              </button>
            </div>
          )}
          <ArrayEditor element={element} schema={schema} value={draft} onChange={setDraft} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
