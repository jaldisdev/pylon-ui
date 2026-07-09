import {useQuery} from "@tanstack/react-query";

import {api} from "@/lib/api/client";

// Fetched once and cached by TanStack Query's query-key cache — every caller
// shares the same request/result, so this can be called from anywhere
// (JsonTree, future Data Explorer, ...) without duplicating the fetch.
// Mirrors Gel's UI loading schema once on connect.
export const useSchema = () =>
  useQuery({
    queryKey: ["schema"],
    queryFn: api.getSchema,
    staleTime: Infinity,
  });
