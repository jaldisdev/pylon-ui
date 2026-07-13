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
