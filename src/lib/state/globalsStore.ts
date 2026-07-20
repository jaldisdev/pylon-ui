import {create} from "zustand";
import {persist} from "zustand/middleware";

export interface GlobalEntry {
  // The value always stays here regardless of `enabled` — disabling a global
  // never discards it, it just stops being sent.
  value: unknown;
  enabled: boolean;
}

interface GlobalsState {
  // Keyed by "module::name". Persisted to localStorage so configured globals
  // survive a reload, matching the query history's persistence in the Query
  // Editor.
  entries: Record<string, GlobalEntry>;
  setEntry: (key: string, entry: GlobalEntry) => void;
  removeEntry: (key: string) => void;
}

// Pre-migration shape (no `enabled` flag, no per-entry wrapper) — every
// stored global was implicitly always-on.
interface LegacyGlobalsState {
  values: Record<string, unknown>;
}

export const useGlobalsStore = create<GlobalsState>()(
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
    {
      name: "pylon-ui:globals",
      version: 1,
      // Upgrades the old `{values}` shape into `{entries}` — every
      // pre-existing global defaults `enabled: true` so a reload doesn't
      // silently stop sending a global that was already configured.
      migrate: (persisted, version) => {
        if (version === 0) {
          const legacy = persisted as LegacyGlobalsState;
          const entries: Record<string, GlobalEntry> = {};
          for (const [key, value] of Object.entries(legacy.values ?? {})) {
            entries[key] = {value, enabled: true};
          }
          return {entries} as GlobalsState;
        }
        return persisted as GlobalsState;
      },
    }
  )
);
