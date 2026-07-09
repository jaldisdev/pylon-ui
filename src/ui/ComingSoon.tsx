import type React from "react";

interface ComingSoonProps {
  label: string;
}

// Placeholder for tabs not yet implemented (Query Editor, Data Explorer, AI).
export const ComingSoon: React.FC<ComingSoonProps> = ({label}) => (
  <div className="flex h-full items-center justify-center text-sm text-fg-muted">
    {label} — coming soon
  </div>
);
