"use client";

/**
 * Funnel client state: the answer model (types.ts) plus navigation and the submission's
 * identity. Kept in sessionStorage so a reload keeps the funnel; a new tab starts empty.
 *
 * Answers that no longer apply are reset where they are changed (applyAnswer, updateBorrower),
 * so the document rules, the calculation and the submit adapter never see a stale answer —
 * e.g. an Erhöhung amount left over after switching to «Neue Hypothek».
 *
 * v5 (Handover 1–3): one model for both entries. `mode` picks the order of the screens
 * (steps.ts); switching keeps every answer and lands on the same topic. Every user edit marks
 * its field `touched` and drops its `src` mark, so a document read later never overwrites it.
 *
 * Persistence is not hydrated automatically: the server render has no sessionStorage, and
 * hydrating during the first client render would mismatch it. Call useFunnelV3Hydration()
 * once at the top of the funnel (or useFunnelV3.persist.rehydrate() in an effect).
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  CHIPS,
  DEFAULT_ANSWERS,
  EMPTY_AMOUNTS,
  EMPTY_EM,
  EMPTY_TEXTS,
  EM_ROWS,
  MAX_BORROWERS,
  NUTZUNG_OPTIONS,
  type Amounts,
  type Answers,
  type Borrower,
  type Chip,
  type DocInfo,
  type Eigenmittel,
  type FieldPath,
  type FunnelState,
  type Mode,
  type Role,
  type Sources,
  type Texts,
} from "./types";
import type { FileEntry } from "./files";
import { mapVisited, stepCount, switchTarget } from "./steps";
import type { PrefillResult } from "./prefill";
import type { CorrectionPatch } from "./requirementStatus";

/** 0 = Start; then the screens of the mode (steps.ts): Begleitet 1–4, Schnell 1–6. */
export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The last step of the longer entry (Schnellanmeldung). Per mode: stepCount(mode). */
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
  /** Opened from the Partnerportal (`?from=portal`): the closing offers the way back. */
  entry: "portal" | null;
}

export interface FunnelV3Actions {
  setRole: (role: Role) => void;
  /** Pick the entry on the start screen (Handover 1); keeps the step. */
  setMode: (mode: Mode) => void;
  /**
   * «Lieber Schritt für Schritt» / «Zur Schnellanmeldung» (Handover 1, 3): the other entry, on
   * the same topic, with every answer kept (steps.ts switchTarget).
   */
  switchMode: () => void;
  setEntry: (entry: "portal" | null) => void;
  setAns: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  /** Tap a chip of «Trifft etwas davon zu?» on (Ja) or off (Nein). */
  setChip: (chip: Chip, on: boolean) => void;
  setTxt: <K extends keyof Texts>(key: K, value: string) => void;
  setFin: <K extends keyof Amounts>(key: K, value: number) => void;
  /** One row of the Eigenmittel table. */
  setEm: <K extends keyof Eigenmittel>(key: K, value: number) => void;
  /** «+ Kreditnehmer hinzufügen» (Kreditnehmer 2; natürliche Person only, DECISIONS V8). */
  addBorrower: () => void;
  removeBorrower: (id: string) => void;
  updateBorrower: (id: string, patch: Partial<Omit<Borrower, "id">>) => void;
  /** «Bestätigen» on a value marked «aus Dokument · bitte prüfen»: the mark stays, unsure goes. */
  confirmSource: (path: FieldPath) => void;
  /**
   * «Ja, ergänzen» on a suggestion of the Begleitete Anmeldung (requirementStatus.ts
   * answerCorrections): the chips / answers and amounts it carries, as if clicked and typed.
   */
  applyCorrection: (patch: CorrectionPatch) => void;
  /**
   * The documents' result (prefill.ts prefillFromDocuments): `info` always; in the
   * Schnellanmeldung also the answers, never over a touched field. Idempotent.
   */
  applyDocuments: (result: PrefillResult) => void;
  /** Auskunftsermächtigung: uploaded with its own button, «Später nachreichen», or undone (null). */
  setSignature: (choice: "uploaded" | "later" | null) => void;
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
    mode: "begleitet",
    ans: { ...DEFAULT_ANSWERS },
    borrowers: [emptyBorrower()],
    txt: { ...EMPTY_TEXTS },
    fin: { ...EMPTY_AMOUNTS },
    em: { ...EMPTY_EM },
    info: {},
    src: {},
    touched: {},
    sig: null,
    submissionId: newId(),
    sharepointFolderId: null,
    step: 0,
    visited: 0,
    files: [],
    skipped: [],
    dismissed: [],
    entry: null,
  };
}

// ---- Answer side effects (pure) ------------------------------------------------------------

type AnswerParts = Pick<FunnelState, "ans" | "txt" | "fin" | "em" | "borrowers">;

export interface AppliedAnswer extends AnswerParts {
  /** Fields the answer emptied: they lose their `src` and `touched` marks. */
  cleared: FieldPath[];
  /** False when the value is not allowed in this state (see applyAnswer) — nothing changed. */
  accepted: boolean;
}

/** Whether an answer may be given in this state (Handover 2: disabled options). */
export function answerAllowed<K extends keyof Answers>(ans: Answers, key: K, value: Answers[K]): boolean {
  if (value === undefined) return true;
  // «Bei Ablösung ist «Bauprojekt» deaktiviert».
  if (key === "immo" && value === "Bauprojekt" && ans.antrag === "Ablösung") return false;
  // Nutzung: juristische Person only Vermietet · Gewerbe, natürliche without Gewerbe.
  if (key === "nutz" && !NUTZUNG_OPTIONS[ans.kn].includes(value as never)) return false;
  // «Unterhaltszahlungen» is a chip of the natürliche Person only.
  if (key === "unterhalt" && value === "Ja" && ans.kn === "Juristische Person") return false;
  return true;
}

/**
 * The answer plus everything it makes obsolete (Handover 2 and the prototype's setAns). Pure,
 * so the rules can be read in one place:
 *  - Antrag → Ablösung: the Kauf block goes (Kaufpreis, Kaufdatum, Renovation, reserviert),
 *    the Eigenmittel other than «Vorsorge» (Säule 3a, PK-Verpfändung), and «Bauprojekt».
 *    → Neue Hypothek: the Ablösung block goes (bestehende Hypothek, Erhöhung, Zweck).
 *  - Kreditnehmer changed: Nutzung is reset (its options differ). → juristische Person: no
 *    Anrede, no income, no Kreditnehmer 2, no «Unterhaltszahlungen»; → natürliche: no Firma.
 *  - Nutzung ≠ Vermietet: no Netto-Mietertrag. Renovation = Nein: no Renovationsbetrag.
 *    Erhöhung = Nein: no Erhöhung, no Zweck. Solidarbürgschaft off: no Bürge name.
 * An option the state does not allow (answerAllowed) is refused: `accepted: false`.
 */
export function applyAnswer<K extends keyof Answers>(s: AnswerParts, key: K, value: Answers[K]): AppliedAnswer {
  if (!answerAllowed(s.ans, key, value)) return { ...s, cleared: [], accepted: false };
  const prev = s.ans;
  const ans: Answers = { ...prev, [key]: value };
  const txt: Texts = { ...s.txt };
  const fin: Amounts = { ...s.fin };
  const em: Eigenmittel = { ...s.em };
  let borrowers = s.borrowers;
  const cleared: FieldPath[] = [];
  const clearFin = (k: keyof Amounts) => {
    if (fin[k]) cleared.push(`fin.${k}`);
    fin[k] = 0;
  };
  const clearTxt = (k: keyof Texts) => {
    if (txt[k]) cleared.push(`txt.${k}`);
    txt[k] = "";
  };
  const clearAns = <A extends keyof Answers>(k: A, v: Answers[A]) => {
    if (ans[k] !== v) cleared.push(`ans.${k}`);
    ans[k] = v;
  };

  switch (key) {
    case "antrag":
      if (value === "Neue Hypothek") {
        clearFin("old");
        clearFin("up");
        clearAns("aufstockung", "Nein");
        clearTxt("zweck");
      } else if (value === "Ablösung") {
        clearFin("kaufpreis");
        clearFin("renoBetrag");
        clearAns("reno", "Nein");
        clearAns("reserviert", "Nein");
        clearTxt("kaufdatum");
        if (ans.immo === "Bauprojekt") clearAns("immo", undefined);
        const keep = new Set(EM_ROWS["Ablösung"]);
        for (const k of Object.keys(em) as (keyof Eigenmittel)[]) {
          if (keep.has(k)) continue;
          if (em[k]) cleared.push(`em.${k}`);
          em[k] = 0;
        }
      }
      break;
    case "kn":
      if (value === prev.kn) break;
      clearAns("nutz", undefined);
      if (value === "Juristische Person") {
        clearAns("anrede", undefined);
        clearAns("unterhalt", "Nein");
        clearFin("inc");
        clearFin("inc2");
        clearFin("miete");
        const first = borrowers[0] ?? emptyBorrower(txt.vor, txt.nach);
        if (borrowers.length > 1) cleared.push("borrower.1.vor", "borrower.1.nach");
        if (first.job) cleared.push("borrower.0.job");
        borrowers = [{ id: first.id, vor: first.vor, nach: first.nach, pkSe: "Nein" }];
      } else {
        clearTxt("firma");
        clearTxt("zeichner");
        clearFin("miete");
      }
      break;
    case "nutz":
      if (value !== "Vermietet") clearFin("miete");
      break;
    case "immo":
      if (value !== "Neubau") clearAns("nbDocs", "Nein");
      break;
    case "aufstockung":
      if (value !== "Ja") {
        clearFin("up");
        clearTxt("zweck");
      }
      break;
    case "reno":
      if (value !== "Ja") clearFin("renoBetrag");
      break;
    case "buerge":
      if (value !== "Ja") clearTxt("buergeName");
      break;
  }
  return { ans, txt, fin, em, borrowers, cleared, accepted: true };
}

/** `touched` with `path` set; `src` without it (Handover 3: an edited field loses its mark). */
export function touch(s: Pick<FunnelState, "touched" | "src">, ...paths: FieldPath[]): Pick<FunnelState, "touched" | "src"> {
  if (!paths.length) return { touched: s.touched, src: s.src };
  const touched = { ...s.touched };
  const src: Sources = { ...s.src };
  for (const p of paths) {
    touched[p] = true;
    delete src[p];
  }
  return { touched, src };
}

/** Marks of fields an answer emptied: neither «aus Dokument» nor «touched» any more. */
function unmark(s: Pick<FunnelState, "touched" | "src">, paths: FieldPath[]): Pick<FunnelState, "touched" | "src"> {
  if (!paths.length) return { touched: s.touched, src: s.src };
  const touched = { ...s.touched };
  const src: Sources = { ...s.src };
  for (const p of paths) {
    delete touched[p];
    delete src[p];
  }
  return { touched, src };
}

const amount = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/** The order prefilled answers are applied in: Antrag and Kreditnehmer first (they reset others). */
const PREFILL_ANS_ORDER: (keyof Answers)[] = ["antrag", "kn", "anrede", "immo", "lieg", "nutz", ...CHIPS];

/**
 * The documents' result applied to the state (pure; the store's applyDocuments):
 *  - `info` is replaced (both modes);
 *  - in the Schnellanmeldung every value whose field is not touched and differs is set, with
 *    its `src` mark — through applyAnswer, so its side effects hold as for a click;
 *  - a mark whose document no longer says it (file removed) goes; the value stays.
 * The Begleitete Anmeldung never changes an answer here (Handover 3.1); its contradictions
 * are suggestions (requirementStatus.ts answerCorrections).
 */
export function applyPrefill(s: FunnelState, result: PrefillResult): Partial<FunnelState> {
  let parts: AnswerParts = { ans: s.ans, txt: s.txt, fin: s.fin, em: s.em, borrowers: s.borrowers };
  let marks = { touched: s.touched, src: { ...s.src } as Sources };
  // Stale marks.
  for (const p of Object.keys(marks.src) as FieldPath[]) if (!result.src[p]) delete marks.src[p];

  if (s.mode === "schnell") {
    const values = result.values;
    const want = (p: FieldPath) => p in values && !s.touched[p];
    const mark = (p: FieldPath) => {
      const m = result.src[p];
      if (m) marks.src[p] = m;
    };
    for (const k of PREFILL_ANS_ORDER) {
      const p = `ans.${k}` as FieldPath;
      if (!want(p)) continue;
      const v = values[p] as Answers[typeof k];
      if (parts.ans[k] !== v) {
        const r = applyAnswer(parts, k, v);
        if (!r.accepted) continue;
        parts = { ans: r.ans, txt: r.txt, fin: r.fin, em: r.em, borrowers: r.borrowers };
        marks = unmark(marks, r.cleared);
      }
      mark(p);
    }
    const txt = { ...parts.txt };
    const fin = { ...parts.fin };
    const em = { ...parts.em };
    let borrowers = parts.borrowers;
    for (const p of Object.keys(values) as FieldPath[]) {
      if (!want(p)) continue;
      const [group, key, sub] = p.split(".");
      const v = values[p];
      if (group === "txt" && typeof v === "string") {
        txt[key as keyof Texts] = v;
        if ((key === "vor" || key === "nach") && borrowers.length) {
          borrowers = borrowers.map((b, i) => (i === 0 ? { ...b, [key]: v } : b));
        }
      } else if (group === "fin" && typeof v === "number") fin[key as keyof Amounts] = amount(v);
      else if (group === "em" && typeof v === "number") em[key as keyof Eigenmittel] = amount(v);
      else if (group === "borrower" && key === "0" && sub === "job" && borrowers.length && parts.ans.kn === "Natürliche Person") {
        borrowers = borrowers.map((b, i) => (i === 0 ? { ...b, job: v as Borrower["job"], pkSe: v === "Selbständig" ? b.pkSe : "Nein" } : b));
      } else continue;
      mark(p);
    }
    parts = { ...parts, txt, fin, em, borrowers };
  }
  return { ...parts, info: result.info, src: marks.src, touched: marks.touched };
}

// ---- Storage ------------------------------------------------------------------------------

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

/**
 * The shape version of the sessionStorage copy. 2 = v5 (mode, Eigenmittel, src …): a v3 copy
 * (version 1) is not migrated — the funnel starts empty rather than hydrate a stale shape.
 */
export const FUNNEL_V3_STORAGE_VERSION = 2;

type SetState = (partial: Partial<FunnelV3Store> | ((s: FunnelV3Store) => Partial<FunnelV3Store>)) => void;

const asStep = (n: number) => Math.max(0, Math.min(n, LAST_STEP)) as Step;

/** State and actions of the funnel store, shared by the persisted store and createFunnelV3Store. */
function funnelV3Creator(set: SetState, get: () => FunnelV3Store): FunnelV3Store {
  return {
      ...initialFunnelV3(),

      setEntry: (entry) => set({ entry }),

      setRole: (role) =>
        set((s) => ({
          role,
          // The Berater block belongs to the Berater entry. The customer's phone is asked in
          // both roles since v5 (Handover 2 Schritt 1).
          txt: role === "kunde" ? { ...s.txt, bmail: "", pvor: "", pnach: "", ptel: "", pfirma: "" } : s.txt,
        })),

      setMode: (mode) =>
        set((s) => (s.mode === mode ? {} : { mode, step: asStep(Math.min(s.step, stepCount(mode))), visited: asStep(mapVisited(s.mode, s.visited, mode)) })),

      switchMode: () =>
        set((s) => {
          const t = switchTarget(s.mode, s.step, s.files.length > 0);
          const visited = Math.max(mapVisited(s.mode, s.visited, t.mode), t.step);
          return { mode: t.mode, step: asStep(t.step), visited: asStep(visited) };
        }),

      setAns: (key, value) =>
        set((s) => {
          const r = applyAnswer(s, key, value);
          if (!r.accepted) return {};
          const marks = touch(unmark(s, r.cleared), `ans.${key}` as FieldPath);
          return { ans: r.ans, txt: r.txt, fin: r.fin, em: r.em, borrowers: r.borrowers, ...marks };
        }),

      setChip: (chip, on) => get().setAns(chip, on ? "Ja" : "Nein"),

      setTxt: (key, value) =>
        set((s) => {
          const txt = { ...s.txt, [key]: value };
          const marks = touch(s, `txt.${key}` as FieldPath);
          if ((key === "vor" || key === "nach") && s.borrowers.length > 0) {
            const borrowers = s.borrowers.map((b, i) => (i === 0 ? { ...b, [key]: value } : b));
            return { txt, borrowers, ...marks };
          }
          return { txt, ...marks };
        }),

      setFin: (key, value) => set((s) => ({ fin: { ...s.fin, [key]: amount(value) }, ...touch(s, `fin.${key}` as FieldPath) })),

      setEm: (key, value) => set((s) => ({ em: { ...s.em, [key]: amount(value) }, ...touch(s, `em.${key}` as FieldPath) })),

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
          const borrowers = s.borrowers.filter((b) => b.id !== id);
          // Kreditnehmer 2's income goes with them; a later Kreditnehmer 2 starts unmarked.
          const paths = Object.keys({ ...s.touched, ...s.src }).filter((p) => p.startsWith(`borrower.${i}.`)) as FieldPath[];
          const marks = unmark(s, i === 1 ? [...paths, "fin.inc2"] : paths);
          return { borrowers, ...(i === 1 ? { fin: { ...s.fin, inc2: 0 } } : {}), ...marks };
        }),

      updateBorrower: (id, patch) =>
        set((s) => {
          const i = s.borrowers.findIndex((b) => b.id === id);
          if (i < 0) return {};
          const next: Borrower = { ...s.borrowers[i], ...patch, id };
          if (next.job !== "Selbständig") next.pkSe = "Nein";
          const borrowers = s.borrowers.map((b, j) => (j === i ? next : b));
          const marks = touch(s, ...(Object.keys(patch) as ("vor" | "nach" | "job" | "pkSe")[]).map((k) => `borrower.${i}.${k}` as FieldPath));
          if (i === 0) {
            const nameMarks = touch(marks, ...(["vor", "nach"] as const).filter((k) => k in patch).map((k) => `txt.${k}` as FieldPath));
            return { borrowers, txt: { ...s.txt, vor: next.vor, nach: next.nach }, ...nameMarks };
          }
          return { borrowers, ...marks };
        }),

      confirmSource: (path) =>
        set((s) => {
          const m = s.src[path];
          if (!m || !m.unsure) return {};
          return { src: { ...s.src, [path]: { ...m, unsure: false } } };
        }),

      applyCorrection: (patch) => {
        const s = get();
        for (const [k, v] of Object.entries(patch.ans ?? {}) as [keyof Answers, never][]) s.setAns(k, v);
        for (const [k, v] of Object.entries(patch.em ?? {}) as [keyof Eigenmittel, number][]) get().setEm(k, v);
      },

      applyDocuments: (result) =>
        set((s) => {
          const next = applyPrefill(s, result);
          return sameDocuments(s, next) ? {} : next;
        }),

      setSignature: (choice) => set({ sig: choice ? { choice, at: new Date().toISOString(), method: "upload" } : null }),

      goto: (step) => {
        const s = get();
        if (step < 0 || step > stepCount(s.mode) || step > s.visited) return false;
        set({ step });
        return true;
      },

      next: () =>
        set((s) => {
          const step = asStep(Math.min(s.step + 1, stepCount(s.mode)));
          return { step, visited: asStep(Math.max(s.visited, step)) };
        }),

      back: () => set((s) => ({ step: asStep(s.step - 1) })),

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
  };
}

const json = (v: unknown) => JSON.stringify(v ?? null);

/** True when applying the documents changes nothing — so a store subscription settles. */
function sameDocuments(s: FunnelState, next: Partial<FunnelState>): boolean {
  return (["ans", "txt", "fin", "em", "borrowers", "info", "src", "touched"] as const).every((k) => json(next[k]) === json(s[k]));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const useFunnelV3 = create<FunnelV3Store>()(
  persist(
    (set, get) => funnelV3Creator(set, get),
    {
      name: FUNNEL_V3_STORAGE_KEY,
      version: FUNNEL_V3_STORAGE_VERSION,
      storage: createJSONStorage(sessionStore),
      skipHydration: true,
      partialize: (s): FunnelV3Data => ({
        role: s.role,
        mode: s.mode,
        ans: s.ans,
        borrowers: s.borrowers,
        txt: s.txt,
        fin: s.fin,
        em: s.em,
        info: s.info,
        src: s.src,
        touched: s.touched,
        sig: s.sig,
        submissionId: s.submissionId,
        sharepointFolderId: s.sharepointFolderId,
        step: s.step,
        visited: s.visited,
        files: serialisableFiles(s.files),
        skipped: s.skipped,
        dismissed: s.dismissed,
        entry: s.entry,
      }),
      // An older copy (a v3 session, version 1) is dropped, not reshaped: the funnel starts empty.
      migrate: () => ({}) as FunnelV3Store,
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<FunnelV3Data>;
        return {
          ...current,
          ...p,
          mode: p.mode === "schnell" ? "schnell" : "begleitet",
          ans: isObj(p.ans) ? ({ ...DEFAULT_ANSWERS, ...p.ans } as Answers) : current.ans,
          txt: isObj(p.txt) ? ({ ...EMPTY_TEXTS, ...p.txt } as Texts) : current.txt,
          fin: isObj(p.fin) ? ({ ...EMPTY_AMOUNTS, ...p.fin } as Amounts) : current.fin,
          em: isObj(p.em) ? ({ ...EMPTY_EM, ...p.em } as Eigenmittel) : current.em,
          info: isObj(p.info) ? (p.info as DocInfo) : {},
          src: isObj(p.src) ? (p.src as Sources) : {},
          touched: isObj(p.touched) ? (p.touched as FunnelState["touched"]) : {},
          sig: isObj(p.sig) ? (p.sig as FunnelState["sig"]) : null,
          borrowers: Array.isArray(p.borrowers) && p.borrowers.length ? p.borrowers : current.borrowers,
          files: Array.isArray(p.files) ? p.files : current.files,
          skipped: Array.isArray(p.skipped) ? p.skipped : [],
          dismissed: Array.isArray(p.dismissed) ? p.dismissed : [],
          entry: p.entry === "portal" ? "portal" : null,
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

/**
 * A store with the funnel's shape and actions but without sessionStorage — for a page outside
 * the funnel that reuses the documents pipeline (the Nachreich page, lib/funnel-v3/upload.ts
 * `bindUploadPipeline`). It never touches the funnel's own saved session.
 */
export function createFunnelV3Store(init: Partial<FunnelV3Data> = {}) {
  return create<FunnelV3Store>()((set, get) => ({ ...funnelV3Creator(set, get), ...init }));
}
