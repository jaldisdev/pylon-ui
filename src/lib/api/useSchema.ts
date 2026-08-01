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

// Fetched once and cached by TanStack Query's query-key cache — every caller
// shares the same request/result, so this can be called from anywhere
// (JsonTree, future Data Explorer, ...) without duplicating the fetch.
// Loaded once on connect, not refetched per tab.
export const useSchema = () =>
  useQuery({
    queryKey: ["schema"],
    queryFn: api.getSchema,
    staleTime: Infinity,
  });
