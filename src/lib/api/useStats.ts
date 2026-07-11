import {useQuery} from "@tanstack/react-query";

import {api} from "@/lib/api/client";

// Unlike useSchema, these numbers change as data is written, so this doesn't
// pin staleTime to Infinity — default TanStack behavior refetches on mount,
// which is exactly when the Dashboard tab becomes visible again.
export const useStats = () =>
  useQuery({
    queryKey: ["stats"],
    queryFn: api.getStats,
  });
