import type React from "react";

import type {QueryErrorInfo} from "@/lib/api/client";

interface QueryErrorViewProps {
  error: QueryErrorInfo;
  className?: string;
}

// Structured PylonError display — shared by the Query Editor's ResultPanel
// and the REPL's ReplEntry, since both surface the exact same error shape
// (see pylon/server/asgi.py's _pylon_error_payload): the real exception
// class name as a badge, the compiler's own line/col source position when
// it has one, the plain message, and an optional hint/details footer.
export const QueryErrorView: React.FC<QueryErrorViewProps> = ({error, className}) => (
  <div className={className}>
    {(error.errorType || error.position) && (
      <div className="mb-1.5 flex flex-wrap items-center gap-2 font-mono text-2xs">
        {error.errorType && (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-semibold tracking-wide text-red-500">
            {error.errorType}
          </span>
        )}
        {error.position && (
          <span className="text-fg-muted">
            line {error.position.line}, col {error.position.col}
          </span>
        )}
      </div>
    )}
    <pre className="font-mono text-sm whitespace-pre-wrap text-red-500">{error.message}</pre>
    {error.hint && (
      <div className="mt-2 font-mono text-sm text-fg-muted">
        <span className="font-semibold text-fg">Hint: </span>
        {error.hint}
      </div>
    )}
    {error.details && <div className="mt-1 font-mono text-sm whitespace-pre-wrap text-fg-muted">{error.details}</div>}
  </div>
);
