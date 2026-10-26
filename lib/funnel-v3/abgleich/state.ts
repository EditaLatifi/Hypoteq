/**
 * The Abgleich JSON for Salesforce (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 6.2):
 * written to `Case.Funnel_Abgleich_State__c` (Long Text, 131'072 characters; answer 7 of
 * 26.10.2026) beside the Case's funnel values, which stay leading. HYPOTEQ's «Daten-Review»
 * panel reads it; hints and documents without a funnel answer appear only here, never to the
 * customer. Pure.
 *
 * Beyond 6.2, additive: `person` / `borrower` / `part` tell the entries of one key apart (two
 * borrowers, Schenkung · Darlehen · Erbe), `ampel` and `field` on each extracted value,
 * `original` in a choice that took a document's value, `submittedBy` (who receives a re-upload
 * request, answer 9) and `rulesFrom` (Salesforce or the built-in start values).
 */

import { translate, type Lang } from "../i18n";
import { LANGS } from "../i18n";
import type { AbgleichField, AbgleichResult, CustomerChoice } from "./evaluate";

export const ABGLEICH_STATE_VERSION = 1;
/** Long Text length of `Case.Funnel_Abgleich_State__c`. */
export const ABGLEICH_STATE_MAX = 131_072;

type Texts4 = Record<Lang, string>;

export interface AbgleichStateJson {
  version: number;
  submittedAt: string;
  funnelPath: "schnellanmeldung" | "begleitete_anmeldung";
  submittedBy: "kunde" | "berater";
  rulesFrom: "salesforce" | "fallback";
  fields: {
    key: string;
    part?: string;
    borrower?: number;
    person?: string;
    label: Texts4;
    funnelValue: number | string | null;
    extracted: { docType: string; docId: string; value: number | string; confidence: number; sourceRef: string | null; role: "primary" | "secondary"; ampel: string; field: string }[];
    result: AbgleichField["result"];
    customerChoice?: CustomerChoice;
    explanation?: Texts4;
  }[];
  summary: { ok: number; hint: number; conflict: number; identityConflict: number; toCheck: number; unverified: number };
  reuploads: { requirement: string; requestedAt: string | null; resolvedAt: string | null }[];
}

const all = (key: string, params?: Record<string, string | number>): Texts4 =>
  Object.fromEntries(LANGS.map((l) => [l, translate(l, key, params)])) as Texts4;

/** «Jahreseinkommen», «Eigenmittel: Schenkung» in the four languages. */
export function fieldLabel(f: Pick<AbgleichField, "key" | "part">): Texts4 {
  return all(f.part ? `abg.label.${f.key}.${f.part}` : `abg.label.${f.key}`);
}

export interface AbgleichStateInput {
  result: AbgleichResult;
  submittedAt: Date;
  mode: "schnell" | "begleitet" | undefined;
  role: "kunde" | "berater" | null | undefined;
  rulesFrom: "salesforce" | "fallback";
  /** Borrower ids in order (Kreditnehmer 1, 2). */
  borrowerIds: string[];
  reuploads?: AbgleichStateJson["reuploads"];
}

export function buildAbgleichState(input: AbgleichStateInput): AbgleichStateJson {
  const fields = input.result.fields.map((f) => {
    const idx = f.borrowerId ? input.borrowerIds.indexOf(f.borrowerId) : -1;
    return {
      key: f.key,
      ...(f.part ? { part: f.part } : {}),
      ...(idx >= 0 ? { borrower: idx + 1 } : {}),
      ...(f.person ? { person: f.person } : {}),
      label: fieldLabel(f),
      // 6.2: «der gewählte Wert ist zugleich der übermittelte Funnel-Wert» — the value submitted;
      // what the customer had typed before taking a document value stays in customerChoice.original.
      funnelValue: f.funnelValue,
      extracted: f.extracted.map((e) => ({ docType: e.docType, docId: e.docId, value: e.value, confidence: e.confidence, sourceRef: e.sourceRef, role: e.role, ampel: e.ampel, field: e.field })),
      result: f.result,
      ...(f.customerChoice ? { customerChoice: f.customerChoice } : {}),
      ...(f.explanationKey && (f.result !== "ok" || f.customerChoice) ? { explanation: all(f.explanationKey) } : {}),
    };
  });
  return {
    version: ABGLEICH_STATE_VERSION,
    submittedAt: input.submittedAt.toISOString(),
    funnelPath: input.mode === "schnell" ? "schnellanmeldung" : "begleitete_anmeldung",
    submittedBy: input.role === "berater" ? "berater" : "kunde",
    rulesFrom: input.rulesFrom,
    fields,
    summary: input.result.summary,
    reuploads: input.reuploads ?? [],
  };
}

/**
 * The JSON as the Case field holds it. Over the field's length (never seen: a case has a few
 * dozen entries) the secondary readings go first, then the explanations — the results stay.
 */
export function abgleichStateText(state: AbgleichStateJson): string {
  let text = JSON.stringify(state);
  if (text.length <= ABGLEICH_STATE_MAX) return text;
  const lean = { ...state, fields: state.fields.map((f) => ({ ...f, extracted: f.extracted.filter((e) => e.role === "primary") })) };
  text = JSON.stringify(lean);
  if (text.length <= ABGLEICH_STATE_MAX) return text;
  text = JSON.stringify({ ...lean, fields: lean.fields.map(({ explanation: _e, ...f }) => f) });
  return text.length <= ABGLEICH_STATE_MAX ? text : JSON.stringify({ ...state, fields: [], truncated: true });
}

/** The customer's choices as the submitted funnel state carries them (`v3.abgleich.choices`). */
export function choicesOf(data: unknown): Record<string, CustomerChoice> {
  const raw = (data as { v3?: { abgleich?: { choices?: unknown } } } | null)?.v3?.abgleich?.choices;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, CustomerChoice> = {};
  for (const [id, c] of Object.entries(raw as Record<string, unknown>)) {
    const v = c as Partial<CustomerChoice> | null;
    if (!v || (v.chosenSource !== "funnel" && v.chosenSource !== "document")) continue;
    if (typeof v.value !== "number" && typeof v.value !== "string") continue;
    out[id.slice(0, 200)] = {
      value: v.value,
      chosenSource: v.chosenSource,
      at: typeof v.at === "string" ? v.at.slice(0, 40) : "",
      ...(typeof v.original === "number" || typeof v.original === "string" ? { original: v.original } : {}),
    };
  }
  return out;
}
