import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

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

  /**
   * One id per submission, minted when the funnel starts and kept until it is sent.
   *
   * Files upload the moment they are picked and are filed under this id (SharePoint folder
   * and database row), and the Inquiry is later created with it so it can claim them. It
   * lives here rather than in the documents step because that step remounts whenever the
   * case changes, and a fresh id per mount stranded every file uploaded before it.
   */
  submissionId: string;
  /** The SharePoint folder this submission's files go into, once the first upload made it. */
  sharepointFolderId: string | null;
  setSharepointFolderId: (id: string | null) => void;
  /** Start a new submission after one has been sent, so the next one cannot collide with it. */
  renewSubmission: () => void;
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
  submissionId: uuidv4(),
  sharepointFolderId: null,

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
  setSharepointFolderId: (id) => set({ sharepointFolderId: id }),
  renewSubmission: () => set({ submissionId: uuidv4(), sharepointFolderId: null, documents: [] }),
}));
