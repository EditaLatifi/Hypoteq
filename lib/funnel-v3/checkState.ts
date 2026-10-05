/**
 * `Case.Dokumenten_Check_State__c` (Spezifikation 6.11, DECISIONS S3). Pure.
 *
 * Writes the spec 6.11 structure (`version, updatedAt, answers, requirements, extras, hints`)
 * AND keeps the legacy `checked` / `filters` / `savedAt` the Salesforce «Dokumenten-Check» tab
 * and the partner portal read. Like buildDokumentenCheckState it merges onto what the Case
 * already holds: manual ticks and the filters snapshot survive, nothing is ever unticked.
 */

import type { DokumentenCheckState } from "@/components/dokumentenCheckState";
import { effectiveBorrowers, reasonTextDe, type ReqState } from "./requirements";
import type { BankHint, ExtraKind, RequirementState, StatusResult } from "./requirementStatus";

/** Salesforce long text area limit of Dokumenten_Check_State__c. */
export const CHECK_STATE_MAX_LENGTH = 131072;

export interface CheckStateFile {
  originalName: string;
  storedName?: string;
  url?: string;
  confidence?: number;
}
export interface CheckStateField {
  key: string;
  value: string;
  confidence?: number;
}
export interface CheckStateAudit {
  ts: string;
  text: string;
}
/** Per instance id: what the analysis knows about the requirement's files. */
export interface CheckStateDetail {
  files?: CheckStateFile[];
  fields?: CheckStateField[];
  audit?: CheckStateAudit[];
}

/** Spec 6.11 `status` has no «analysing»: a file still being read is not there yet. */
export type CheckStateStatus = Exclude<RequirementState, "analysing">;

export interface CheckStateRequirement {
  /** Instance id (`grundbuch`, `id#b1`). */
  id: string;
  /** Catalogue id, when it differs from `id` (per-borrower instances). */
  requirementId?: string;
  code: string;
  label: string;
  group: string;
  reason: string;
  status: CheckStateStatus;
  /** Whose document (borrower, Solidarbürge, company), when it is a person document. */
  person?: string;
  /** The file count when the files themselves had to be dropped for size. */
  fileCount?: number;
  files?: CheckStateFile[];
  fields?: CheckStateField[];
  audit?: CheckStateAudit[];
}

export interface CheckStateV3 extends DokumentenCheckState {
  version: 1;
  updatedAt: string;
  answers: Record<string, unknown>;
  requirements: CheckStateRequirement[];
  extras: { name: string; kind: ExtraKind }[];
  hints: { title: string; text: string }[];
  /** What the size guard removed, in order. Absent when nothing was removed. */
  truncated?: string[];
}

export interface BuildCheckStateInput {
  state: ReqState;
  status: StatusResult;
  details?: Record<string, CheckStateDetail>;
  extras?: { name: string; kind: ExtraKind }[];
  hints?: (BankHint | { title: string; text: string })[];
  /** What the Case holds now (JSON string). */
  previous?: string | null;
  now?: Date;
  maxLength?: number;
}

function parsePrevious(previous?: string | null): DokumentenCheckState | null {
  if (!previous) return null;
  try {
    const parsed = JSON.parse(previous);
    if (parsed && typeof parsed === "object" && parsed.checked && typeof parsed.checked === "object") return parsed;
  } catch {
    /* not JSON (an earlier sync wrote prose here) — nothing to keep */
  }
  return null;
}

function answersBlock(state: ReqState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state.ans)) if (v !== undefined && v !== null) out[k] = v;
  if (state.ans.kn !== "Juristische Person") {
    const bs = effectiveBorrowers(state);
    // Spec 6.11 shows one flat pkSe; with several borrowers (DECISIONS D3) the list carries each.
    if (bs[0]?.job) out.job = bs[0].job;
    out.pkSe = bs[0]?.pkSe ?? "Nein";
    out.borrowers = bs.map((b) => ({ id: b.id, ...(b.job ? { job: b.job } : {}), pkSe: b.pkSe }));
  }
  return out;
}

const OWN_KEYS = new Set(["version", "updatedAt", "answers", "requirements", "extras", "hints", "checked", "savedAt", "truncated"]);

/** Build the state object (see `buildCheckState` for the string). */
export function buildCheckStateObject(input: BuildCheckStateInput): CheckStateV3 {
  const now = input.now ?? new Date();
  const base = parsePrevious(input.previous);

  const requirements: CheckStateRequirement[] = input.status.requirements.map((r) => {
    const inst = r.instance;
    const d = input.details?.[inst.instanceId] || {};
    return {
      id: inst.instanceId,
      ...(inst.instanceId !== inst.id ? { requirementId: inst.id } : {}),
      code: inst.code,
      label: inst.labelDe,
      group: inst.group,
      reason: reasonTextDe(inst.reason),
      status: r.state === "analysing" ? "missing" : r.state,
      ...(inst.person?.display ? { person: inst.person.display } : {}),
      files: d.files ? d.files.map((f) => ({ ...f })) : [],
      fields: d.fields ? d.fields.map((f) => ({ ...f })) : [],
      audit: d.audit ? d.audit.map((a) => ({ ...a })) : [],
    };
  });

  // Legacy tab: tick what is here, keep what a caseworker ticked.
  const checked: Record<string, boolean> = { ...(base?.checked || {}) };
  for (const r of input.status.requirements) {
    if (r.state !== "ok") continue;
    for (const entry of r.instance.def.tabEntries) checked[entry] = true;
  }

  // Anything else on the previous state (filters, keys we do not know) is carried over;
  // what this function writes is replaced.
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base || {})) if (!OWN_KEYS.has(k)) rest[k] = v;
  return {
    version: 1,
    updatedAt: now.toISOString(),
    answers: answersBlock(input.state),
    requirements,
    extras: (input.extras || []).map((e) => ({ name: e.name, kind: e.kind })),
    hints: (input.hints || []).map((h) => ({ title: "titleDe" in h ? h.titleDe : h.title, text: h.text })),
    ...rest,
    checked,
    savedAt: now.toISOString(),
  };
}

/**
 * The value for Dokumenten_Check_State__c, kept under the field limit: when too long, first
 * the audit trails go, then the extracted fields, then the file URLs (spec order); as a last
 * resort the file lists themselves (their count stays). `truncated` says what was removed.
 */
export function buildCheckState(input: BuildCheckStateInput): string {
  const max = input.maxLength ?? CHECK_STATE_MAX_LENGTH;
  const obj = buildCheckStateObject(input);
  let json = JSON.stringify(obj);
  if (json.length <= max) return json;

  const steps: [string, (r: CheckStateRequirement) => void][] = [
    ["audit", (r) => void delete r.audit],
    ["fields", (r) => void delete r.fields],
    ["urls", (r) => r.files?.forEach((f) => delete f.url)],
    ["files", (r) => { r.fileCount = r.files?.length ?? 0; delete r.files; }],
  ];
  obj.truncated = [];
  for (const [name, apply] of steps) {
    obj.requirements.forEach(apply);
    obj.truncated.push(name);
    json = JSON.stringify(obj);
    if (json.length <= max) return json;
  }
  return json;
}
