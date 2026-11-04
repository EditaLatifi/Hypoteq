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
 *
 * HYPOTEQ «Pre-Check und Rücklieferung» (03.11.2026) and the handover of 04.11.2026 (DECISIONS
 * V101), additive as well: `source` per field (funnel · dokument · chat, 2.1 / 2.4), `documents[]`
 * per document — needed, received, the stored file (2.2) — and the Auskunftsermächtigung's
 * signature as the field `unterschrift_auskunftsermaechtigung`, «to_check» when the AI doubts it
 * (the Pre-Check's «Bestätigung unsicherer Felder», never blocking).
 */

import { translate, type Lang } from "../i18n";
import { LANGS } from "../i18n";
import type { Sources } from "../types";
import type { AbgleichField, AbgleichResult, CustomerChoice } from "./evaluate";

export const ABGLEICH_STATE_VERSION = 1;
/** Long Text length of `Case.Funnel_Abgleich_State__c`. */
export const ABGLEICH_STATE_MAX = 131_072;

type Texts4 = Record<Lang, string>;

/**
 * Where the value submitted for a field came from (HYPOTEQ 03.11. 2.1 `source`): typed in the
 * funnel, given in HYPO, or a document's — prefilled from it or taken over on the Abgleich page;
 * «dokument» also for a field with no funnel answer at all (Baujahr, Geburtsdatum).
 */
export type FieldSource = "funnel" | "dokument" | "chat";

/** One document of the case (HYPOTEQ 03.11. 2.2; handover 04.11. 3 `documents[]`). */
export interface AbgleichDocument {
  /** The document type as the Naming Convention names it («Lohnausweis») — until the shared taxonomy (2.2). */
  typ: string;
  /** The requirement as the Re-Upload interface takes it (`Dokumenten_Check_State__c` requirements[].id); null outside the list. */
  requirement: string | null;
  /** The requirement's code (P2, O3); absent outside the list. */
  code?: string;
  label: Texts4;
  /** Whose document it is («Max Mustermann»), where it is a person's. */
  person?: string;
  /** Asked for by the case's answers (the Soll-Logik); false for an optional one and for a file outside the list. */
  benoetigt: boolean;
  erhalten: boolean;
  /** The stored name (Naming Convention) of the first file; null while there is none. */
  datei: string | null;
  /** Every stored name, when there are several. */
  dateien?: string[];
  /** missing · analysing · partial · ok · outdated · skipped; «extra» for a file outside the list. */
  status: string;
  /** Outside the list: relevant (fallrelevant) · surplus · duplicate · notneeded · unknown. */
  kategorie?: string;
  /** For the analyst, German: the AI's note on the Auskunftsermächtigung, why a file is outside the list. */
  hinweis?: string;
  /** The AI's reading is uncertain — to confirm in the Pre-Check. */
  unsicher?: true;
}

type FieldPath = string;

/** The answers a field's funnel value is made of — to tell where it came from. */
export function fieldPaths(f: Pick<AbgleichField, "key" | "part"> & { borrower?: number }): FieldPath[] {
  const b = f.borrower ?? 0;
  switch (f.key) {
    case "name_kreditnehmer":
      return b === 1 ? ["txt.vor", "txt.nach"] : b === 2 ? ["borrower.1.vor", "borrower.1.nach"] : [];
    case "jahreseinkommen":
    case "einkommen_selbstaendig":
    case "renteneinkommen":
      return b === 1 ? ["fin.inc"] : b === 2 ? ["fin.inc2"] : [];
    case "eigenmittel_total":
      return ["em.spar", "em.s3a", "em.pkVor", "em.schenk", "em.erbe", "em.darl"];
    case "eigenmittel_3a":
      return ["em.s3a"];
    case "eigenmittel_pk_vorbezug":
      return ["em.pkVor"];
    case "eigenmittel_schenkung_darlehen_erbe":
      return f.part === "schenkung" ? ["em.schenk"] : f.part === "darlehen" ? ["em.darl"] : f.part === "erbe" ? ["em.erbe"] : [];
    case "kaufpreis":
      return ["fin.kaufpreis"];
    case "bestehende_hypothek_betrag":
      return ["fin.old"];
    case "mietzins_rendite":
      return ["fin.miete"];
    case "objekt_adresse":
      return ["txt.plz", "txt.ort"];
    case "verpflichtungen":
      return f.part === "leasing" ? ["ans.leasing"] : f.part === "kredit" ? ["ans.kredite"] : f.part === "unterhalt" ? ["ans.unterhalt"] : [];
    default:
      return [];
  }
}

/** `source` of one field: a document's value taken over wins, then the chat, then a document prefill. */
export function fieldSource(
  f: Pick<AbgleichField, "key" | "part" | "funnelValue" | "customerChoice"> & { borrower?: number },
  marks: { chat?: readonly string[]; src?: Sources | null } = {}
): FieldSource {
  if (f.funnelValue === null || f.funnelValue === undefined || f.funnelValue === "") return "dokument";
  if (f.customerChoice?.chosenSource === "document") return "dokument";
  const paths = fieldPaths(f);
  if (!paths.length) return "funnel";
  if (marks.chat?.length && paths.some((p) => marks.chat!.includes(p))) return "chat";
  const src = (marks.src ?? {}) as Record<string, unknown>;
  // Every part of the value prefilled from a document and left as it was (an edit drops the mark).
  const set = paths.filter((p) => f.key !== "eigenmittel_total" || p in src);
  if (set.length && set.every((p) => !!src[p])) return "dokument";
  return "funnel";
}

/** The Auskunftsermächtigung's signature as a field of the JSON (key `unterschrift_auskunftsermaechtigung`). */
export interface SignatureField {
  docId: string | null;
  /** The AI's reading of «Unterschrift» («vorhanden», «fehlt»), or what it found instead. */
  value: string;
  confidence: number | null;
  /** True when the AI doubts the copy (no signature, another name, another form). */
  uncertain: boolean;
  /** signatureReviewNote in the four languages, when uncertain. */
  note?: Texts4;
}

export const SIGNATURE_FIELD_KEY = "unterschrift_auskunftsermaechtigung";

export interface AbgleichStateJson {
  version: number;
  submittedAt: string;
  funnelPath: "schnellanmeldung" | "begleitete_anmeldung";
  /** Started in HYPO, the chat (DECISIONS V92); absent otherwise. */
  entry_channel?: "chat";
  submittedBy: "kunde" | "berater";
  rulesFrom: "salesforce" | "fallback";
  fields: {
    key: string;
    part?: string;
    borrower?: number;
    person?: string;
    label: Texts4;
    funnelValue: number | string | null;
    source: FieldSource;
    extracted: { docType: string; docId: string; value: number | string; confidence: number; sourceRef: string | null; role: "primary" | "secondary"; ampel: string; field: string }[];
    result: AbgleichField["result"];
    customerChoice?: CustomerChoice;
    explanation?: Texts4;
  }[];
  summary: { ok: number; hint: number; conflict: number; identityConflict: number; toCheck: number; unverified: number };
  documents: AbgleichDocument[];
  /** The funnel's plausibility notes on the amounts (03.11. Befunde 4, 5; never blocking); absent when none. */
  plausibility?: { feld: string; code: string; hinweis: string }[];
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
  channel?: "chat" | null;
  role: "kunde" | "berater" | null | undefined;
  rulesFrom: "salesforce" | "fallback";
  /** Borrower ids in order (Kreditnehmer 1, 2). */
  borrowerIds: string[];
  reuploads?: AbgleichStateJson["reuploads"];
  /** The field paths answered in HYPO and the document prefill marks (`source`). */
  marks?: { chat?: readonly string[]; src?: Sources | null };
  /** The case's documents (`documents[]`); [] when not given. */
  documents?: AbgleichDocument[];
  /** The Auskunftsermächtigung's copy as the AI read it; absent while there is none. */
  signature?: SignatureField | null;
  /** Plausibility notes, German (lib/funnel-v3/plausibility.ts). */
  plausibility?: { feld: string; code: string; hinweis: string }[];
}

export function buildAbgleichState(input: AbgleichStateInput): AbgleichStateJson {
  const fields: AbgleichStateJson["fields"] = input.result.fields.map((f) => {
    const idx = f.borrowerId ? input.borrowerIds.indexOf(f.borrowerId) : -1;
    const borrower = idx >= 0 ? idx + 1 : undefined;
    return {
      key: f.key,
      ...(f.part ? { part: f.part } : {}),
      ...(borrower ? { borrower } : {}),
      ...(f.person ? { person: f.person } : {}),
      label: fieldLabel(f),
      // 6.2: «der gewählte Wert ist zugleich der übermittelte Funnel-Wert» — the value submitted;
      // what the customer had typed before taking a document value stays in customerChoice.original.
      funnelValue: f.funnelValue,
      source: fieldSource({ ...f, borrower }, input.marks),
      extracted: f.extracted.map((e) => ({ docType: e.docType, docId: e.docId, value: e.value, confidence: e.confidence, sourceRef: e.sourceRef, role: e.role, ampel: e.ampel, field: e.field })),
      result: f.result,
      ...(f.customerChoice ? { customerChoice: f.customerChoice } : {}),
      ...(f.explanationKey && (f.result !== "ok" || f.customerChoice) ? { explanation: all(f.explanationKey) } : {}),
    };
  });
  const summary = { ...input.result.summary };
  const sig = input.signature;
  if (sig) {
    // A field with no funnel answer, read from the copy on P0: «ok», or «to_check» when the AI doubts it.
    fields.push({
      key: SIGNATURE_FIELD_KEY,
      label: all("abg.label.unterschrift_auskunftsermaechtigung"),
      funnelValue: null,
      source: "dokument",
      extracted: sig.docId
        ? [{ docType: "auskunftsermaechtigung", docId: sig.docId, value: sig.value, confidence: sig.confidence ?? 0, sourceRef: null, role: "primary", ampel: sig.uncertain ? "yellow" : "green", field: "Unterschrift" }]
        : [],
      result: sig.uncertain ? "to_check" : "ok",
      ...(sig.uncertain && sig.note ? { explanation: sig.note } : {}),
    });
    if (sig.uncertain) summary.toCheck += 1;
    else summary.ok += 1;
  }
  return {
    version: ABGLEICH_STATE_VERSION,
    submittedAt: input.submittedAt.toISOString(),
    funnelPath: input.mode === "schnell" ? "schnellanmeldung" : "begleitete_anmeldung",
    ...(input.channel === "chat" ? { entry_channel: "chat" as const } : {}),
    submittedBy: input.role === "berater" ? "berater" : "kunde",
    rulesFrom: input.rulesFrom,
    fields,
    summary,
    documents: input.documents ?? [],
    ...(input.plausibility?.length ? { plausibility: input.plausibility } : {}),
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
