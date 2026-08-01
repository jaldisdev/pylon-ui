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
