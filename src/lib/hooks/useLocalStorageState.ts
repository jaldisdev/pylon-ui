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

import {useEffect, useState} from "react";

const useStorageState = <T,>(storage: Storage, key: string, initial: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = storage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    storage.setItem(key, JSON.stringify(value));
  }, [storage, key, value]);

  return [value, setValue] as const;
};

// React state backed by localStorage — initialized from whatever's already
// stored, written back on every change. Survives closing the tab/browser.
// Used for state that should persist indefinitely (e.g. Query Editor
// history).
export const useLocalStorageState = <T,>(key: string, initial: T) => useStorageState(localStorage, key, initial);

// Same, but backed by sessionStorage — survives navigating away and back
// within the same tab (e.g. switching to Data Explorer to look up an id,
// then back to the Query Editor) but not closing the tab or opening a new
// one. Used for the Query Editor's in-progress draft (current input text +
// param values, not the permanent history).
export const useSessionStorageState = <T,>(key: string, initial: T) => useStorageState(sessionStorage, key, initial);
