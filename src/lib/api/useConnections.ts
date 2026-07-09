import {useQuery} from "@tanstack/react-query";

import {api} from "@/lib/api/client";

// Project name + the list of configured connections ("main" for the base
// [database] block, plus any [database.<name>] sub-tables) — powers the top
// bar's connection dropdown and the :branch URL validation in Layout.tsx.
export const useConnections = () =>
  useQuery({
    queryKey: ["connections"],
    queryFn: api.getConnections,
    staleTime: Infinity,
  });
