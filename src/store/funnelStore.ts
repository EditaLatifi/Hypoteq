import { create } from "zustand";

interface FunnelState {
  customerType: "direct" | "partner" | null;
  client: any;
  project: any;
  property: any;
  borrowers: any[];
  financing: any;
  documents: any[];

  email: string | null;
  setEmail: (email: string) => void;

  setCustomerType: (type: "direct" | "partner") => void;
  setClient: (data: any) => void;
  setProject: (data: any | ((prev: any) => any)) => void;
  setProperty: (data: any) => void;
  setBorrowers: (data: any[]) => void;
  setFinancing: (data: any) => void;
  addDocument: (file: any) => void;
}

export const useFunnelStore = create<FunnelState>((set) => ({
  customerType: null,
  client: {},
  project: { projektArt: "" },
  property: {},
  borrowers: [],
  financing: {},
  documents: [],
  email: null,

  setEmail: (email) => set({ email }),
  setCustomerType: (type) => set({ customerType: type }),
  setClient: (data) => set({ client: data }),

  // FIX: support updater function për project
  setProject: (data) =>
    set((state) => ({
      project: typeof data === "function" ? data(state.project) : data,
    })),

  setProperty: (data) => set({ property: data }),
  setBorrowers: (data) => set({ borrowers: data }),
  setFinancing: (data) => set({ financing: data }),
  addDocument: (file) =>
    set((state) => ({ documents: [...state.documents, file] })),
}));
