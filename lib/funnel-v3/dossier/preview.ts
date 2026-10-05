/**
 * The «Entwurf» dossier before the closing: what /api/dossier/preview accepts from the
 * browser, checked and reduced to a DossierInput. Pure. Nothing here is trusted beyond
 * drawing a PDF for the person who sent it — no database, no Salesforce, no case number.
 */

import type { FileEntry, V3Analysis } from "../files";
import { isLang, type Lang } from "../i18n";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS, MAX_BORROWERS, type Answers, type Amounts, type Borrower, type Texts } from "../types";
import type { DossierFile, DossierInput } from "./model";

export const PREVIEW_MAX_FILES = 300;
const MAX_TEXT = 2000;
const MAX_FIELDS = 40;

export interface PreviewRequest {
  lang?: string;
  state?: { role?: unknown; ans?: unknown; txt?: unknown; fin?: unknown; borrowers?: unknown };
  files?: unknown;
  skipped?: unknown;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, max = MAX_TEXT) => (typeof x === "string" ? x.slice(0, max) : "");
const amount = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.min(x, 1e10) : 0);

function answers(x: unknown): Answers {
  const out: Record<string, unknown> = { ...DEFAULT_ANSWERS };
  if (isObj(x)) for (const [k, v] of Object.entries(x)) if (typeof v === "string" && v.length <= 60) out[k] = v;
  return out as unknown as Answers;
}

function texts(x: unknown): Texts {
  const out: Record<string, string> = { ...EMPTY_TEXTS };
  if (isObj(x)) for (const k of Object.keys(EMPTY_TEXTS)) out[k] = text(x[k]);
  return out as unknown as Texts;
}

function amounts(x: unknown): Amounts {
  const out: Record<string, number> = { ...EMPTY_AMOUNTS };
  if (isObj(x)) for (const k of Object.keys(EMPTY_AMOUNTS)) out[k] = amount(x[k]);
  return out as unknown as Amounts;
}

function borrowers(x: unknown): Borrower[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(isObj)
    .slice(0, MAX_BORROWERS)
    .map((b, i) => ({
      id: text(b.id, 64) || String(i + 1),
      vor: text(b.vor, 200),
      nach: text(b.nach, 200),
      ...(typeof b.job === "string" ? { job: b.job as Borrower["job"] } : {}),
      pkSe: b.pkSe === "Ja" ? "Ja" : "Nein",
    }));
}

function analysis(x: unknown): V3Analysis | null {
  if (!isObj(x)) return null;
  const fields: V3Analysis["fields"] = {};
  if (isObj(x.fields)) {
    for (const [k, v] of Object.entries(x.fields).slice(0, MAX_FIELDS)) {
      if (!isObj(v)) continue;
      const value = typeof v.value === "number" ? v.value : typeof v.value === "string" ? v.value.slice(0, 300) : null;
      fields[k.slice(0, 80)] = { value, confidence: typeof v.confidence === "number" ? v.confidence : 0 };
    }
  }
  const str = (y: unknown, max = 300) => (typeof y === "string" ? y.slice(0, max) : null);
  const kinds = ["surplus", "duplicate", "notneeded", "unknown"];
  return {
    status: x.status === "failed" ? "failed" : "done",
    docTypeId: str(x.docTypeId, 60),
    docTypeLabel: str(x.docTypeLabel),
    confidence: typeof x.confidence === "number" ? x.confidence : 0,
    requirementId: str(x.requirementId, 60),
    ...(typeof x.extraKind === "string" && kinds.includes(x.extraKind) ? { extraKind: x.extraKind as V3Analysis["extraKind"] } : {}),
    extraReason: str(x.extraReason) ?? undefined,
    personName: str(x.personName),
    bank: str(x.bank),
    docDate: str(x.docDate, 40),
    outdated: x.outdated === true,
    outdatedReason: str(x.outdatedReason),
    note: str(x.note, 1000),
    fields,
  };
}

/** Browser file entries (FileEntry) → dossier files. Failed uploads are not in the dossier. */
export function previewFiles(x: unknown): DossierFile[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(isObj)
    .slice(0, PREVIEW_MAX_FILES)
    .filter((f) => (f as Partial<FileEntry>).uploadState !== "failed")
    .map((f, i) => {
      const a = analysis(f.analysis);
      const instanceId = typeof f.instanceId === "string" && f.instanceId ? f.instanceId.slice(0, 120) : null;
      return {
        id: text(f.id, 120) || `f${i}`,
        name: text(f.name, 300) || "–",
        instanceId,
        extraKind: instanceId ? undefined : a?.extraKind,
        keep: f.keep === true,
        outdatedOverride: f.outdatedOverride === true,
        analysis: f.analysisState === "done" || f.analysisState === "failed" ? a : null,
      };
    });
}

export function previewInput(body: PreviewRequest, now: Date = new Date()): DossierInput {
  const s = isObj(body?.state) ? body.state : {};
  const lang: Lang = isLang(body?.lang) ? body.lang : "de";
  return {
    lang,
    draft: true,
    caseNumber: null,
    date: now,
    state: {
      role: s.role === "berater" || s.role === "kunde" ? s.role : null,
      ans: answers(s.ans),
      txt: texts(s.txt),
      fin: amounts(s.fin),
      borrowers: borrowers(s.borrowers),
    },
    files: previewFiles(body?.files),
    skipped: Array.isArray(body?.skipped) ? body.skipped.filter((x): x is string => typeof x === "string").slice(0, 100) : [],
  };
}
