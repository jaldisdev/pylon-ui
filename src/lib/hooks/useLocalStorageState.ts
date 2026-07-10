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
// history), matching Gel's UI.
export const useLocalStorageState = <T,>(key: string, initial: T) => useStorageState(localStorage, key, initial);

// Same, but backed by sessionStorage — survives navigating away and back
// within the same tab (e.g. switching to Data Explorer to look up an id,
// then back to the Query Editor) but not closing the tab or opening a new
// one. Used for the Query Editor's in-progress draft (current input text +
// param values, not the permanent history), matching Gel's UI.
export const useSessionStorageState = <T,>(key: string, initial: T) => useStorageState(sessionStorage, key, initial);
