/**
 * Rules from the document analysis that need no question (Handover 4.2). Pure.
 *
 *   Bonus          Jahreslohn Lohnausweis > Monatslohn (Lohnabrechnung) × 12 bzw. × 13 + 5 %
 *                  → P5 «Lohnausweise der zwei Vorjahre», reason «variabler Lohnanteil erkannt»
 *   Lohnerhöhung   aktueller Monatslohn × 12 bzw. × 13 > Jahreslohn Vorjahres-Lohnausweis + 5 %
 *                  → P6 «Anstellungsvertrag», reason «Lohnerhöhung erkannt»
 *   Ab 50          Geburtsdatum (ID) → Alter ≥ 50 at today → P10 and E2/E3
 *
 * Fall Gerber: Lohnausweis 2025 CHF 125'385 vs. 13 × CHF 9'615 = CHF 124'995 → +0.3 %: neither.
 *
 * The threshold is one constant (DECISIONS V2). Whether a 13th salary is paid is read from the
 * payslips; when they do not say, each rule takes the reading that does NOT add a document
 * (bonus × 13, raise × 12 — DECISIONS V14): «Es wird nichts geraten».
 *
 * The salary rules read Kreditnehmer 1's Lohnausweis and payslips (P17 asks neither P5 nor P6
 * for Kreditnehmer 2); «ab 50» any Kreditnehmer's ID. Whose a document is comes from the
 * printed name (placeFile.ts personScore), never from where it was placed — placement itself
 * depends on these facts.
 */

import type { V3Analysis } from "./files";
import { parseAmount } from "./format";
import type { PersonRef } from "./requirements";
import { personScore } from "./placeFile";
import { docYear } from "@/components/documentIntelligence/v3/catalogue";

/** Handover 4.2 «+ 5 %» (DECISIONS V2: a proposal, Marco confirms). */
export const SALARY_THRESHOLD = 0.05;
/** Handover 4.2 «Alter ≥ 50». */
export const AGE_THRESHOLD = 50;

/** One analysed file (V3Analysis with status «done» and a type). */
export interface AnalysedFile {
  fileId: string;
  analysis: V3Analysis;
}

/** Who is who, for telling documents apart by the printed name. */
export interface People {
  /** Kreditnehmer 1 (undefined while the name is unknown). */
  kn1?: PersonRef;
  /** Kreditnehmer 2, when added and named. */
  kn2?: PersonRef;
  /** Solidarbürge, zeichnungsberechtigte Person — their documents never count for a Kreditnehmer. */
  others: PersonRef[];
}

export interface SalaryComparison {
  /** Year of the Lohnausweis compared. */
  year: number | null;
  /** Jahreslohn (Bruttolohn) of that Lohnausweis. */
  annual: number;
  /** Monatslohn brutto of the most recent payslip. */
  monthly: number;
  /** Whether the payslips say a 13th salary is paid; null when they do not say. */
  thirteenth: boolean | null;
  /** annual / (monthly × 12|13) − 1, as used for «Bonus». */
  bonusDelta: number;
  /** (monthly × 12|13) / annual − 1, as used for «Lohnerhöhung». */
  raiseDelta: number;
}

export interface DocFacts {
  bonus: boolean;
  raise: boolean;
  ab50: boolean;
  /** What was compared (internal view, tests); absent when Lohnausweis or payslip is missing. */
  salary?: SalaryComparison;
  /** Age of the oldest Kreditnehmer whose ID was read. */
  age?: number;
}

// ---- Reading values ----------------------------------------------------------------------

const DATE_RE = /\b\d{1,2}\.\d{1,2}\.\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * The amount in a field as printed: «CHF 125'385», «9'615.–», «CHF 10'340 per 09.01.2026»
 * (the date is not part of it). 0 when there is none.
 */
export function amountOf(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0;
  const s = String(v ?? "").replace(DATE_RE, " ");
  const m = s.match(/\d{1,3}(?:['’ ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
  return m ? parseAmount(m[0]) : 0;
}

/** «4.1.1988», «04.01.1988», «1988-01-04» → «04.01.1988»; nothing readable → "". */
export function dateOf(v: string | number | null | undefined): string {
  const s = String(v ?? "").trim();
  const dmy = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, "0")}.${dmy[2].padStart(2, "0")}.${dmy[3]}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return "";
}

/** Completed years at `now` of a person born on `birth` («TT.MM.JJJJ»); null when unreadable. */
export function ageAt(birth: string, now: Date): number | null {
  const m = dateOf(birth).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** A field's value as text ("" when absent). */
export function fieldText(a: V3Analysis, key: string): string {
  const v = a.fields?.[key]?.value;
  return v === null || v === undefined ? "" : String(v).trim();
}

/** «ja» / «nein» (any case, also oui/sì/yes) → true / false; anything else → null. */
export function yesNoOf(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["ja", "yes", "oui", "sì", "si", "true", "vorhanden"].includes(s) || /^ja\b/.test(s)) return true;
  if (["nein", "no", "non", "false", "fehlt"].includes(s) || /^nein\b/.test(s)) return false;
  return null;
}

/** The year a Lohnausweis covers: field «Jahr», else its document date. */
export function salaryYear(a: V3Analysis): number | null {
  const y = Number(fieldText(a, "Jahr").match(/\b(19|20)\d{2}\b/)?.[0]);
  return Number.isFinite(y) && y > 0 ? y : docYear(a.docDate);
}

/**
 * The Jahreslohn of a Lohnausweis: «Bruttolohn», or — analyses stored before v5 — the
 * year-keyed «Bruttolohn 2025» of its own year (else the latest such key).
 */
export function annualSalary(a: V3Analysis): number {
  const direct = amountOf(fieldText(a, "Bruttolohn"));
  if (direct) return direct;
  const keyed = Object.keys(a.fields || {})
    .map((k) => ({ k, y: Number(k.match(/^Bruttolohn (\d{4})$/)?.[1]) }))
    .filter((x) => x.y > 0)
    .sort((x, y) => y.y - x.y);
  const year = salaryYear(a);
  const own = keyed.find((x) => x.y === year) ?? keyed[0];
  return own ? amountOf(fieldText(a, own.k)) : 0;
}

/** The date a payslip refers to, for «most recent»: its document date. */
const recency = (a: V3Analysis) => {
  const d = a.docDate || "";
  return d.length === 4 ? `${d}-12-31` : d;
};

// ---- Whose document ------------------------------------------------------------------------

/**
 * Does the document belong to `target`? By the printed name: it must fit the target at least
 * as well as anyone else. A document without a printed name belongs to the target only when
 * there is nobody else it could belong to; with the target unknown, when it fits nobody else.
 */
export function belongsTo(a: V3Analysis, target: PersonRef | undefined, rivals: (PersonRef | undefined)[]): boolean {
  const others = rivals.filter((r): r is PersonRef => !!r);
  if (!(a.personName || "").trim()) return others.length === 0;
  const best = Math.max(0, ...others.map((r) => personScore(a.personName, r)));
  if (!target) return best === 0;
  const own = personScore(a.personName, target);
  return own > 0 && own >= best;
}

// ---- The rules ---------------------------------------------------------------------------

const ofType = (files: AnalysedFile[], typeId: string) =>
  files.filter((f) => f.analysis.status === "done" && f.analysis.docTypeId === typeId).map((f) => f.analysis);

/**
 * Handover 4.2 from the analysed files. `now` is the day «ab 50» is judged at (today).
 */
export function docFacts(files: AnalysedFile[], people: People, now: Date = new Date()): DocFacts {
  const out: DocFacts = { bonus: false, raise: false, ab50: false };

  // ---- Bonus and Lohnerhöhung: Kreditnehmer 1's Lohnausweis against his payslips.
  const mine = (a: V3Analysis) => belongsTo(a, people.kn1, [people.kn2, ...people.others]);
  const certificates = ofType(files, "lohnausweise").filter(mine).filter((a) => annualSalary(a) > 0);
  const payslips = ofType(files, "lohnabrechnungen")
    .filter(mine)
    .filter((a) => amountOf(fieldText(a, "Monatslohn brutto")) > 0)
    .sort((x, y) => recency(y).localeCompare(recency(x)));
  if (certificates.length && payslips.length) {
    const slip = payslips[0];
    const monthly = amountOf(fieldText(slip, "Monatslohn brutto"));
    const thirteenth = payslips.map((p) => yesNoOf(fieldText(p, "13. Monatslohn"))).find((v) => v !== null) ?? null;
    const slipYear = docYear(slip.docDate);
    // The current Lohnausweis: the latest year — before the payslips' year when there is one.
    const byYear = [...certificates].sort((x, y) => (salaryYear(y) ?? 0) - (salaryYear(x) ?? 0));
    const cert = (slipYear !== null ? byYear.find((c) => (salaryYear(c) ?? 0) < slipYear) : undefined) ?? byYear[0];
    const annual = annualSalary(cert);
    const bonusBase = monthly * (thirteenth === false ? 12 : 13);
    const raiseBase = monthly * (thirteenth === true ? 13 : 12);
    const bonusDelta = annual / bonusBase - 1;
    const raiseDelta = raiseBase / annual - 1;
    out.salary = { year: salaryYear(cert), annual, monthly, thirteenth, bonusDelta, raiseDelta };
    out.bonus = bonusDelta > SALARY_THRESHOLD;
    out.raise = raiseDelta > SALARY_THRESHOLD;
  }

  // ---- Ab 50: any Kreditnehmer's ID (not the Solidarbürge's, not the signatory's).
  const borrowers = [people.kn1, people.kn2].filter((p): p is PersonRef => !!p);
  const ids = ofType(files, "id").filter((a) => {
    if (!borrowers.length) return belongsTo(a, undefined, people.others);
    return borrowers.some((b) => belongsTo(a, b, [...borrowers.filter((x) => x !== b), ...people.others]));
  });
  for (const a of ids) {
    const age = ageAt(fieldText(a, "Geburtsdatum"), now);
    if (age === null) continue;
    out.age = Math.max(out.age ?? 0, age);
    if (age >= AGE_THRESHOLD) out.ab50 = true;
  }
  return out;
}
