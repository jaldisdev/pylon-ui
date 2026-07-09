import type React from "react";
import {Link} from "react-router-dom";

interface NotFoundProps {
  label: string;
}

// Shown in place of a tab's content when the URL's :branch segment doesn't
// match "main" or any configured [database.<name>] connection.
export const NotFound: React.FC<NotFoundProps> = ({label}) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-fg-muted">
    <span className="font-medium text-fg">404 — Not Found</span>
    <span>{label}</span>
    <Link to="/main/repl" className="text-accent hover:underline">
      Go to main
    </Link>
  </div>
);
