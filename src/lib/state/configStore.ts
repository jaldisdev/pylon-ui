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

import {create} from "zustand";
import {persist} from "zustand/middleware";

// Mirrors globalsStore.ts's shape exactly — session config options
// (Client.with_config(), e.g. allow_user_specified_id) get the same
// always-stored/independently-toggled treatment as globals, just scoped to
// a separate "Config" tab in the same modal (see GlobalsModal.tsx).
export interface ConfigEntry {
  value: unknown;
  enabled: boolean;
}

interface ConfigState {
  // Keyed by option name (e.g. "allow_user_specified_id"). Persisted to
  // localStorage, same as globals.
  entries: Record<string, ConfigEntry>;
  setEntry: (key: string, entry: ConfigEntry) => void;
  removeEntry: (key: string) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      entries: {},
      setEntry: (key, entry) => set((s) => ({entries: {...s.entries, [key]: entry}})),
      removeEntry: (key) =>
        set((s) => {
          const {[key]: _removed, ...rest} = s.entries;
          return {entries: rest};
        }),
    }),
    {name: "pylon-ui:config-options"}
  )
);
