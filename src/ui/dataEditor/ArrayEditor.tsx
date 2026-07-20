import type React from "react";
import {Plus, Trash2} from "lucide-react";

import type {NamedTupleMember, SchemaResponse} from "@/lib/api/client";
import {defaultMemberValue, MemberEditor} from "@/ui/dataEditor/TupleEditor";

// Editor for a one-dimensional array<T> value — one row per element (each
// using the same per-kind widget a tuple member gets, via MemberEditor) plus
// a trailing remove button, and a dashed "add" row to append a new element.
// A bordered panel with a small "array" corner label, rows butted up
// against their own remove button.
interface ArrayEditorProps {
  element: NamedTupleMember;
  schema: SchemaResponse;
  value: unknown[];
  onChange: (value: unknown[]) => void;
}

export const ArrayEditor: React.FC<ArrayEditorProps> = ({element, schema, value, onChange}) => {
  const setItem = (index: number, next: unknown) => {
    const arr = [...value];
    arr[index] = next;
    onChange(arr);
  };

  const removeItem = (index: number) => {
    const arr = [...value];
    arr.splice(index, 1);
    onChange(arr);
  };

  const addItem = () => {
    onChange([...value, defaultMemberValue(element, schema)]);
  };

  return (
    <div className="relative rounded-md border border-border bg-surface p-2 pt-5">
      <span className="absolute top-0 right-0 rounded-bl-md rounded-tr-[5px] bg-surface-active px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
        array
      </span>
      <div className="flex flex-col gap-1.5">
        {value.map((item, index) => (
          <div
            key={index}
            className="flex items-stretch overflow-hidden rounded-md border border-border transition-colors duration-300 focus-within:border-accent [&_input]:rounded-none [&_input]:border-none [&_textarea]:rounded-none [&_textarea]:border-none"
          >
            <div className="min-w-0 flex-1">
              <MemberEditor member={element} schema={schema} value={item} onChange={(next) => setItem(index, next)} depth={0} />
            </div>
            <button
              type="button"
              title="Remove"
              onClick={() => removeItem(index)}
              className="flex shrink-0 items-center justify-center rounded-r-md border-l border-border bg-surface-hover px-2 text-fg-muted hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="flex items-center justify-center gap-1 rounded-md border border-gray-300 bg-gray-200 py-1 text-fg-muted transition-colors duration-300 hover:border-accent hover:text-accent dark:border-border dark:bg-surface-active"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};
