import type React from "react";

// Pill bar for session globals/config (current_user_id, allow_bare_ddl, ...).
// Stub for Phase 1 — wired up to real session globals once Data Explorer
// fetches live schema/session state.
export const GlobalsBar: React.FC = () => (
  <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto px-3 text-xs text-fg-muted">
    <span className="italic">No session globals set</span>
  </div>
);
