import type React from "react";
import {useRef} from "react";
import {useHotkeys} from "react-hotkeys-hook";
import {Check, X} from "lucide-react";

import {CodeEditor, type CodeEditorHandle} from "@/lib/editor/CodeEditor";

interface FilterPanelProps {
  defaultValue: string;
  onApply: (expression: string) => void;
  onClear: () => void;
  hasActiveFilter: boolean;
  error: string | null;
  dark: boolean;
}

// PyQL filter-expression panel (the part that would go after `filter` in the
// generated query), reusing the same CodeEditor as the REPL/Query Editor.
// Mod+Enter applies, same hotkey fix as those two (see [[project_codemirror_hotkeys]]).
export const FilterPanel: React.FC<FilterPanelProps> = ({defaultValue, onApply, onClear, hasActiveFilter, error, dark}) => {
  const editorRef = useRef<CodeEditorHandle>(null);

  const applyFilter = () => onApply(editorRef.current?.getValue().trim() ?? "");

  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyFilter();
    },
    {enableOnContentEditable: true, enableOnFormTags: true, eventListenerOptions: {capture: true}}
  );

  // Output
  return (
    <div className="flex h-32 shrink-0 flex-col border-b border-border">
      <CodeEditor ref={editorRef} defaultValue={defaultValue} dark={dark} placeholder=".field = value" className="flex-1" />
      <div className="flex items-center justify-end gap-2 border-t border-border px-2 py-1.5">
        {error && <span className="mr-auto font-mono text-xs text-red-500">{error}</span>}
        <button
          type="button"
          disabled={!hasActiveFilter}
          onClick={onClear}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40"
        >
          <X size={12} strokeWidth={1.75} />
          Clear
        </button>
        <button
          type="button"
          onClick={applyFilter}
          className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs text-accent-fg"
        >
          <Check size={12} strokeWidth={1.75} />
          Apply filter
        </button>
      </div>
    </div>
  );
};
