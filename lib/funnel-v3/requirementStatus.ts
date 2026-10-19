/**
 * Requirement states, Salesforce flags, answer corrections and bank hints
 * (Spezifikation 4.2, 4.4, 6.9 and Schritt 6; v5: Handover 3.1). Pure.
 */

import { EMPTY_EM, type Answers, type Eigenmittel } from "./types";
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
  /** Note from the extraction («Wird mit der Erhöhung abgelöst», «Police ist an die Musterbank verpfändet»). */
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

/**
 * The one document tally every screen shows (documents step, closing, Kennzahlen):
 * fulfilled + review + missing = total, the Auskunftsermächtigung counted like any requirement
 * (DECISIONS V51). «missing» includes optional documents not yet there and files still being
 * read, so the three numbers always add up to the total shown beside them.
 */
export interface DocumentTally {
  total: number;
  /** Erkannt, or «Habe ich nicht» on an optional requirement. */
  fulfilled: number;
  /** Partial or outdated: a person should look at it. */
  review: number;
  /** Not there yet (or still being read). */
  missing: number;
}

export function documentTally(counts: StatusCounts): DocumentTally {
  return {
    total: counts.total,
    fulfilled: counts.fulfilled,
    review: counts.partial + counts.outdated,
    missing: counts.missing + counts.analysing,
  };
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

// ---- Answer corrections (spec 4.4, Handover 3.1) -------------------------------------------

/** What accepting a suggestion sets: chips / answers and Eigenmittel amounts. */
export interface CorrectionPatch {
  ans?: Partial<Answers>;
  em?: Partial<Eigenmittel>;
}

export interface AnswerCorrection {
  /** i18n `sug.<key>.title`. */
  key: "loan" | "maint" | "3a" | "stwe";
  titleKey: string;
  /** i18n key of the text (v5 wording for chips and amounts); `params` fill it. */
  textKey: string;
  params?: Record<string, string | number>;
  /** What «Ja, ergänzen» sets. Empty when the value must be typed (3a without a readable amount). */
  patch: CorrectionPatch;
  /** The field to fill in by hand when `patch` cannot carry the value (`em.s3a`). */
  focus?: "em.s3a";
  /** The recognised requirement ids the correction brings onto the list. */
  requirementIds: string[];
}

/** Values read from the recognised documents that a suggestion can carry (prefill.ts reads them). */
export interface CorrectionValues {
  /** Säule 3a: the policy's Rückkaufswert or the account's Guthaben (CHF). */
  s3a?: number;
}

const CORRECTIONS: {
  key: AnswerCorrection["key"];
  ids: string[];
  build: (ids: Set<string>, values: CorrectionValues) => Pick<AnswerCorrection, "patch" | "textKey" | "params" | "focus">;
}[] = [
  {
    // Privatkredit / Leasing chips.
    key: "loan",
    ids: ["kredit", "leasing"],
    build: (ids) => ({
      textKey: "sug.loan.chipText",
      patch: { ans: { ...(ids.has("kredit") ? { kredite: "Ja" as const } : {}), ...(ids.has("leasing") ? { leasing: "Ja" as const } : {}) } },
    }),
  },
  // «Unterhaltszahlungen» chip (v5: no Kinder question any more).
  { key: "maint", ids: ["unterhalt"], build: () => ({ textKey: "sug.maint.chipText", patch: { ans: { unterhalt: "Ja" } } }) },
  {
    // Säule 3a: the amount read from the policy goes into the Vorsorge row (prototype suggests).
    key: "3a",
    ids: ["s3a", "police"],
    build: (_ids, values) =>
      values.s3a && values.s3a > 0
        ? { textKey: "sug.3a.amountText", params: { amount: values.s3a }, patch: { em: { s3a: values.s3a } } }
        : { textKey: "sug.3a.enterText", patch: {}, focus: "em.s3a" },
  },
  { key: "stwe", ids: ["stwe_regl", "ef"], build: () => ({ textKey: "sug.stwe.text", patch: { ans: { lieg: "Stockwerkeigentum" } } }) },
];

/**
 * Spec 4.4 (principle 5), Handover 3.1: in the Begleitete Anmeldung a recognised document that
 * belongs to a chip not tapped, an Eigenmittel amount not entered or another Liegenschaft
 * becomes a suggestion («Wir haben einen Kreditvertrag erkannt – ergänzen?»), never an
 * automatic change. (The Schnellanmeldung prefills instead — prefill.ts.)
 *
 * `recognisedRequirementIds` are the requirement ids (or instance ids) the analysis assigned
 * to uploaded files. A suggestion is made only when the requirement is not on the list now
 * and the patch actually puts it there (e.g. no Unterhalt suggestion for a juristische Person)
 * — or, for Säule 3a without a readable amount, would put it there once an amount is typed.
 */
export function answerCorrections(
  state: ReqState,
  recognisedRequirementIds: Iterable<string>,
  values: CorrectionValues = {}
): AnswerCorrection[] {
  const current = new Set(reqList(state).map((r) => r.id));
  const recognised = new Set([...recognisedRequirementIds].map(baseId));
  const out: AnswerCorrection[] = [];
  for (const c of CORRECTIONS) {
    const hit = new Set(c.ids.filter((id) => recognised.has(id) && !current.has(id)));
    if (!hit.size) continue;
    const built = c.build(hit, values);
    // For a value to be typed, test with a stand-in amount.
    const em = { ...(state.em ?? EMPTY_EM), ...(built.patch.em ?? {}), ...(built.focus === "em.s3a" ? { s3a: 1 } : {}) };
    const after = new Set(reqList({ ...state, ans: { ...state.ans, ...(built.patch.ans ?? {}) }, em }).map((r) => r.id));
    const brought = [...hit].filter((id) => after.has(id));
    if (!brought.length) continue;
    out.push({ key: c.key, titleKey: `sug.${c.key}.title`, ...built, requirementIds: brought });
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
