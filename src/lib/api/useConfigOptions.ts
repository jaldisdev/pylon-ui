import {useQuery} from "@tanstack/react-query";

import {api} from "@/lib/api/client";

// Fixed registry of session config options (Client.with_config(), e.g.
// allow_user_specified_id) — powers the "Config" scope in the globals/config
// modal. Unlike globals this never changes at runtime (no schema-dir scan),
// but staleTime: Infinity keeps it consistent with useGlobalsSchema/useSchema.
export const useConfigOptions = () =>
  useQuery({
    queryKey: ["config-options"],
    queryFn: api.getConfigOptions,
    staleTime: Infinity,
  });
