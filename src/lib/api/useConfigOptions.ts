//
// This source file is part of the Pylon open source project.
//
// Copyright (c) 2026 Jaldis B.V.
//
// Licensed under the MIT OR Apache-2.0 license (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://opensource.org/licenses/MIT
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

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
