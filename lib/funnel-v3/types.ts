/**
 * The Funnel v3 answer model (docs/funnel-v3/HYPOTEQ_Funnel_Spezifikation.md, chapter 3).
 *
 * Keys and option values follow the specification and its prototype exactly: option values
 * are the German keys of `opt.*` in HYPOTEQ_Funnel_i18n.json, whatever language the funnel is
 * shown in. Only the display is translated; rules, calculation and Salesforce read these.
 *
 * This file is the contract between the funnel UI, the document rules (requirements.ts), the
 * calculation and the submit adapter. Change it deliberately.
 */

export type YesNo = "Ja" | "Nein";

export type Role = "berater" | "kunde";

export type Antrag = "Neue Hypothek" | "Ablösung";
export type Kreditnehmer = "Natürliche Person" | "Juristische Person";
export type Anrede = "Herr" | "Frau";
export type Immo = "Bestehende Immobilie" | "Neubau" | "Bauprojekt";
export type Liegenschaft = "Einfamilienhaus" | "Stockwerkeigentum" | "Mehrfamilienhaus" | "Ferienobjekt";
export type Nutzung = "Selbstbewohnt" | "Vermietet" | "Zweitwohnsitz";
export type Heizung = "Wärmepumpe" | "Fernwärme" | "Holz / Pellets" | "Gas" | "Öl" | "Unbekannt";
export type Job = "Angestellt" | "Selbständig" | "Pensioniert";
export type Laufzeit = "SARON" | "2 Jahre" | "3 Jahre" | "5 Jahre" | "10 Jahre" | "Mix";

/** Questions with a fixed set of answers. Unanswered choice questions are `undefined`. */
export interface Answers {
  // Schritt 1
  antrag?: Antrag;
  kn: Kreditnehmer;
  anrede?: Anrede;
  // Schritt 2
  immo?: Immo;
  nbDocs: YesNo;
  lieg?: Liegenschaft;
  nutz?: Nutzung;
  heizung?: Heizung;
  baurecht: YesNo;
  aufstockung: YesNo;
  reno: YesNo;
  reserviert: YesNo;
  angebote: YesNo;
  // Schritt 3 (per case; per-borrower answers are on Borrower)
  ab50: YesNo;
  kinder: YesNo;
  unterhalt: YesNo;
  kredite: YesNo;
  leasing: YesNo;
  buerge: YesNo;
  // Schritt 4
  laufzeit?: Laufzeit;
  s3a: YesNo;
  schenkung: YesNo;
  erbe: YesNo;
  darlehen: YesNo;
  pk: YesNo;
}

/**
 * One natural-person borrower. The first one's name is the customer contact from step 1
 * (txt.vor / txt.nach) — the UI keeps the two in step. At most 3 (DECISIONS D2).
 */
export interface Borrower {
  id: string;
  vor: string;
  nach: string;
  job?: Job;
  /** «Pensionskasse vorhanden?» — only asked for Selbständig (DECISIONS D3). */
  pkSe: YesNo;
}

/** Free text. Empty string when not given. */
export interface Texts {
  // Berater entry and new-partner form
  bmail: string;
  pvor: string;
  pnach: string;
  ptel: string;
  pfirma: string;
  // Customer contact (step 1)
  vor: string;
  nach: string;
  mail: string;
  tel: string;
  // Objekt (step 2)
  plz: string;
  ort: string;
  /** Verwendungszweck of an Erhöhung. */
  zweck: string;
  // Juristische Person (step 3)
  firma: string;
  zeichner: string;
  /** Solidarbürge: «Vorname Name». */
  buergeName: string;
  // Step 4
  kommentar: string;
}

/** Amounts in CHF. 0 when not given. */
export interface Amounts {
  /** Bestehende Hypothek (Ablösung). */
  old: number;
  /** Gewünschte Erhöhung (Ablösung + Erhöhung = Ja). */
  up: number;
  /** Kaufpreis (Neue Hypothek). */
  kaufpreis: number;
  /** Bruttoeinkommen pro Jahr, Haushalt. */
  inc: number;
  /** Geschätzter Objektwert. */
  val: number;
}

export interface FunnelState {
  role: Role | null;
  ans: Answers;
  borrowers: Borrower[];
  txt: Texts;
  fin: Amounts;
}

/** Spec principle 3: every yes/no starts on «Nein»; Kreditnehmer starts on Natürliche Person. */
export const DEFAULT_ANSWERS: Answers = {
  kn: "Natürliche Person",
  nbDocs: "Nein",
  baurecht: "Nein",
  aufstockung: "Nein",
  reno: "Nein",
  reserviert: "Nein",
  angebote: "Nein",
  ab50: "Nein",
  kinder: "Nein",
  unterhalt: "Nein",
  kredite: "Nein",
  leasing: "Nein",
  buerge: "Nein",
  s3a: "Nein",
  schenkung: "Nein",
  erbe: "Nein",
  darlehen: "Nein",
  pk: "Nein",
};

export const EMPTY_TEXTS: Texts = {
  bmail: "",
  pvor: "",
  pnach: "",
  ptel: "",
  pfirma: "",
  vor: "",
  nach: "",
  mail: "",
  tel: "",
  plz: "",
  ort: "",
  zweck: "",
  firma: "",
  zeichner: "",
  buergeName: "",
  kommentar: "",
};

export const EMPTY_AMOUNTS: Amounts = { old: 0, up: 0, kaufpreis: 0, inc: 0, val: 0 };

export const MAX_BORROWERS = 3;
