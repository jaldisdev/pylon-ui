import {useQuery} from "@tanstack/react-query";
import {useParams} from "react-router-dom";

import {api} from "@/lib/api/client";

// Unlike useSchema, these numbers change as data is written, so this doesn't
// pin staleTime to Infinity — default TanStack behavior refetches on mount,
// which is exactly when the Dashboard tab becomes visible again. `branch` is
// folded into the key so switching connections (ConnectionMenu.tsx) is
// treated as a genuinely different query instead of serving another
// connection's cached numbers — switching :branch alone re-renders the
// Dashboard route without remounting it.
export const useStats = () => {
  const {branch} = useParams();
  return useQuery({
    queryKey: ["stats", branch],
    queryFn: api.getStats,
  });
};
