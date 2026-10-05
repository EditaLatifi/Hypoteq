"use client";

/**
 * Funnel v3 client state: the answer model (types.ts) plus navigation and the submission's
 * identity. Kept in sessionStorage so a reload keeps the funnel; a new tab starts empty.
 *
 * Answers that no longer apply are reset where they are changed (setAns, updateBorrower),
 * so the document rules, the calculation and the submit adapter never see a stale answer —
 * e.g. an Erhöhung amount left over after switching to «Neue Hypothek».
 *
 * Persistence is not hydrated automatically: the server render has no sessionStorage, and
 * hydrating during the first client render would mismatch it. Call useFunnelV3Hydration()
 * once at the top of the funnel (or useFunnelV3.persist.rehydrate() in an effect).
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  DEFAULT_ANSWERS,
  EMPTY_AMOUNTS,
  EMPTY_TEXTS,
  MAX_BORROWERS,
  type Amounts,
  type Answers,
  type Borrower,
  type FunnelState,
  type Role,
  type Texts,
} from "./types";
import type { FileEntry } from "./files";

/** 0 = Start, 1 Allgemeines, 2 Objekt, 3 Personen, 4 Finanzierung, 5 Unterlagen, 6 Abschluss. */
export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const LAST_STEP: Step = 6;

export interface FunnelV3Data extends FunnelState {
  /** Minted per submission; every upload is filed under it and the Inquiry is created with it. */
  submissionId: string;
  /** The SharePoint folder this submission's uploads went into, once the first upload made it. */
  sharepointFolderId: string | null;
  step: Step;
  /** The furthest step reached; the question path may jump forward only up to here (D6). */
  visited: Step;
  /**
   * Uploaded files (lib/funnel-v3/files.ts). The browser `File` stays in memory only — it is
   * left out of the sessionStorage copy (see partialize below).
   */
  files: FileEntry[];
  /** Instance ids marked «Habe ich nicht» (spec 4.2; honoured for optional requirements). */
  skipped: string[];
  /** File ids whose answer-correction suggestion was turned down («Dokument nicht verwenden»). */
  dismissed: string[];
}

export interface FunnelV3Actions {
  setRole: (role: Role) => void;
  setAns: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  setTxt: <K extends keyof Texts>(key: K, value: string) => void;
  setFin: <K extends keyof Amounts>(key: K, value: number) => void;
  addBorrower: () => void;
  removeBorrower: (id: string) => void;
  updateBorrower: (id: string, patch: Partial<Omit<Borrower, "id">>) => void;
  /** Back always, forward only to a visited step (DECISIONS D6). Returns whether it moved. */
  goto: (step: Step) => boolean;
  /** One step forward; validation is the caller's (validateStep). */
  next: () => void;
  back: () => void;
  setSharepointFolderId: (id: string | null) => void;
  setFiles: (files: FileEntry[] | ((prev: FileEntry[]) => FileEntry[])) => void;
  /** Append files (ids already in the list are ignored). */
  addFiles: (files: FileEntry[]) => void;
  /** Patch one file; a function receives the current entry. No-op for an unknown id. */
  updateFile: (id: string, patch: Partial<FileEntry> | ((f: FileEntry) => Partial<FileEntry>)) => void;
  /** Drop a file from the list (the SharePoint copy is lib/funnel-v3/upload.ts's job). */
  removeFile: (id: string) => void;
  /** «Habe ich nicht» on (true) or off («Doch hochladen»). */
  setSkipped: (instanceId: string, skipped: boolean) => void;
  /** «Dokument nicht verwenden» on an answer-correction suggestion. */
  dismissSuggestion: (fileIds: string[]) => void;
  /** «Neuen Antrag stellen»: empty funnel, new submission id. */
  reset: () => void;
}

export type FunnelV3Store = FunnelV3Data & FunnelV3Actions;

/** RFC 4122 v4. crypto.randomUUID is missing on plain-http origins other than localhost. */
export function newId(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyBorrower(vor = "", nach = ""): Borrower {
  return { id: newId(), vor, nach, pkSe: "Nein" };
}

export function initialFunnelV3(): FunnelV3Data {
  return {
    role: null,
    ans: { ...DEFAULT_ANSWERS },
    borrowers: [emptyBorrower()],
    txt: { ...EMPTY_TEXTS },
    fin: { ...EMPTY_AMOUNTS },
    submissionId: newId(),
    sharepointFolderId: null,
    step: 0,
    visited: 0,
    files: [],
    skipped: [],
    dismissed: [],
  };
}

/**
 * The answer plus everything it makes obsolete. Pure, so the rules can be read in one place.
 */
export function applyAnswer<K extends keyof Answers>(
  s: Pick<FunnelState, "ans" | "txt" | "fin" | "borrowers">,
  key: K,
  value: Answers[K]
): Pick<FunnelState, "ans" | "txt" | "fin" | "borrowers"> {
  const ans: Answers = { ...s.ans, [key]: value };
  const txt: Texts = { ...s.txt };
  const fin: Amounts = { ...s.fin };
  let borrowers = s.borrowers;

  switch (key) {
    case "antrag":
      if (value === "Neue Hypothek") {
        // Ablösung-only
        fin.old = 0;
        fin.up = 0;
        ans.aufstockung = "Nein";
        txt.zweck = "";
      } else if (value === "Ablösung") {
        // Neue-Hypothek-only
        fin.kaufpreis = 0;
        ans.reno = "Nein";
        ans.reserviert = "Nein";
      }
      break;
    case "kn":
      if (value === "Juristische Person") {
        // natural-person-only: income, per-case personal questions, further borrowers
        fin.inc = 0;
        ans.ab50 = "Nein";
        ans.kinder = "Nein";
        ans.unterhalt = "Nein";
        const first = borrowers[0] ?? emptyBorrower(txt.vor, txt.nach);
        borrowers = [{ id: first.id, vor: first.vor, nach: first.nach, pkSe: "Nein" }];
      } else {
        txt.firma = "";
        txt.zeichner = "";
      }
      break;
    case "kinder":
      if (value !== "Ja") ans.unterhalt = "Nein";
      break;
    case "buerge":
      if (value !== "Ja") txt.buergeName = "";
      break;
    case "immo":
      if (value !== "Neubau") ans.nbDocs = "Nein";
      break;
    case "aufstockung":
      if (value !== "Ja") {
        fin.up = 0;
        txt.zweck = "";
      }
      break;
  }
  return { ans, txt, fin, borrowers };
}

const memory: Record<string, string> = {};
const memoryStorage: StateStorage = {
  getItem: (k) => (k in memory ? memory[k] : null),
  setItem: (k, v) => {
    memory[k] = v;
  },
  removeItem: (k) => {
    delete memory[k];
  },
};

function sessionStore(): StateStorage {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) return window.sessionStorage;
  } catch {
    // blocked storage (privacy mode, sandboxed iframe): keep the funnel in memory
  }
  return memoryStorage;
}

const isBlob = (v: unknown) => typeof Blob !== "undefined" && v instanceof Blob;

/** File entries without File / Blob values, which cannot be serialised. */
function serialisableFiles(files: FileEntry[]): FileEntry[] {
  return (files || [])
    .filter((f) => !isBlob(f))
    .map((f) =>
      f && typeof f === "object"
        ? (Object.fromEntries(Object.entries(f).filter(([, v]) => !isBlob(v))) as unknown as FileEntry)
        : f
    );
}

export const FUNNEL_V3_STORAGE_KEY = "hypoteq-funnel-v3";

export const useFunnelV3 = create<FunnelV3Store>()(
  persist(
    (set, get) => ({
      ...initialFunnelV3(),

      setRole: (role) =>
        set((s) => ({
          role,
          txt:
            role === "kunde"
              ? { ...s.txt, bmail: "", pvor: "", pnach: "", ptel: "", pfirma: "" }
              : { ...s.txt, tel: "" },
        })),

      setAns: (key, value) => set((s) => applyAnswer(s, key, value)),

      setTxt: (key, value) =>
        set((s) => {
          const txt = { ...s.txt, [key]: value };
          if ((key === "vor" || key === "nach") && s.borrowers.length > 0) {
            const borrowers = s.borrowers.map((b, i) => (i === 0 ? { ...b, [key]: value } : b));
            return { txt, borrowers };
          }
          return { txt };
        }),

      setFin: (key, value) =>
        set((s) => ({ fin: { ...s.fin, [key]: Number.isFinite(value) && value > 0 ? value : 0 } })),

      addBorrower: () =>
        set((s) =>
          s.ans.kn === "Juristische Person" || s.borrowers.length >= MAX_BORROWERS
            ? {}
            : { borrowers: [...s.borrowers, emptyBorrower()] }
        ),

      removeBorrower: (id) =>
        set((s) => {
          const i = s.borrowers.findIndex((b) => b.id === id);
          // The first borrower is the contact from step 1 and cannot be removed.
          if (i <= 0) return {};
          return { borrowers: s.borrowers.filter((b) => b.id !== id) };
        }),

      updateBorrower: (id, patch) =>
        set((s) => {
          const i = s.borrowers.findIndex((b) => b.id === id);
          if (i < 0) return {};
          const next: Borrower = { ...s.borrowers[i], ...patch, id };
          if (next.job !== "Selbständig") next.pkSe = "Nein";
          const borrowers = s.borrowers.map((b, j) => (j === i ? next : b));
          if (i === 0) return { borrowers, txt: { ...s.txt, vor: next.vor, nach: next.nach } };
          return { borrowers };
        }),

      goto: (step) => {
        const s = get();
        if (step < 0 || step > LAST_STEP || step > s.visited) return false;
        set({ step });
        return true;
      },

      next: () =>
        set((s) => {
          const step = Math.min(s.step + 1, LAST_STEP) as Step;
          return { step, visited: Math.max(s.visited, step) as Step };
        }),

      back: () => set((s) => ({ step: Math.max(s.step - 1, 0) as Step })),

      setSharepointFolderId: (id) => set({ sharepointFolderId: id }),

      setFiles: (files) => set((s) => ({ files: typeof files === "function" ? files(s.files) : files })),

      addFiles: (files) =>
        set((s) => {
          const have = new Set(s.files.map((f) => f.id));
          const fresh = files.filter((f) => !have.has(f.id));
          return fresh.length ? { files: [...s.files, ...fresh] } : {};
        }),

      updateFile: (id, patch) =>
        set((s) => {
          const i = s.files.findIndex((f) => f.id === id);
          if (i < 0) return {};
          const cur = s.files[i];
          const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch), id };
          return { files: s.files.map((f, j) => (j === i ? next : f)) };
        }),

      removeFile: (id) =>
        set((s) =>
          s.files.some((f) => f.id === id)
            ? { files: s.files.filter((f) => f.id !== id), dismissed: s.dismissed.filter((d) => d !== id) }
            : {}
        ),

      setSkipped: (instanceId, skipped) =>
        set((s) => {
          const has = s.skipped.includes(instanceId);
          if (skipped === has) return {};
          return { skipped: skipped ? [...s.skipped, instanceId] : s.skipped.filter((x) => x !== instanceId) };
        }),

      dismissSuggestion: (fileIds) =>
        set((s) => {
          const add = fileIds.filter((id) => !s.dismissed.includes(id));
          return add.length ? { dismissed: [...s.dismissed, ...add] } : {};
        }),

      reset: () => set(initialFunnelV3()),
    }),
    {
      name: FUNNEL_V3_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(sessionStore),
      skipHydration: true,
      partialize: (s): FunnelV3Data => ({
        role: s.role,
        ans: s.ans,
        borrowers: s.borrowers,
        txt: s.txt,
        fin: s.fin,
        submissionId: s.submissionId,
        sharepointFolderId: s.sharepointFolderId,
        step: s.step,
        visited: s.visited,
        files: serialisableFiles(s.files),
        skipped: s.skipped,
        dismissed: s.dismissed,
      }),
      // A copy saved before `skipped` / `dismissed` existed has neither: start them empty.
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<FunnelV3Data>;
        return {
          ...current,
          ...p,
          files: Array.isArray(p.files) ? p.files : current.files,
          skipped: Array.isArray(p.skipped) ? p.skipped : [],
          dismissed: Array.isArray(p.dismissed) ? p.dismissed : [],
        };
      },
    }
  )
);

/** Restores the funnel from sessionStorage after mount; true once that has happened. */
export function useFunnelV3Hydration(): boolean {
  const [hydrated, setHydrated] = useState(() => useFunnelV3.persist.hasHydrated());
  useEffect(() => {
    const unsub = useFunnelV3.persist.onFinishHydration(() => setHydrated(true));
    if (!useFunnelV3.persist.hasHydrated()) void useFunnelV3.persist.rehydrate();
    else setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}
