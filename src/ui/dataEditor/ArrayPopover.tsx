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
}

// Floating popover wrapper around ArrayEditor, anchored to the grid cell
// being edited — same commit/discard contract as TuplePopover: click-outside
// or Ctrl/Cmd+Enter commits the whole array atomically, Escape discards.
export const ArrayPopover: React.FC<ArrayPopoverProps> = ({element, schema, initialValue, onCommit, onDiscard}) => {
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
          <ArrayEditor element={element} schema={schema} value={draft} onChange={setDraft} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
