import {useQuery} from "@tanstack/react-query";

import {api} from "@/lib/api/client";

// Settable session globals declared in the schema (Global[T], not the
// computed Global[T, "select ..."] kind) — powers the globals modal's form
// and the pill bar's field labels/types.
export const useGlobalsSchema = () =>
  useQuery({
    queryKey: ["globals-schema"],
    queryFn: api.getGlobals,
    staleTime: Infinity,
  });
