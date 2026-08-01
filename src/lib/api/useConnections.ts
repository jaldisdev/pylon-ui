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

// Project name + the list of configured connections ("main" for the base
// [database] block, plus any [database.<name>] sub-tables) — powers the top
// bar's connection dropdown and the :branch URL validation in Layout.tsx.
export const useConnections = () =>
  useQuery({
    queryKey: ["connections"],
    queryFn: api.getConnections,
    staleTime: Infinity,
  });
