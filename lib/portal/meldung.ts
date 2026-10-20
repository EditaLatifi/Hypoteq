import { queueKey } from "@/components/salesforceQueues";
import type { SfConnection } from "@/lib/portal/changeRequests";
import { isSalesforceId } from "@/lib/portal/salesforce";

/**
 * Portal_Meldung__c (HYPOTEQ 20.10.2026): the integration user runs on the «Salesforce
 * Integration» licence, which cannot create Tasks at all. The portal writes a Portal_Meldung__c
 * instead and a Flow in HYPOTEQ's org creates the Task from it, in system context:
 *   Frage / Fehler / Wunsch / Änderungsantrag → an open Task (High) for Fisnik Salihu
 *   Case-Nachricht with Case__c                → a completed Task on the Case (owner = Case owner)
 * Fields: Typ__c (required picklist), Betreff__c (Text 255), Beschreibung__c and
 * Technische_Angaben__c (Long Text), Partner_Email__c, Partner_Account__c (Account), Case__c (Case).
 * The e-mail to info@hypoteq.ch goes out beside it, as before.
 */

export type MeldungTyp = "frage" | "fehler" | "wunsch" | "aenderungsantrag" | "case_nachricht";

/** The picklist value each type is looked for under, first one written when the values are unknown. */
const TYP_LABELS: Record<MeldungTyp, string[]> = {
  frage: ["Frage"],
  fehler: ["Fehler"],
  wunsch: ["Wunsch"],
  aenderungsantrag: ["Änderungsantrag", "Aenderungsantrag", "Änderung"],
  case_nachricht: ["Case-Nachricht", "Case Nachricht", "Nachricht"],
};

export const MELDUNG_OBJECT = "Portal_Meldung__c";
const LONG_TEXT_MAX = 32000;

export type MeldungInput = {
  typ: MeldungTyp;
  betreff: string;
  beschreibung: string;
  technischeAngaben?: string | null;
  partnerEmail?: string | null;
  partnerAccountId?: string | null;
  caseId?: string | null;
};

/**
 * The org's picklist value for `typ`, matched loosely («Case-Nachricht», «Case Nachricht»,
 * «Änderungsantrag», «Aenderungsantrag») against the active values; the German label when the
 * values are unknown or none matches.
 */
export function pickTypValue(values: string[], typ: MeldungTyp): string {
  const wanted = new Set(TYP_LABELS[typ].map(queueKey));
  return values.find((v) => wanted.has(queueKey(v))) ?? TYP_LABELS[typ][0];
}

/** The record as Salesforce takes it. Lookups only when they hold an Id. */
export function meldungRecord(input: MeldungInput, typValue: string): Record<string, unknown> {
  const record: Record<string, unknown> = {
    Typ__c: typValue,
    Betreff__c: input.betreff.slice(0, 255),
    Beschreibung__c: input.beschreibung.slice(0, LONG_TEXT_MAX),
  };
  if (input.technischeAngaben) record.Technische_Angaben__c = input.technischeAngaben.slice(0, LONG_TEXT_MAX);
  if (input.partnerEmail) record.Partner_Email__c = input.partnerEmail;
  if (isSalesforceId(input.partnerAccountId)) record.Partner_Account__c = input.partnerAccountId;
  if (isSalesforceId(input.caseId)) record.Case__c = input.caseId;
  return record;
}

// The active Typ__c values, read once per instance (a failed read is asked again next time).
let typValues: string[] | null = null;

/** For tests. */
export function resetMeldungTypCache(): void {
  typValues = null;
}

async function readTypValues(sf: SfConnection): Promise<string[]> {
  if (typValues) return typValues;
  const describe = sf.sobject(MELDUNG_OBJECT).describe;
  if (!describe) return [];
  try {
    const d = await describe();
    const field = (d?.fields || []).find((f: any) => f?.name === "Typ__c");
    const values = (field?.picklistValues || []).filter((v: any) => v?.active !== false).map((v: any) => String(v.value));
    if (values.length) typValues = values;
    return values;
  } catch (err) {
    console.warn("[portal] Portal_Meldung__c not describable, writing the German Typ label", errorText(err));
    return [];
  }
}

function errorText(err: any): string {
  if (Array.isArray(err?.errors) && err.errors.length) return err.errors.map((e: any) => e?.message || String(e)).join("; ");
  if (Array.isArray(err) && err.length) return err.map((e: any) => e?.message || String(e)).join("; ");
  return err?.data?.message || err?.message || String(err);
}

/**
 * Create the Portal_Meldung__c. Never throws: the caller's mail goes out either way. Should the
 * org refuse the partner's Account (a lookup filter), it is tried once more without it — the
 * description names the partner anyway.
 */
export async function createPortalMeldung(sf: SfConnection, input: MeldungInput): Promise<{ id: string | null; error: string | null }> {
  const record = meldungRecord(input, pickTypValue(await readTypValues(sf), input.typ));
  const attempt = async (r: Record<string, unknown>): Promise<string> => {
    const res = await sf.sobject(MELDUNG_OBJECT).create(r);
    const out = Array.isArray(res) ? res[0] : res;
    if (!out?.id || out?.success === false) throw out;
    return String(out.id);
  };
  try {
    return { id: await attempt(record), error: null };
  } catch (first) {
    if (!("Partner_Account__c" in record)) return { id: null, error: errorText(first) };
    console.warn("[portal] Portal_Meldung__c refused, retrying without the partner's Account", errorText(first));
    const { Partner_Account__c: _account, ...rest } = record;
    try {
      return { id: await attempt(rest), error: null };
    } catch (second) {
      return { id: null, error: errorText(second) };
    }
  }
}
