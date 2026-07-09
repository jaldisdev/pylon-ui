import {useQuery} from "@tanstack/react-query";

import {api} from "@/lib/api/client";

// Chat-purpose models configured in pylon.toml ([models.<name>] with
// purpose = "chat") — powers the AI tab's Model select.
export const useModels = () =>
  useQuery({
    queryKey: ["models"],
    queryFn: api.getModels,
    staleTime: Infinity,
  });
