import {create} from "zustand";

interface ConnectionState {
  // Name of the currently selected database/branch, shown in the top bar breadcrumb.
  branch: string;
  setBranch: (branch: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  branch: "main",
  setBranch: (branch) => set({branch}),
}));
