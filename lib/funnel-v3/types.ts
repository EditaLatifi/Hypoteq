/**
 * The funnel answer model, v5 (docs/funnel-v5/HYPOTEQ_Handover_Edita.md, chapters 1–3; the v3
 * base is docs/funnel-v3/HYPOTEQ_Funnel_Spezifikation.md, chapter 3).
 *
 * Keys and option values follow the handover and its prototype: option values are the German
 * keys of `opt.*` in HYPOTEQ_Funnel_i18n.json, whatever language the funnel is shown in. Only
 * the display is translated; rules, calculation and Salesforce read these.
 *
 * Both entries (Schnellanmeldung, Begleitete Anmeldung) share this one model (Handover 1): only
 * the order of the screens and the prefill differ.
 *
 * Questions v5 no longer asks — Kinder, ab 50, Heizungsart, the Eigenmittel yes/no questions,
 * Ferienobjekt (DECISIONS V9) — are not in this model. Inquiries stored before v5 still carry
 * them; lib/funnel-v3/legacy.ts reads those into this shape.
 *
 * This file is the contract between the funnel UI, the document rules (requirements.ts), the
 * calculation and the submit adapter. Change it deliberately.
 */

export type YesNo = "Ja" | "Nein";

export type Role = "berater" | "kunde";

/** Handover 1: Schnellanmeldung (documents first) or Begleitete Anmeldung (step by step). */
export type Mode = "begleitet" | "schnell";

export type Antrag = "Neue Hypothek" | "Ablösung";
export type Kreditnehmer = "Natürliche Person" | "Juristische Person";
export type Anrede = "Herr" | "Frau";
export type Immo = "Bestehende Immobilie" | "Neubau" | "Bauprojekt";
/** Handover 2: «Ferienobjekt» entfällt (Ferienwohnung = Nutzung Zweitwohnsitz). */
export type Liegenschaft = "Einfamilienhaus" | "Stockwerkeigentum" | "Mehrfamilienhaus";
/**
 * Handover 2: «Gewerbe» only for a juristische Person (NUTZUNG_OPTIONS). «Vermietet & teilweise
 * selbstbewohnt» for a natürliche Person (HYPOTEQ 19.10. B5) — the exact Salesforce picklist value.
 */
export type Nutzung = "Selbstbewohnt" | "Vermietet" | "Zweitwohnsitz" | "Vermietet & teilweise selbstbewohnt" | "Gewerbe";

/** HYPOTEQ 19.10. B5: the fourth Nutzung of a natürliche Person (= the Salesforce picklist value). */
export const NUTZUNG_PARTLY_RENTED = "Vermietet & teilweise selbstbewohnt" as const;
export type Job = "Angestellt" | "Selbständig" | "Pensioniert";
export type Laufzeit = "SARON" | "2 Jahre" | "3 Jahre" | "5 Jahre" | "10 Jahre" | "Mix";

/**
 * Handover 2 Schritt 2 «Nutzung»: natürliche Person Selbstbewohnt · Vermietet · Zweitwohnsitz ·
 * Vermietet & teilweise selbstbewohnt (fourth option, HYPOTEQ 19.10. B5), juristische Person
 * Vermietet · Gewerbe (bug from Rosanna's test: a company could pick «Selbstbewohnt»).
 */
export const NUTZUNG_OPTIONS: Record<Kreditnehmer, readonly Nutzung[]> = {
  "Natürliche Person": ["Selbstbewohnt", "Vermietet", "Zweitwohnsitz", NUTZUNG_PARTLY_RENTED],
  "Juristische Person": ["Vermietet", "Gewerbe"],
};

/**
 * Rented out, in full or in part (DECISIONS V58): asks the Netto-Mietertrag and the Mieterspiegel
 * (O14) — «Vermietet & teilweise selbstbewohnt» is treated like «Vermietet» there.
 */
export function isRentedNutzung(nutz: Nutzung | string | null | undefined): boolean {
  return nutz === "Vermietet" || nutz === NUTZUNG_PARTLY_RENTED;
}

/**
 * The owner lives there, in full or in part (DECISIONS V58): where a rule needs self-occupation
 * (the home address on the Auskunftsermächtigung, V33) «Vermietet & teilweise selbstbewohnt»
 * counts like «Selbstbewohnt».
 */
export function isOwnerOccupiedNutzung(nutz: Nutzung | string | null | undefined): boolean {
  return nutz === "Selbstbewohnt" || nutz === NUTZUNG_PARTLY_RENTED;
}

/**
 * Handover 2 Schritt 3 «Trifft etwas davon zu?»: one multiple-choice question in place of the
 * v3 yes/no questions. Nothing tapped = «Nein». Each chip is an answer key holding Ja / Nein,
 * so the document rules read them like any other answer. Display order of the prototype.
 */
export const CHIPS = ["unterhalt", "kredite", "leasing", "buerge", "baurecht", "angebote", "steuer"] as const;
export type Chip = (typeof CHIPS)[number];

/** The chips a borrower type is offered: «Unterhaltszahlungen» only for a natürliche Person. */
export function chipsFor(kn: Kreditnehmer): readonly Chip[] {
  return kn === "Juristische Person" ? CHIPS.filter((c) => c !== "unterhalt") : CHIPS;
}

/** Questions with a fixed set of answers. Unanswered choice questions are `undefined`. */
export interface Answers {
  // Schritt 1 · Anfrage
  antrag?: Antrag;
  kn: Kreditnehmer;
  /** Natürliche Person only (a company has none). */
  anrede?: Anrede;
  // Schritt 2 · Objekt & Finanzierung
  immo?: Immo;
  /** «GB-Auszug und GVZ-Police vorhanden?» — only Neubau. */
  nbDocs: YesNo;
  lieg?: Liegenschaft;
  nutz?: Nutzung;
  /** Ablösung: «Soll die Hypothek erhöht werden?» */
  aufstockung: YesNo;
  /** Neue Hypothek: «Renovationen oder Mehrausgaben zum Kaufpreis?» */
  reno: YesNo;
  /** Neue Hypothek: «Ist die Liegenschaft bereits reserviert?» */
  reserviert: YesNo;
  /** «Weitere Angaben (optional)». */
  laufzeit?: Laufzeit;
  // Schritt 3 · Personen — the chips (CHIPS)
  /** Unterhaltszahlungen (natürliche Person). */
  unterhalt: YesNo;
  /** Privatkredit. */
  kredite: YesNo;
  leasing: YesNo;
  /** Solidarbürgschaft. */
  buerge: YesNo;
  /** Liegenschaft im Baurecht. */
  baurecht: YesNo;
  /** Bestehende Finanzierungsangebote. */
  angebote: YesNo;
  /** Interesse an Steueroptimierung (triggers no document). */
  steuer: YesNo;
}

/**
 * One natural-person Kreditnehmer. `borrowers[0]` is Kreditnehmer 1, whose name is the
 * customer contact (txt.vor / txt.nach) — the store keeps the two in step. `borrowers[1]` is
 * Kreditnehmer 2 and exists only after «+ Kreditnehmer hinzufügen» (Handover 2 Schritt 3,
 * DECISIONS V8): name here, income in `fin.inc2`, documents per Handover 4.1 P17. v5 asks the
 * Beschäftigung of Kreditnehmer 1 only; a Kreditnehmer 2 without one is treated as angestellt
 * (DECISIONS D21), which is exactly the P17 list.
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
  // Customer contact (Anfrage / Kontakt)
  vor: string;
  nach: string;
  mail: string;
  /** Telefon — in both roles since v5 (Handover 2 Schritt 1). */
  tel: string;
  // Objekt & Finanzierung
  plz: string;
  ort: string;
  /** Verwendungszweck of an Erhöhung. */
  zweck: string;
  /** Kaufdatum (Neue Hypothek), as typed: «TT.MM.JJJJ» — Case.Kaufdatum__c (Handover 8). */
  kaufdatum: string;
  // Juristische Person (asked in step 1 since v5)
  /** Firma gemäss Handelsregister. */
  firma: string;
  /** Zeichnungsberechtigte Person. */
  zeichner: string;
  /** Solidarbürge: «Vorname Name». */
  buergeName: string;
  /** «Weitere Angaben»: Kommentar. */
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
  /** Renovationsbetrag (Neue Hypothek + Renovation = Ja); counts towards the Gesamtkosten. */
  renoBetrag: number;
  /** Geschätzter Objektwert. Kauf: empty = Kaufpreis (Handover 2). */
  val: number;
  /** Jährlicher Netto-Mietertrag (Nutzung = Vermietet). */
  miete: number;
  /** Bruttoeinkommen pro Jahr of Kreditnehmer 1. */
  inc: number;
  /** Bruttoeinkommen pro Jahr of Kreditnehmer 2 (only while there is one). */
  inc2: number;
}

/**
 * «Eigenmittel – Aufteilung» (Handover 2 Schritt 2): one amount per source, each asking for its
 * document (4.1 E2–E8). PK-Verpfändung is a security, not Eigenmittel (Handover 5).
 */
export interface Eigenmittel {
  /** Ersparnisse / Bankguthaben. */
  spar: number;
  /** Säule 3a. */
  s3a: number;
  /** PK-Vorbezug. */
  pkVor: number;
  /** PK-Verpfändung. */
  pkVerp: number;
  /** Schenkung. */
  schenk: number;
  /** Erbvorbezug. */
  erbe: number;
  /** Darlehen. */
  darl: number;
}

export const EM_KEYS: readonly (keyof Eigenmittel)[] = ["spar", "s3a", "pkVor", "pkVerp", "schenk", "erbe", "darl"];

/** Rows of the table: a Kauf shows all seven, an Ablösung only «Vorsorge» (Säule 3a, PK-Verpfändung). */
export const EM_ROWS: Record<Antrag, readonly (keyof Eigenmittel)[]> = {
  "Neue Hypothek": EM_KEYS,
  "Ablösung": ["s3a", "pkVerp"],
};

/**
 * A field path: `ans.<key>`, `txt.<key>`, `fin.<key>`, `em.<key>` or `borrower.<i>.<key>` —
 * the keys of `src` and `touched`, and of the Salesforce JSON `sources` (Handover 8).
 */
export type FieldPath =
  | `ans.${keyof Answers & string}`
  | `txt.${keyof Texts & string}`
  | `fin.${keyof Amounts & string}`
  | `em.${keyof Eigenmittel & string}`
  | `borrower.${number}.${"vor" | "nach" | "job" | "pkSe"}`;

/**
 * Where a prefilled value came from (Handover 3: «aus Dokument» / «aus Dokument · bitte
 * prüfen»). `doc` is the German document name for the mail and Salesforce («Lohnausweis
 * 2025»); `unsure` when the extraction's confidence is below PREFILL_CONFIDENCE (DECISIONS V7)
 * or the mapping is uncertain by nature (Steuererklärung → Nutzung, Verkaufsdoku → Objektwert).
 */
export interface SourceMark {
  doc: string;
  unsure: boolean;
  /** The recognised document type (catalogue id), so the UI can name it in its language. */
  docType?: string;
  /** The file it was read from. */
  fileId?: string;
}

export type Sources = Partial<Record<FieldPath, SourceMark>>;

/**
 * What the documents say beyond the funnel's questions (Handover 3.1 «Zusätzlich (Mail/SF)»,
 * 4.2). Values as printed; empty when no document says it. `bonus`, `raise` and `ab50` steer
 * the document list (4.2); the rest goes to the mail and Salesforce («aus Dokument»).
 */
export interface DocInfo {
  // ID
  /** Geburtsdatum (TT.MM.JJJJ). */
  geb?: string;
  /** Nationalität. */
  nat?: string;
  /** A Kreditnehmer is 50 or older at today (4.2). */
  ab50?: boolean;
  // Grundbuchauszug
  /** Objektadresse («Musterweg 1, 8000 Zürich»). */
  adresse?: string;
  wertquote?: string;
  /** Grundpfandrechte. */
  grundpfand?: string;
  // Erneuerungsfonds
  efSaldo?: string;
  // Zinsabrechnung
  /** Bestehende Bank. */
  bank?: string;
  /** Aktueller Zins («SARON 0.80 %»). */
  zins?: string;
  laufzeit?: string;
  /** Ablösedatum. */
  abl?: string;
  // Lohnausweis / Lohnabrechnungen
  /** Arbeitgeber. */
  ag?: string;
  /** Variabler Lohnanteil erkannt (4.2). */
  bonus?: boolean;
  /** Lohnerhöhung erkannt (4.2). */
  raise?: boolean;
  // Steuererklärung
  /** Zivilstand. */
  zivil?: string;
  kinder?: string;
  // Verkaufsdokumentation / Gebäudeversicherung / Pläne
  baujahr?: string;
  zimmer?: string;
  wohnflaeche?: string;
  /** Heizungsart — no longer asked (Handover 0), read from the documents. */
  heizung?: string;
  kubatur?: string;
  /** Versicherungssumme der Gebäudeversicherung. */
  versSumme?: string;
  // Unterhalt / Kredit / Leasing
  unterhaltBetrag?: string;
  kreditRest?: string;
  kreditRate?: string;
  leasingRate?: string;
  leasingRest?: string;
  // Vorsorge
  /** Verpfändung of the 3a assets (bank). */
  s3aPledge?: string;
  /** Altersguthaben (PK-Ausweis). */
  pk?: string;
  /** Vorbezug für Wohneigentum möglich (PK-Ausweis). */
  pkVorbezug?: string;
  // Handelsregisterauszug
  uid?: string;
  sitz?: string;
}

/** The DocInfo keys that hold a text (all but the three flags). */
export type DocInfoText = Exclude<keyof DocInfo, "ab50" | "bonus" | "raise">;

/**
 * HYPOTEQ Auskunftsermächtigung (Handover 6): the signed copy is uploaded (its own button, or
 * recognised in the folder), or «Später nachreichen» was chosen. `null` = neither yet.
 * Built so DocuSign can later replace the upload (`method`).
 */
export interface SignatureState {
  choice: "uploaded" | "later";
  /** ISO time of the choice. */
  at: string;
  method: "upload";
  /**
   * HYPOTEQ 19.10. E.4: «Trotzdem einreichen – HYPOTEQ prüft manuell» — the copy on P0 is submitted
   * although the AI found it unsigned, with another name or not the form. The AI never blocks;
   * its assessment travels as a note (signature.ts `signatureJson`, DECISIONS V67).
   */
  override?: true;
  /** ISO time of that choice. */
  overrideAt?: string;
}

export interface FunnelState {
  role: Role | null;
  mode: Mode;
  ans: Answers;
  borrowers: Borrower[];
  txt: Texts;
  fin: Amounts;
  em: Eigenmittel;
  /** Facts read from the documents (both modes). */
  info: DocInfo;
  /** Prefilled values and their document (Schnellanmeldung). */
  src: Sources;
  /** Fields the user changed: they lose their `src` mark and are never prefilled again. */
  touched: Partial<Record<FieldPath, true>>;
  sig: SignatureState | null;
}

/**
 * Spec principle 3: every yes/no starts on «Nein» (nothing tapped = Nein); Kreditnehmer starts
 * on Natürliche Person.
 */
export const DEFAULT_ANSWERS: Answers = {
  kn: "Natürliche Person",
  nbDocs: "Nein",
  aufstockung: "Nein",
  reno: "Nein",
  reserviert: "Nein",
  unterhalt: "Nein",
  kredite: "Nein",
  leasing: "Nein",
  buerge: "Nein",
  baurecht: "Nein",
  angebote: "Nein",
  steuer: "Nein",
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
  kaufdatum: "",
  firma: "",
  zeichner: "",
  buergeName: "",
  kommentar: "",
};

export const EMPTY_AMOUNTS: Amounts = { old: 0, up: 0, kaufpreis: 0, renoBetrag: 0, val: 0, miete: 0, inc: 0, inc2: 0 };

export const EMPTY_EM: Eigenmittel = { spar: 0, s3a: 0, pkVor: 0, pkVerp: 0, schenk: 0, erbe: 0, darl: 0 };

/** Kreditnehmer 1 and, after «+ Kreditnehmer hinzufügen», Kreditnehmer 2 (DECISIONS V8). */
export const MAX_BORROWERS = 2;
