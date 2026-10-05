/**
 * Requirement states, Salesforce flags, answer corrections and bank hints
 * (Spezifikation 4.2, 4.4, 6.9 and Schritt 6). Pure.
 */

import type { Answers } from "./types";
import { REQ, baseId, reqList, type ReqState, type RequirementInstance } from "./requirements";

export type FileStatus = "analysing" | "done" | "failed";
export type ExtraKind = "surplus" | "duplicate" | "notneeded" | "unknown";

/** One uploaded file as the document analysis reports it. */
export interface UploadedFile {
  fileId: string;
  /** Instance id (`id` or `id#borrower`) the file was assigned to; null when it fits none. */
  requirementId: string | null;
  status: FileStatus;
  /** E.g. a Grundbuchauszug older than 6 months. */
  outdated?: boolean;
  /** «Trotzdem verwenden». */
  outdatedOverride?: boolean;
  /** Set for files outside the list (spec 4.3); such a file never counts for a requirement. */
  extraKind?: ExtraKind;
  /** Note from the extraction («Wird mit der Erhöhung abgelöst», «Police ist an die ZKB verpfändet»). */
  note?: string;
}

/** Spec 4.2. */
export type RequirementState = "missing" | "analysing" | "partial" | "ok" | "outdated" | "skipped";

export interface RequirementStatus {
  instance: RequirementInstance;
  state: RequirementState;
  /** Analysed files that count for the requirement. */
  doneFiles: number;
  expect: number;
  /** Files whose analysis failed (the requirement stays missing for them). */
  failedFiles: number;
  /** An outdated file was accepted with «Trotzdem verwenden». */
  overridden: boolean;
  /** Any counted file is outdated, overridden or not. */
  outdatedFile: boolean;
  fileIds: string[];
}

export interface StatusCounts {
  total: number;
  missing: number;
  analysing: number;
  partial: number;
  ok: number;
  outdated: number;
  skipped: number;
  /** ok + skipped: the «{ok} von {total} Anforderungen erfüllt» number. */
  fulfilled: number;
}

export interface StatusResult {
  requirements: RequirementStatus[];
  counts: StatusCounts;
  /** Every non-optional requirement is ok (an outdated file only counts when overridden). */
  completeForSalesforce: boolean;
  /** Dok_*__c checkboxes for the requirements on this list, plus Documents_completed__c (spec 6.9). */
  dokFlags: Record<string, boolean>;
}

/** Does the file belong to this instance? A bare id also matches the only instance of that id. */
function belongs(file: UploadedFile, inst: RequirementInstance, soleInstance: boolean): boolean {
  if (!file.requirementId || file.extraKind) return false;
  if (file.requirementId === inst.instanceId) return true;
  return soleInstance && file.requirementId === inst.id;
}

/**
 * The state of every requirement.
 *
 * `skipped` holds instance ids marked «Habe ich nicht». It is honoured only for optional
 * requirements (spec 4.2 offers the action only there) and only while no file arrived —
 * «Doch hochladen» replaces the mark.
 */
export function requirementStatus(
  instances: RequirementInstance[],
  files: UploadedFile[],
  skipped: Iterable<string> = []
): StatusResult {
  const skip = new Set(skipped);
  const perId = new Map<string, number>();
  for (const i of instances) perId.set(i.id, (perId.get(i.id) || 0) + 1);

  const requirements = instances.map((inst): RequirementStatus => {
    const mine = files.filter((f) => belongs(f, inst, perId.get(inst.id) === 1));
    const done = mine.filter((f) => f.status === "done");
    const failed = mine.filter((f) => f.status === "failed");
    const outdatedFile = done.some((f) => f.outdated);
    const outdatedOpen = done.some((f) => f.outdated && !f.outdatedOverride);
    let state: RequirementState;
    if (mine.some((f) => f.status === "analysing")) state = "analysing";
    else if (!done.length) state = inst.optional && (skip.has(inst.instanceId) || skip.has(inst.id)) ? "skipped" : "missing";
    else if (outdatedOpen) state = "outdated";
    else if (done.length < inst.expect) state = "partial";
    else state = "ok";
    return {
      instance: inst,
      state,
      doneFiles: done.length,
      expect: inst.expect,
      failedFiles: failed.length,
      overridden: outdatedFile && !outdatedOpen,
      outdatedFile,
      fileIds: mine.map((f) => f.fileId),
    };
  });

  const counts: StatusCounts = { total: requirements.length, missing: 0, analysing: 0, partial: 0, ok: 0, outdated: 0, skipped: 0, fulfilled: 0 };
  for (const r of requirements) counts[r.state]++;
  counts.fulfilled = counts.ok + counts.skipped;

  const completeForSalesforce = requirements.every((r) => r.instance.optional || r.state === "ok");

  // Spec 6.9. A per-borrower flag is set only when every borrower's document is there.
  const dokFlags: Record<string, boolean> = {};
  for (const r of requirements) {
    const field = r.instance.def.sfDokField;
    if (!field) continue;
    // «Dok_Grundbuchauszug__c (nur wenn nicht veraltet)»: an overridden old extract is still old.
    const ok = r.state === "ok" && !(r.instance.id === "grundbuch" && r.outdatedFile);
    dokFlags[field] = (dokFlags[field] ?? true) && ok;
  }
  dokFlags.Documents_completed__c = completeForSalesforce;

  return { requirements, counts, completeForSalesforce, dokFlags };
}

// ---- Answer corrections (spec 4.4) --------------------------------------------------------

export interface AnswerCorrection {
  /** i18n `sug.<key>.title` / `sug.<key>.text`. */
  key: "loan" | "maint" | "3a" | "stwe";
  titleKey: string;
  textKey: string;
  /** The answers to set. */
  patch: Partial<Answers>;
  /** The recognised requirement ids the correction brings onto the list. */
  requirementIds: string[];
}

const CORRECTIONS: { key: AnswerCorrection["key"]; ids: string[]; patch: (ids: Set<string>) => Partial<Answers> }[] = [
  {
    key: "loan",
    ids: ["kredit", "leasing"],
    patch: (ids) => ({ ...(ids.has("kredit") ? { kredite: "Ja" as const } : {}), ...(ids.has("leasing") ? { leasing: "Ja" as const } : {}) }),
  },
  { key: "maint", ids: ["unterhalt"], patch: () => ({ kinder: "Ja", unterhalt: "Ja" }) },
  { key: "3a", ids: ["s3a", "police"], patch: () => ({ s3a: "Ja" }) },
  { key: "stwe", ids: ["stwe_regl", "ef"], patch: () => ({ lieg: "Stockwerkeigentum" }) },
];

/**
 * Spec 4.4 (principle 5): a recognised document that belongs to a «Nein» answer becomes a
 * suggestion to correct the answer, not an error.
 *
 * `recognisedRequirementIds` are the requirement ids (or instance ids) the analysis assigned
 * to uploaded files. A suggestion is made only when the requirement is not on the list now
 * and the patch actually puts it there (e.g. no Unterhalt suggestion for a juristische Person).
 */
export function answerCorrections(state: ReqState, recognisedRequirementIds: Iterable<string>): AnswerCorrection[] {
  const current = new Set(reqList(state).map((r) => r.id));
  const recognised = new Set([...recognisedRequirementIds].map(baseId));
  const out: AnswerCorrection[] = [];
  for (const c of CORRECTIONS) {
    const hit = new Set(c.ids.filter((id) => recognised.has(id) && !current.has(id)));
    if (!hit.size) continue;
    const patch = c.patch(hit);
    const after = new Set(reqList({ ...state, ans: { ...state.ans, ...patch } }).map((r) => r.id));
    const brought = [...hit].filter((id) => after.has(id));
    if (!brought.length) continue;
    out.push({ key: c.key, titleKey: `sug.${c.key}.title`, textKey: `sug.${c.key}.text`, patch, requirementIds: brought });
  }
  return out;
}

// ---- Hints to the bank (spec Schritt 6) -----------------------------------------------------

export interface BankHint {
  kind: "outdated" | "kredit" | "leasing" | "pledged3a";
  instanceId: string;
  /** i18n key of the requirement label — the hint's title. */
  titleKey: string;
  titleDe: string;
  /** The note from the extraction; empty when there is none. */
  text: string;
}

/**
 * «Hinweise an die Bank»: an outdated document (also when used anyway — the bank must know),
 * a Privatkredit, a Leasing, a pledged 3a policy. Each carries the extraction's note.
 * A 3a document is a hint only when the extraction left a note (that is where a pledge shows).
 */
export function bankHints(status: StatusResult, files: UploadedFile[]): BankHint[] {
  const out: BankHint[] = [];
  for (const r of status.requirements) {
    const inst = r.instance;
    const mine = files.filter((f) => r.fileIds.includes(f.fileId) && f.status === "done");
    const note = (pred: (f: UploadedFile) => boolean = () => true) =>
      mine.filter(pred).map((f) => f.note).filter((n): n is string => !!n).join(" ");
    const base = { instanceId: inst.instanceId, titleKey: inst.labelKey, titleDe: inst.labelDe };
    if (r.outdatedFile) out.push({ kind: "outdated", ...base, text: note((f) => !!f.outdated) });
    if (!mine.length) continue;
    if (inst.id === "kredit") out.push({ kind: "kredit", ...base, text: note() });
    else if (inst.id === "leasing") out.push({ kind: "leasing", ...base, text: note() });
    else if (inst.id === "police" || inst.id === "s3a") {
      const n = note();
      if (n) out.push({ kind: "pledged3a", ...base, text: n });
    }
  }
  return out;
}

/** Every requirement id in the catalogue (convenience for callers validating AI output). */
export const REQUIREMENT_IDS: readonly string[] = REQ.map((r) => r.id);

/** Alias: the spec calls them «Hinweise» (Schritt 6). */
export const hints = bankHints;
