import type React from "react";

import {LOGO_LINES, modKey} from "@/features/repl/banner";

// Welcome banner shown once above the scrollback — the Pylon ASCII logo
// (reused from the CLI's own banner) plus the same welcome/shortcuts copy
// Gel's REPL shows, adapted to our own commands (\help/\clear) and hotkeys.
export const ReplHeader: React.FC<{onRunHelp: () => void; onClear: () => void}> = ({onRunHelp, onClear}) => (
  <div className="p-3 text-sm">
    <pre className="font-mono text-[11px] leading-tight whitespace-pre text-accent">{LOGO_LINES}</pre>
    <div className="mt-3 text-fg">
      Welcome to Pylon repl, type{" "}
      <button type="button" onClick={onRunHelp} className="underline hover:text-accent">
        \help
      </button>{" "}
      for commands list
    </div>
    <div className="mt-1 text-fg-muted">
      Shortcuts: <span className="italic">{modKey()}+Enter</span> to run query,{" "}
      <span className="italic">{modKey()}+ArrowUp/Down</span> to navigate history,{" "}
      <button type="button" onClick={onClear} className="underline hover:text-accent">
        \clear
      </button>{" "}
      to clear the history
    </div>
  </div>
);
