import {create} from "zustand";
import {persist} from "zustand/middleware";

interface GlobalsState {
  // Keyed by "module::name" -> the already-coerced value ready to send as-is
  // in /api/query's `globals` body field. Persisted to localStorage so
  // configured globals survive a reload, matching the query history's
  // persistence in the Query Editor.
  values: Record<string, unknown>;
  setValues: (values: Record<string, unknown>) => void;
}

export const useGlobalsStore = create<GlobalsState>()(
  persist(
    (set) => ({
      values: {},
      setValues: (values) => set({values}),
    }),
    {name: "pylon-ui:globals"}
  )
);
