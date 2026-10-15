/**
 * What the documents fill in (Handover 3, 3.1). Pure: analysed files and the current answers in,
 * the values each document provides out — with their source mark — plus the facts for the mail
 * and Salesforce (`info`) and the 4.2 facts (facts.ts).
 *
 *   Dokument                    Funnel-Feld                                   Zusätzlich (info)
 *   ID                          Anrede, Vorname, Nachname, Kreditnehmer = nat. Geburtsdatum, Nationalität, ab 50
 *   Grundbuchauszug             PLZ, Ort, Art der Immobilie = bestehend,      Objektadresse, Wertquote,
 *                               Baurecht                                      Grundpfandrechte
 *   STWE-Reglement / EF         Art der Liegenschaft = STWE                   Saldo Erneuerungsfonds
 *   Zinsabrechnung              Kreditantrag = Ablösung, bestehende Hypothek  Bank, Zins, Laufzeit, Ablösedatum
 *   Kaufvertrag                 Kreditantrag = Neue Hypothek, Kaufpreis, Kaufdatum
 *   Lohnausweis                 Beschäftigung = angestellt, Bruttoeinkommen   Arbeitgeber
 *   Lohnabrechnungen            –                                             Bonus, Lohnerhöhung (4.2)
 *   Steuererklärung             Nutzung = selbstbewohnt (unsicher, Eigenmietwert)  Zivilstand, Kinder
 *   Verkaufsdokumentation       Objektwert (unsicher)                         Baujahr, Zimmer, Heizungsart
 *   Gebäudeversicherung         –                                             Baujahr, Kubatur, Versicherungssumme
 *   Unterhalt / Kredit / Leasing  Chip Unterhalt / Privatkredit / Leasing     Betrag, Rate, Restschuld
 *   3a-Police / -Bescheinigung  Säule 3a (Rückkaufswert)                      Verpfändung
 *   PK-Ausweis                  –                                             Altersguthaben, Vorbezug möglich
 *   Handelsregisterauszug       Firma, zeichnungsberechtigte Person           UID, Sitz
 *
 * Rules (Handover 3):
 *  - a value is marked unsure («aus Dokument · bitte prüfen») below PREFILL_CONFIDENCE
 *    (DECISIONS V7), and always where the table says «unsicher»;
 *  - a missing document leaves its question empty — nothing is guessed: when two documents
 *    give one field different values, the field is left empty too;
 *  - a touched field is never in the result (the store checks again);
 *  - only the Schnellanmeldung applies the values (store.ts applyPrefill); the Begleitete
 *    Anmeldung turns contradictions into suggestions (requirementStatus.ts answerCorrections,
 *    with `correctionValues` below). `info` is applied in both.
 */

import type { FileEntry, V3Analysis } from "./files";
import {
  docFacts,
  amountOf,
  belongsTo,
  dateOf,
  fieldText,
  salaryYear,
  annualSalary,
  yesNoOf,
  type AnalysedFile,
  type DocFacts,
  type People,
} from "./facts";
import { borrowerRef, splitFullName, type PersonRef } from "./requirements";
import type { Answers, DocInfo, DocInfoText, FieldPath, FunnelState, SourceMark, Sources } from "./types";
import { docYear } from "@/components/documentIntelligence/v3/catalogue";

/** Below this confidence a prefilled value is «aus Dokument · bitte prüfen» (Handover 3, DECISIONS V7). */
export const PREFILL_CONFIDENCE = 0.9;

export type PrefillValue = string | number;

export interface PrefillResult {
  /** The value each field gets from the documents (touched fields left out). */
  values: Partial<Record<FieldPath, PrefillValue>>;
  /** The source of each value in `values`. */
  src: Sources;
  /** Facts for the mail and Salesforce, and the 4.2 flags. */
  info: DocInfo;
  /** The 4.2 comparison in detail. */
  facts: DocFacts;
}

export type PrefillState = Pick<FunnelState, "ans" | "txt" | "borrowers"> & Partial<Pick<FunnelState, "touched">>;

/** The analysed files of the store (done, with a recognised type). */
export function analysedFiles(files: readonly FileEntry[]): AnalysedFile[] {
  return files
    .filter((f) => f.uploadState !== "failed" && f.analysisState === "done" && f.analysis?.status === "done" && f.analysis.docTypeId)
    .map((f) => ({ fileId: f.id, analysis: f.analysis! }));
}

// ---- Who is who ----------------------------------------------------------------------------

const titleCase = (s: string) => (s && s === s.toUpperCase() && /[A-ZÄÖÜ]/.test(s) ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m) => m.toUpperCase()) : s);

/** The person an ID shows: fields «Vornamen» / «Name», else the printed «Nachname Vorname». */
function idPerson(a: V3Analysis): { first: string; last: string } | null {
  const last = titleCase(fieldText(a, "Name"));
  const first = titleCase(fieldText(a, "Vornamen"));
  if (last) return { first, last };
  const parts = (a.personName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? { last: titleCase(parts[0]), first: titleCase(parts.slice(1).join(" ")) } : null;
}

const ref = (p: { first: string; last: string }, kind: PersonRef["kind"] = "borrower"): PersonRef => ({
  kind,
  first: p.first,
  last: p.last,
  display: [p.first, p.last].filter(Boolean).join(" "),
});

/**
 * Kreditnehmer 1 as far as known: the name entered (or prefilled) — else, when the IDs show
 * exactly one person who is neither the Solidarbürge nor the signatory, that person.
 */
export function peopleOf(state: PrefillState, files: AnalysedFile[]): People {
  const others: PersonRef[] = [];
  const g = splitFullName(state.txt.buergeName || "");
  if (g.last) others.push(ref(g, "guarantor"));
  const z = splitFullName(state.txt.zeichner || "");
  if (state.ans.kn === "Juristische Person" && z.last) others.push(ref(z, "signatory"));
  if (state.ans.kn === "Juristische Person") return { others };

  const b0 = state.borrowers[0];
  const kn1Name = { first: (state.txt.vor || b0?.vor || "").trim(), last: (state.txt.nach || b0?.nach || "").trim() };
  const b1 = state.borrowers[1];
  const kn2 = b1 && b1.nach.trim() ? borrowerRef(b1) : undefined;
  if (kn1Name.last) return { kn1: { ...ref(kn1Name), borrowerId: b0?.id }, kn2, others };

  const persons: PersonRef[] = [];
  for (const f of files) {
    if (f.analysis.docTypeId !== "id") continue;
    const p = idPerson(f.analysis);
    if (!p) continue;
    const r = ref(p);
    if (others.some((o) => belongsTo(f.analysis, o, []))) continue;
    if (kn2 && belongsTo(f.analysis, kn2, [])) continue;
    if (!persons.some((x) => x.last.toLowerCase() === r.last.toLowerCase() && x.first.split(" ")[0]?.toLowerCase() === r.first.split(" ")[0]?.toLowerCase())) persons.push(r);
  }
  return { kn1: persons.length === 1 ? persons[0] : undefined, kn2, others };
}

// ---- Candidates ----------------------------------------------------------------------------

interface Candidate {
  path: FieldPath;
  value: PrefillValue;
  confidence: number;
  unsure: boolean;
  docType: string;
  doc: string;
  fileId: string;
}

/** German name of the source document (mail, Salesforce `sources`): «Lohnausweis 2025». */
export function sourceLabelDe(a: V3Analysis): string {
  const year = a.docTypeId === "lohnausweise" ? salaryYear(a) : docYear(a.docDate);
  switch (a.docTypeId) {
    case "id":
      return "ID";
    case "grundbuch":
      return "Grundbuchauszug";
    case "stwe_regl":
      return "STWE-Reglement";
    case "ef":
      return "Erneuerungsfonds";
    case "stwe_plan":
      return "Grundrisspläne";
    case "hyp_zins":
      return "Zinsabrechnung";
    case "produkt":
      return "Produktvereinbarung";
    case "kaufvertrag":
      return "Kaufvertrag";
    case "lohnausweise":
      return year ? `Lohnausweis ${year}` : "Lohnausweis";
    case "lohnabrechnungen":
      return "Lohnabrechnungen";
    case "steuer":
      return year ? `Steuererklärung ${year}` : "Steuererklärung";
    case "verkaufsdoku":
      return year ? `Verkaufsdokumentation ${year}` : "Verkaufsdokumentation";
    case "gvz":
      return "Gebäudeversicherung";
    case "unterhalt":
      return "Unterhaltsvereinbarung";
    case "kredit":
      return ["Kreditvertrag", fieldText(a, "Kreditgeber")].filter(Boolean).join(" ");
    case "leasing":
      return ["Leasingvertrag", fieldText(a, "Leasinggeber")].filter(Boolean).join(" ");
    case "police":
      return "3a-Police";
    case "s3a":
      return "3a-Bescheinigung";
    case "pk":
      return "PK-Ausweis";
    case "hr":
      return "Handelsregisterauszug";
    default:
      return a.docTypeLabel || a.docTypeId || "Dokument";
  }
}

/** The newest file of a list (document date, then confidence). */
function newest(list: AnalysedFile[], key: (a: V3Analysis) => string = (a) => a.docDate || ""): AnalysedFile | undefined {
  return [...list].sort((x, y) => key(y.analysis).localeCompare(key(x.analysis)) || (y.analysis.confidence || 0) - (x.analysis.confidence || 0))[0];
}

/**
 * The values the documents provide, then the facts. Returns the candidates per field (several
 * when documents disagree) and `info`.
 */
function collect(files: AnalysedFile[], state: PrefillState, people: People, now: Date): { candidates: Candidate[]; info: DocInfo; facts: DocFacts } {
  const out: Candidate[] = [];
  const info: DocInfo = {};
  const setInfo = (k: DocInfoText, v: string) => {
    if (v && !info[k]) info[k] = v;
  };
  const byType = (id: string) => files.filter((f) => f.analysis.docTypeId === id);
  const field = (f: AnalysedFile, key: string) => fieldText(f.analysis, key);
  const conf = (f: AnalysedFile, key?: string) => (key ? f.analysis.fields?.[key]?.confidence ?? 0 : f.analysis.confidence || 0);
  const add = (f: AnalysedFile, path: FieldPath, value: PrefillValue | null | undefined, confidence: number, unsure = false) => {
    if (value === null || value === undefined || value === "" || value === 0) return;
    out.push({
      path,
      value,
      confidence,
      unsure: unsure || confidence < PREFILL_CONFIDENCE,
      docType: f.analysis.docTypeId!,
      doc: sourceLabelDe(f.analysis),
      fileId: f.fileId,
    });
  };
  const np = state.ans.kn !== "Juristische Person";
  const kn1Docs = (list: AnalysedFile[]) => list.filter((f) => belongsTo(f.analysis, people.kn1, [people.kn2, ...people.others]));
  const kn2Docs = (list: AnalysedFile[]) => (people.kn2 ? list.filter((f) => belongsTo(f.analysis, people.kn2, [people.kn1, ...people.others])) : []);
  const hasHr = byType("hr").length > 0;

  // ID — Kreditnehmer 1 (with a Handelsregisterauszug the ID is the signatory's: Handover 3.1
  // names the borrower type only for the ID, the HR extract then decides).
  if (np) {
    const ids = kn1Docs(byType("id"));
    const id = ids.length === 1 ? ids[0] : undefined;
    if (id && !hasHr) {
      const p = idPerson(id.analysis);
      if (p) {
        add(id, "txt.vor", p.first, conf(id, "Vornamen"));
        add(id, "txt.nach", p.last, conf(id, "Name"));
      }
      const sex = field(id, "Geschlecht").toUpperCase();
      add(id, "ans.anrede", sex.startsWith("M") ? "Herr" : sex.startsWith("F") || sex.startsWith("W") ? "Frau" : null, conf(id, "Geschlecht"));
      add(id, "ans.kn", "Natürliche Person", conf(id));
      setInfo("geb", dateOf(field(id, "Geburtsdatum")));
      setInfo("nat", field(id, "Nationalität"));
    }
  }

  // Grundbuchauszug
  const gb = newest(byType("grundbuch"));
  if (gb) {
    add(gb, "txt.plz", field(gb, "PLZ").match(/\b\d{4}\b/)?.[0], conf(gb, "PLZ"));
    add(gb, "txt.ort", field(gb, "Ort"), conf(gb, "Ort"));
    add(gb, "ans.immo", "Bestehende Immobilie", conf(gb));
    const br = yesNoOf(field(gb, "Baurecht"));
    add(gb, "ans.baurecht", br === null ? null : br ? "Ja" : "Nein", conf(gb, "Baurecht"));
    const street = field(gb, "Adresse");
    const place = [field(gb, "PLZ"), field(gb, "Ort")].filter(Boolean).join(" ");
    setInfo("adresse", street && place && !street.includes(place) ? `${street}, ${place}` : street);
    setInfo("wertquote", field(gb, "Wertquote"));
    setInfo("grundpfand", field(gb, "Grundpfandrechte"));
  }

  // STWE-Reglement / Erneuerungsfonds
  for (const id of ["stwe_regl", "ef"]) {
    const f = newest(byType(id));
    if (f) add(f, "ans.lieg", "Stockwerkeigentum", conf(f));
  }
  const ef = newest(byType("ef"));
  if (ef) setInfo("efSaldo", field(ef, "Saldo per 31.12.2025"));

  // Zinsabrechnung (and, for the facts only, the Produktvereinbarung)
  const zins = newest(byType("hyp_zins"));
  if (zins) {
    add(zins, "ans.antrag", "Ablösung", conf(zins));
    add(zins, "fin.old", amountOf(field(zins, "Kapital")), conf(zins, "Kapital"));
  }
  for (const f of [zins, newest(byType("produkt"))]) {
    if (!f) continue;
    setInfo("bank", (f.analysis.bank || field(f, "Bank")).trim());
    setInfo("zins", field(f, "Zinssatz"));
    setInfo("laufzeit", field(f, "Laufzeit"));
    setInfo("abl", dateOf(field(f, "Ablösedatum")) || field(f, "Ablösedatum"));
  }

  // Kaufvertrag
  const kv = newest(byType("kaufvertrag"));
  if (kv) {
    add(kv, "ans.antrag", "Neue Hypothek", conf(kv));
    add(kv, "fin.kaufpreis", amountOf(field(kv, "Kaufpreis")), conf(kv, "Kaufpreis"));
    const transfer = dateOf(field(kv, "Eigentumsübertragung"));
    add(kv, "txt.kaufdatum", transfer || dateOf(field(kv, "Datum")), transfer ? conf(kv, "Eigentumsübertragung") : conf(kv, "Datum"));
  }

  // Lohnausweis — Kreditnehmer 1 (and the income of a named Kreditnehmer 2)
  if (np) {
    const yearKey = (a: V3Analysis) => String(salaryYear(a) ?? "");
    const la = newest(kn1Docs(byType("lohnausweise")), yearKey);
    if (la) {
      add(la, "borrower.0.job", "Angestellt", conf(la));
      add(la, "fin.inc", annualSalary(la.analysis), conf(la, "Bruttolohn") || conf(la));
      setInfo("ag", field(la, "Arbeitgeber"));
    }
    const la2 = newest(kn2Docs(byType("lohnausweise")), yearKey);
    if (la2) add(la2, "fin.inc2", annualSalary(la2.analysis), conf(la2, "Bruttolohn") || conf(la2));
  }

  // Steuererklärung — Kreditnehmer 1
  if (np) {
    const st = newest(kn1Docs(byType("steuer")));
    if (st) {
      if (amountOf(field(st, "Eigenmietwert")) > 0) add(st, "ans.nutz", "Selbstbewohnt", conf(st, "Eigenmietwert"), true);
      setInfo("zivil", field(st, "Zivilstand"));
      setInfo("kinder", field(st, "Kinder"));
    }
  }

  // Objekt facts: the insurance first (official), then the sales documentation, then the plans.
  const gvz = newest(byType("gvz"));
  if (gvz) {
    setInfo("baujahr", field(gvz, "Erstellungsjahr"));
    setInfo("kubatur", field(gvz, "Volumen"));
    setInfo("versSumme", field(gvz, "Versicherungssumme"));
  }
  const vd = newest(byType("verkaufsdoku"));
  if (vd) {
    // Analyses stored before v5 read «Verkaufspreis 2024».
    const price = amountOf(field(vd, "Verkaufspreis")) || amountOf(field(vd, "Verkaufspreis 2024"));
    add(vd, "fin.val", price, conf(vd, field(vd, "Verkaufspreis") ? "Verkaufspreis" : "Verkaufspreis 2024"), true);
    setInfo("baujahr", field(vd, "Baujahr"));
    setInfo("zimmer", field(vd, "Zimmer"));
    setInfo("heizung", field(vd, "Heizung"));
    setInfo("wohnflaeche", field(vd, "Wohnfläche"));
  }
  const plan = newest(byType("stwe_plan"));
  if (plan) setInfo("wohnflaeche", field(plan, "Nettowohnfläche"));

  // Unterhalt / Kredit / Leasing — the chips
  const uh = newest(byType("unterhalt"));
  if (uh && np) {
    add(uh, "ans.unterhalt", "Ja", conf(uh));
    setInfo("unterhaltBetrag", field(uh, "Unterhaltsbeitrag"));
  }
  const kr = newest(byType("kredit"));
  if (kr) {
    add(kr, "ans.kredite", "Ja", conf(kr));
    setInfo("kreditRest", field(kr, "Restschuld"));
    setInfo("kreditRate", field(kr, "Monatsrate"));
  }
  const le = newest(byType("leasing"));
  if (le) {
    add(le, "ans.leasing", "Ja", conf(le));
    setInfo("leasingRate", field(le, "Leasingrate"));
    setInfo("leasingRest", field(le, "Restlaufzeit"));
  }

  // Säule 3a — the policy's Rückkaufswert, else the account's Guthaben (one value: the policy
  // and its Wertmitteilung, or the certificate of the same policy, are not added up).
  const s3a = s3aSource(files);
  if (s3a) add(s3a.file, "em.s3a", s3a.amount, s3a.confidence);
  const pledge = [newest(byType("s3a")), newest(byType("police"))].map((f) => (f ? field(f, f.analysis.docTypeId === "s3a" ? "Verpfändung" : "Begünstigte Bank") : "")).find(Boolean);
  if (pledge) setInfo("s3aPledge", pledge);

  // PK-Ausweis — Kreditnehmer 1
  const pk = newest(kn1Docs(byType("pk")));
  if (pk) {
    setInfo("pk", field(pk, "Altersguthaben"));
    setInfo("pkVorbezug", field(pk, "Vorbezug für Wohneigentum möglich"));
  }

  // Handelsregisterauszug
  const hr = newest(byType("hr"));
  if (hr) {
    add(hr, "ans.kn", "Juristische Person", conf(hr), true);
    add(hr, "txt.firma", field(hr, "Firma"), conf(hr, "Firma"));
    // The extract lists every signatory; the first one, to be checked.
    const first = field(hr, "Zeichnungsberechtigte").split(/[,;(\n]/)[0]?.trim();
    add(hr, "txt.zeichner", first, conf(hr, "Zeichnungsberechtigte"), true);
    setInfo("uid", field(hr, "UID"));
    setInfo("sitz", field(hr, "Sitz"));
  }

  const facts = docFacts(files, people, now);
  info.bonus = facts.bonus;
  info.raise = facts.raise;
  info.ab50 = facts.ab50;
  return { candidates: out, info, facts };
}

/** The Säule 3a value of the documents: policy Rückkaufswert first, else the 3a Guthaben. */
function s3aSource(files: AnalysedFile[]): { file: AnalysedFile; amount: number; confidence: number } | null {
  const pick = (typeId: string, keys: (a: V3Analysis) => string[]) => {
    const list = files
      .filter((f) => f.analysis.docTypeId === typeId)
      .map((f) => {
        const key = keys(f.analysis).find((k) => amountOf(fieldText(f.analysis, k)) > 0);
        return key ? { file: f, amount: amountOf(fieldText(f.analysis, key)), confidence: f.analysis.fields[key]?.confidence ?? 0 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => (y.file.analysis.docDate || "").localeCompare(x.file.analysis.docDate || ""));
    return list[0] ?? null;
  };
  // Analyses stored before v5 read «Rückkaufswert per 09.01.2026».
  const legacyKeys = (a: V3Analysis) => ["Rückkaufswert", ...Object.keys(a.fields || {}).filter((k) => k.startsWith("Rückkaufswert per"))];
  return pick("police", legacyKeys) ?? pick("s3a", () => ["Guthaben"]);
}

/** Values a guided-mode suggestion can carry (requirementStatus.ts answerCorrections). */
export function correctionValues(files: AnalysedFile[]): { s3a?: number } {
  const s = s3aSource(files);
  return s ? { s3a: s.amount } : {};
}

/**
 * Handover 3.1 from the analysed files: the value per field, its mark, `info` and the facts.
 * `now` is the day «ab 50» is judged at.
 */
export function prefillFromDocuments(files: AnalysedFile[], state: PrefillState, opts: { now?: Date } = {}): PrefillResult {
  const now = opts.now ?? new Date();
  const people = peopleOf(state, files);
  const { candidates, info, facts } = collect(files, state, people, now);
  const touched = state.touched ?? {};

  const values: PrefillResult["values"] = {};
  const src: Sources = {};
  const byPath = new Map<FieldPath, Candidate[]>();
  for (const c of candidates) byPath.set(c.path, [...(byPath.get(c.path) ?? []), c]);
  for (const [path, list] of byPath) {
    if (touched[path]) continue;
    // Documents that disagree: nothing is guessed.
    if (new Set(list.map((c) => String(c.value))).size > 1) continue;
    const best = [...list].sort((x, y) => y.confidence - x.confidence)[0];
    values[path] = best.value;
    const mark: SourceMark = { doc: best.doc, unsure: list.every((c) => c.unsure), docType: best.docType, fileId: best.fileId };
    src[path] = mark;
  }
  return { values, src, info, facts };
}

/** «N Angaben aus deinen Unterlagen vorausgefüllt» (Handover 3). */
export function prefilledCount(src: Sources): number {
  return Object.keys(src).length;
}

/** The answer a source mark belongs to, for the rail «Deine Anfrage füllt sich»: path → current value. */
export function prefilledValue(state: Pick<FunnelState, "ans" | "txt" | "fin" | "em" | "borrowers">, path: FieldPath): PrefillValue | undefined {
  const [group, key, sub] = path.split(".");
  if (group === "ans") return state.ans[key as keyof Answers] as PrefillValue | undefined;
  if (group === "txt") return state.txt[key as keyof typeof state.txt];
  if (group === "fin") return state.fin[key as keyof typeof state.fin];
  if (group === "em") return state.em[key as keyof typeof state.em];
  if (group === "borrower") return (state.borrowers[Number(key)] as unknown as Record<string, PrefillValue | undefined> | undefined)?.[sub];
  return undefined;
}
