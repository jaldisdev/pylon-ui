import type React from "react";
import {useRef, useState} from "react";
import * as Popover from "@radix-ui/react-popover";

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import type {EditValue} from "@/features/dataExplorer/state/editsStore";
import {defaultTupleValue, TupleEditor} from "@/ui/dataEditor/TupleEditor";

interface TuplePopoverProps {
  members: NamedTupleMember[];
  schema: SchemaResponse;
  initialValue: unknown;
  onCommit: (value: EditValue) => void;
  onDiscard: () => void;
}

// Floating popover wrapper around TupleEditor, anchored to the grid cell
// being edited. gel-ui's own "popover" is just CSS overflow on an absolutely
// positioned custom grid cell — that trick doesn't transfer to this app's
// real HTML <table>-based grid, so this uses an actual floating popover
// instead. Commit is atomic for the whole tuple, on close: click-outside or
// Ctrl/Cmd+Enter commits, Escape discards — matching gel-ui and this app's
// existing top-level cell editors.
export const TuplePopover: React.FC<TuplePopoverProps> = ({members, schema, initialValue, onCommit, onDiscard}) => {
  const [draft, setDraft] = useState<unknown>(() =>
    initialValue === null || initialValue === undefined ? defaultTupleValue(members, schema) : initialValue
  );
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
          <TupleEditor members={members} schema={schema} value={draft} onChange={setDraft} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
