import type React from "react";

import {Modal} from "@/ui/Modal";

const isMac = /mac/i.test(navigator.userAgent) && !/iphone|ipad|ipod/i.test(navigator.userAgent);

// Symbols for the two modifiers every shortcut in this app uses; any other
// key (a letter, ",", "/") is shown as typed in KEY_LABEL below.
const MOD_LABEL = isMac ? "⌘" : "Ctrl";
const SHIFT_LABEL = isMac ? "⇧" : "Shift";
const KEY_LABEL: Record<string, string> = {mod: MOD_LABEL, shift: SHIFT_LABEL};

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

// Hand-maintained, not derived from the actual useHotkeys() call sites —
// keep in sync with them: TopBar.tsx (preferences, appearance, this modal
// itself), DataExplorerView.tsx (type switch, insert, filter, refresh),
// DataExplorerTab.tsx + ReviewEditsModal.tsx (review/commit).
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      {keys: ["mod", "shift", "/"], description: "Show keyboard shortcuts"},
      {keys: ["mod", "shift", ","], description: "Open preferences"},
      {keys: ["mod", "shift", "L"], description: "Cycle appearance (light/dark/system)"},
    ],
  },
  {
    title: "Data Explorer",
    shortcuts: [
      {keys: ["mod", "P"], description: "Switch object type"},
      {keys: ["mod", "I"], description: "Insert new object"},
      {keys: ["mod", "S"], description: "Open Review Changes — press again to commit"},
      {keys: ["mod", "shift", "F"], description: "Toggle the filter panel"},
      {keys: ["mod", "shift", "U"], description: "Refresh the current view"},
    ],
  },
];

interface ShortcutsModalProps {
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({onClose}) => {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <div className="text-2xs font-medium tracking-wide text-fg-muted uppercase">{group.title}</div>
            {group.shortcuts.map((shortcut) => (
              <div key={shortcut.description} className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-sm text-fg">{shortcut.description}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <kbd
                      key={i}
                      className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-hover px-1 font-mono text-2xs text-fg"
                    >
                      {KEY_LABEL[key] ?? key}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
};
