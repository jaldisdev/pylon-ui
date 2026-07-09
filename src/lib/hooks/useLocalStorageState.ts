import {useEffect, useState} from "react";

// React state backed by localStorage — initialized from whatever's already
// stored, written back on every change. Used for state that should survive a
// page reload (e.g. Query Editor history), matching Gel's UI.
export const useLocalStorageState = <T,>(key: string, initial: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
};
