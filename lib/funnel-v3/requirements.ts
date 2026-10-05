/**
 * The Funnel v3 document requirements (docs/funnel-v3/HYPOTEQ_Funnel_Spezifikation.md, chapter 4.1).
 *
 * Pure: no React, no Prisma, no network. The UI, the AI catalogue, the renaming and the
 * Salesforce sync all read the same catalogue (`REQ`) and the same rule set (`reqList`).
 *
 * Ids are the prototype's string ids (`fotos`, `grundbuch`, `hyp_zins` …) — they are also the
 * suffix of the i18n keys `doc.<id>`. `code` is the spec's number (O4, P3 …).
 *
 * Where the prototype and the spec differ, the spec wins; every such place is marked
 * «spec over prototype» below.
 */

import type { Answers, Borrower, FunnelState, Job, YesNo } from "./types";
import { tabEntriesFor } from "@/components/dokumentenCheckState";

export type ReqGroup = "objekt" | "hypothek" | "person" | "eigenmittel";

/** Spec 5.1: the folder sorts itself — 01 Person · 02 Hypothek · 03 Objekt · 04 Eigenmittel. */
export type RenameGroup = "01" | "02" | "03" | "04";

export const RENAME_GROUP: Record<ReqGroup, RenameGroup> = {
  person: "01",
  hypothek: "02",
  objekt: "03",
  eigenmittel: "04",
};

/** Display order of the groups (spec 4: Objekt · Bestehende Hypothek · Person · Eigenmittel). */
export const GROUP_ORDER: readonly ReqGroup[] = ["objekt", "hypothek", "person", "eigenmittel"];

/**
 * Whose name goes into the stored file name (spec 5.1 «Person»).
 *  - borrower: the Kreditnehmer the instance belongs to (the first one for case-level documents)
 *  - guarantor: the Solidarbürge (txt.buergeName)
 *  - signatory: the zeichnungsberechtigte Person of a company (txt.zeichner)
 *  - company: the company (txt.firma) — company documents of a juristische Person
 *  - bank: the existing lender (from the extraction, not known to reqList)
 *  - none: Objekt and Eigenmittel documents
 */
export type PersonKind = "borrower" | "guarantor" | "signatory" | "company" | "bank" | "none";

export interface RequirementDef {
  /** Prototype id; `doc.<id>` in the i18n file. Stable — stored in the DB and in Salesforce JSON. */
  id: string;
  /** Spec 4.1 number, e.g. "O4". P14–P16 are split into P14, P15, P16. */
  code: string;
  group: ReqGroup;
  /** i18n key of the label (HYPOTEQ_Funnel_i18n.json). */
  labelKey: string;
  /** German label — the Salesforce JSON and the dossier are written in German. */
  labelDe: string;
  /** Number of files that make the requirement complete (P3 = 3, E3 = 2). */
  expect: number;
  /** «Habe ich nicht» allowed; does not block `completeForSalesforce`. */
  optional: boolean;
  /** Asked once per natural-person Kreditnehmer (expanded by reqList). */
  perBorrower: boolean;
  /** The Dok_*__c checkbox on Case, spec 6.9 exactly; null for every other requirement. */
  sfDokField: string | null;
  /** Fixed German short name for the stored file name (spec 5.1 «Dokumenttyp»). */
  shortName: string;
  renameGroup: RenameGroup;
  /** Whose name goes into the stored file name. */
  personKind: PersonKind;
  /** False for identity documents: a birth date is not a document date (spec 5.1). */
  datedName: boolean;
  /**
   * The legacy funnel keys (components/funnelDocumentCatalog.ts, `funnel.*`) that mean this
   * document, so an old Inquiry.documentsMissing / Document.docType still resolves.
   * Every legacy key belongs to exactly one requirement.
   */
  legacyKeys: readonly string[];
  /** VERIFIED_TAB_ENTRIES the legacy Salesforce «Dokumenten-Check» tab ticks for it. */
  tabEntries: readonly string[];
  /** Field keys to extract (from the prototype's Gerber catalogue; empty where it had none). */
  fields: readonly string[];
  /** The spec 4.1 rule, verbatim, for documentation and the internal view. */
  rule: string;
}

type DefInput = Omit<RequirementDef, "labelKey" | "renameGroup" | "tabEntries" | "expect" | "optional" | "perBorrower" | "sfDokField" | "personKind" | "datedName" | "legacyKeys" | "fields"> &
  Partial<Pick<RequirementDef, "expect" | "optional" | "perBorrower" | "sfDokField" | "personKind" | "datedName" | "legacyKeys" | "fields">>;

function def(d: DefInput): RequirementDef {
  const legacyKeys = d.legacyKeys ?? [];
  return {
    expect: 1,
    optional: false,
    perBorrower: false,
    sfDokField: null,
    personKind: d.group === "person" ? "borrower" : d.group === "hypothek" ? "bank" : "none",
    datedName: true,
    fields: [],
    ...d,
    legacyKeys,
    labelKey: `doc.${d.id}`,
    renameGroup: RENAME_GROUP[d.group],
    tabEntries: tabEntriesFor([...legacyKeys]),
  };
}

/** The catalogue, in spec order. */
export const REQ: readonly RequirementDef[] = [
  // ---- Zum Objekt ----------------------------------------------------------------------
  def({
    id: "fotos", code: "O1", group: "objekt", labelDe: "Fotos der Immobilie (innen und aussen)",
    shortName: "Fotos", sfDokField: "Dok_Fotos_der_Immobilie__c",
    // constructionDescriptionPhotos (Baubeschrieb mit Fotos) fed the same Case flag.
    legacyKeys: ["funnel.propertyPhotosInteriorExterior", "funnel.constructionDescriptionPhotos"],
    fields: ["Objekt", "Aufnahmen", "Zustand"],
    rule: "immer, ausser Bauprojekt",
  }),
  def({
    id: "verkaufsdoku", code: "O2", group: "objekt", labelDe: "Verkaufsdokumentation",
    shortName: "Verkaufsdokumentation", optional: true,
    legacyKeys: ["funnel.salesDocPhotos", "funnel.oldSalesDocuments"],
    fields: ["Anbieter", "Objekt", "Baujahr", "Verkaufspreis 2024", "Garten", "Heizung"],
    rule: "immer, ausser Bauprojekt · «Habe ich nicht» erlaubt",
  }),
  def({
    id: "stwe_plan", code: "O3", group: "objekt", labelDe: "Bau- / Grundrisspläne inkl. Nettowohnfläche",
    shortName: "Grundrissplaene", sfDokField: "Dok_Grundrissplaene__c",
    legacyKeys: ["funnel.constructionPlansNetArea"],
    fields: ["Objekt", "Pläne", "Einheit Nr. 1"],
    rule: "immer, ausser Bauprojekt",
  }),
  def({
    id: "grundbuch", code: "O4", group: "objekt", labelDe: "Aktueller Grundbuchauszug (max. 6 Monate)",
    shortName: "Grundbuchauszug", sfDokField: "Dok_Grundbuchauszug__c",
    legacyKeys: ["funnel.landRegistryNotOlder6Months", "funnel.landRegistryIfAvailable"],
    fields: ["Grundbuch", "Eigentümer", "Objekt", "Grundpfandrechte", "Ausstellungsdatum"],
    rule: "immer · bei Neubau nur wenn nbDocs = Ja",
  }),
  def({
    id: "gvz", code: "O5", group: "objekt", labelDe: "Aktuelle Gebäudeversicherungspolice (inkl. Kubatur)",
    shortName: "Gebaeudeversicherung", sfDokField: "Dok_Gebaeudeversicherungsausweis__c",
    legacyKeys: ["funnel.buildingInsuranceIfAvailable"],
    fields: ["Versicherung", "Policen-Nr.", "Eigentümerschaft", "Versicherungssumme", "Erstellungsjahr", "Volumen"],
    rule: "immer, ausser Bauprojekt · bei Neubau nur wenn nbDocs = Ja",
  }),
  def({
    id: "kaufvertrag", code: "O6", group: "objekt", labelDe: "Kaufvertrag (Entwurf oder Original)",
    shortName: "Kaufvertrag", sfDokField: "Dok_Kaufvertrag__c",
    legacyKeys: ["funnel.purchaseContractDraft", "funnel.purchaseOrRenovationContract"],
    rule: "Neue Hypothek, ausser Bauprojekt",
  }),
  def({
    id: "reservation", code: "O7", group: "objekt", labelDe: "Reservationsvertrag",
    shortName: "Reservationsvertrag", legacyKeys: ["funnel.reservationContractDoc"],
    rule: "Neue Hypothek + reserviert = Ja",
  }),
  def({
    id: "reservation_zahlung", code: "O8", group: "objekt", labelDe: "Nachweis Reservationszahlung (Bankauszug)",
    shortName: "Reservationszahlung", legacyKeys: ["funnel.bankStatementReservation"],
    rule: "Neue Hypothek + reserviert = Ja",
  }),
  def({
    id: "baubewilligung", code: "O9", group: "objekt", labelDe: "Baubewilligung",
    shortName: "Baubewilligung", legacyKeys: ["funnel.buildingPermitDoc2"],
    rule: "Bauprojekt oder (Neue Hypothek + Renovation = Ja)",
  }),
  def({
    id: "projekt", code: "O10", group: "objekt",
    labelDe: "Projektpläne, Baubeschrieb und Werkvertrag inkl. Kostenzusammenzug und Kubatur",
    shortName: "Projektunterlagen", legacyKeys: ["funnel.projectPlanCostEstimate"],
    rule: "wie O9",
  }),
  def({
    id: "stwe_regl", code: "O11", group: "objekt",
    labelDe: "Begründungsakt mit Wertquoten · Nutzungs- und Verwaltungsreglement",
    shortName: "STWE-Reglement", legacyKeys: ["funnel.condominiumActValue", "funnel.usageRegulationsSTWE"],
    fields: ["Gemeinschaft", "Umfang", "Wertquote Einheit Nr. 1"],
    rule: "Liegenschaft = Stockwerkeigentum",
  }),
  def({
    id: "ef", code: "O12", group: "objekt", labelDe: "Angaben zum Erneuerungsfonds",
    shortName: "Erneuerungsfonds", legacyKeys: ["funnel.renovationFundInfoCondominium"],
    fields: ["Kontoinhaber", "IBAN", "Saldo per 31.12.2025", "Erstellt am"],
    rule: "Liegenschaft = Stockwerkeigentum",
  }),
  def({
    id: "mieterspiegel", code: "O13", group: "objekt", labelDe: "Aktueller Mieterspiegel inkl. Mietzinsaufstellung",
    shortName: "Mieterspiegel", legacyKeys: ["funnel.rentalOverviewCurrent"],
    rule: "Nutzung = Vermietet",
  }),
  def({
    id: "baurecht", code: "O14", group: "objekt", labelDe: "Baurechtsvertrag",
    shortName: "Baurechtsvertrag", legacyKeys: ["funnel.baurechtsvertrag"],
    rule: "Baurecht = Ja",
  }),
  def({
    id: "angebote", code: "O15", group: "objekt", labelDe: "Bestehende Finanzierungsangebote",
    shortName: "Finanzierungsangebot",
    rule: "Angebote = Ja",
  }),

  // ---- Bestehende Hypothek ---------------------------------------------------------------
  def({
    id: "hyp_rahmen", code: "H1", group: "hypothek", labelDe: "Aktueller Hypothekarvertrag (Rahmenvertrag)",
    shortName: "Hypothekarvertrag", legacyKeys: ["funnel.currentMortgageContract"],
    fields: ["Bank", "Kunden-Nr.", "Rahmenkredit", "Vertragsbeginn"],
    rule: "Ablösung",
  }),
  def({
    id: "hyp_sicher", code: "H2", group: "hypothek", labelDe: "Sicherungsvereinbarung / Schuldbrief",
    shortName: "Sicherungsvereinbarung",
    fields: ["Bank", "Schuldner", "Grundpfandtitel", "Lastend auf"],
    rule: "Ablösung",
  }),
  def({
    id: "hyp_zins", code: "H3", group: "hypothek", labelDe: "Letzte Zinsabrechnung",
    shortName: "Zinsabrechnung",
    fields: ["Produkt", "Kapital", "Zinssatz", "Laufzeit", "Zins Q1 2026"],
    rule: "Ablösung",
  }),

  // ---- Zur Person --------------------------------------------------------------------------
  def({
    id: "vollmacht", code: "P1", group: "person", labelDe: "HYPOTEQ Auskunftsermächtigung",
    shortName: "Auskunftsermaechtigung", legacyKeys: ["funnel.auskunftsermaechtigungDoc"],
    fields: ["Vollmachtgeber", "Adresse", "Unterschrift", "Unterzeichnet am"],
    rule: "immer",
  }),
  def({
    id: "id", code: "P2", group: "person", labelDe: "Pass / Identitätskarte",
    shortName: "ID", perBorrower: true, datedName: false, sfDokField: "Dok_Identitaetsdokument__c",
    legacyKeys: ["funnel.passportIDAllBorrowers"],
    fields: ["Name", "Vornamen", "Geburtsdatum", "Nationalität", "Dokumentart", "Gültig bis"],
    rule: "natürliche Person · pro Kreditnehmer",
  }),
  def({
    id: "lohnausweise", code: "P3", group: "person", labelDe: "Lohnausweise der letzten 3 Jahre",
    shortName: "Lohnausweis", perBorrower: true, expect: 3, sfDokField: "Dok_Lohnausweis__c",
    legacyKeys: ["funnel.salaryStatementBonus"],
    fields: ["Arbeitgeber", "AHV-Nr.", "Bruttolohn 2025", "Bruttolohn 2024", "Bruttolohn 2023", "Beschäftigungsgrad"],
    rule: "angestellt (oder Beschäftigung offen) · erwartet 3 Dateien",
  }),
  def({
    id: "lohnabrechnungen", code: "P4", group: "person", labelDe: "Letzte 3 Monatslohnabrechnungen",
    shortName: "Lohnabrechnungen", perBorrower: true, legacyKeys: ["funnel.monthlyPayslips3"],
    fields: ["Arbeitgeber", "Perioden", "Monatslohn brutto", "Familienzulagen", "Nettolohn", "Pauschalspesen", "Auszahlung"],
    rule: "wie P3",
  }),
  def({
    id: "anstellung", code: "P5", group: "person", labelDe: "Anstellungsvertrag",
    shortName: "Anstellungsvertrag", perBorrower: true,
    fields: ["Arbeitgeber", "Arbeitnehmer", "Anstellung", "Jahreslohn"],
    rule: "wie P3",
  }),
  def({
    id: "pk", code: "P6", group: "person", labelDe: "Pensionskassenausweis",
    shortName: "Pensionskassenausweis", perBorrower: true, sfDokField: "Dok_Pensionskassenausweis__c",
    // pensionFund3rdPillarBuyback is the retired combined PK + 3a document.
    legacyKeys: ["funnel.pensionFundCertificate", "funnel.pensionFund3rdPillarBuyback"],
    fields: ["Versicherte Person", "Versicherter Lohn", "Altersguthaben", "Vorbezug für Wohneigentum möglich"],
    rule: "angestellt · oder selbständig + pkSe = Ja",
  }),
  def({
    id: "abschluss_se", code: "P7", group: "person",
    labelDe: "Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre",
    shortName: "Bilanz-Erfolgsrechnung", perBorrower: true, legacyKeys: ["funnel.balanceSheetAudit3Years"],
    rule: "selbständig",
  }),
  def({
    id: "rente", code: "P8", group: "person", labelDe: "Rentenbescheinigung (PK, AHV)",
    shortName: "Rentenbescheinigung", perBorrower: true, legacyKeys: ["funnel.pensionCertificatePKAHV"],
    rule: "pensioniert",
  }),
  def({
    id: "steuer", code: "P9", group: "person", labelDe: "Aktuelle Steuererklärung",
    shortName: "Steuererklaerung", perBorrower: true, sfDokField: "Dok_Steuererklaerung__c",
    legacyKeys: ["funnel.taxReturnLatest"],
    fields: ["Steuerjahr", "Kanton", "Zivilstand", "Kinder", "Unterhaltsbeiträge", "Liegenschaft", "Hypothekarschuld"],
    rule: "natürliche Person",
  }),
  def({
    id: "ahv_voraus", code: "P10", group: "person", labelDe: "Rentenvorausberechnung (AHV)",
    shortName: "Rentenvorausberechnung", legacyKeys: ["funnel.pensionForecastAHV"],
    rule: "ab 50 = Ja und nicht pensioniert",
  }),
  def({
    id: "unterhalt", code: "P11", group: "person", labelDe: "Unterhaltsvereinbarung",
    shortName: "Unterhaltsvereinbarung",
    fields: ["Parteien", "Kinder", "Unterhaltsbeitrag", "Gültig ab"],
    rule: "Kinder = Ja + Unterhalt = Ja",
  }),
  def({
    id: "kredit", code: "P12", group: "person", labelDe: "Kreditverträge (Privatkredite)",
    shortName: "Kreditvertrag",
    fields: ["Kreditgeber", "Vertragsnummer", "Restschuld", "Monatsrate", "ZEK-relevant"],
    rule: "Privatkredite = Ja",
  }),
  def({
    id: "leasing", code: "P13", group: "person", labelDe: "Leasingverträge",
    shortName: "Leasingvertrag", legacyKeys: ["funnel.leasingContract"],
    fields: ["Leasinggeber", "Leasingnehmer", "Leasingrate", "Restlaufzeit"],
    rule: "Leasings = Ja",
  }),
  def({
    id: "b_id", code: "P14", group: "person", labelDe: "Solidarbürge · Pass / ID",
    shortName: "ID", personKind: "guarantor", datedName: false,
    rule: "Solidarbürgschaft = Ja",
  }),
  def({
    id: "b_steuer", code: "P15", group: "person", labelDe: "Solidarbürge · aktuelle Steuererklärung",
    shortName: "Steuererklaerung", personKind: "guarantor",
    rule: "Solidarbürgschaft = Ja",
  }),
  def({
    id: "b_lohn", code: "P16", group: "person", labelDe: "Solidarbürge · Lohnausweise 3 Jahre",
    // The spec gives no file count for the guarantor's three Lohnausweise (only P3 «erwartet 3 Dateien»).
    shortName: "Lohnausweis", personKind: "guarantor",
    rule: "Solidarbürgschaft = Ja",
  }),
  def({
    id: "hr", code: "J1", group: "person", labelDe: "Aktueller Handelsregisterauszug",
    shortName: "Handelsregisterauszug", personKind: "company", legacyKeys: ["funnel.commercialRegisterCurrent"],
    rule: "juristische Person",
  }),
  def({
    id: "wb", code: "J2", group: "person", labelDe: "Pass / ID der zeichnungsberechtigten Person",
    shortName: "ID", personKind: "signatory", datedName: false, legacyKeys: ["funnel.passportAuthorizedPersonJur"],
    rule: "juristische Person",
  }),
  def({
    id: "jahresabschluss", code: "J3", group: "person",
    labelDe: "Jahresabschlüsse (Bilanz und Erfolgsrechnung) der letzten 3 Jahre",
    shortName: "Jahresabschluss", personKind: "company", legacyKeys: ["funnel.annualFinancialStatementsJur"],
    rule: "juristische Person",
  }),
  def({
    id: "zwischenbilanz", code: "J4", group: "person", labelDe: "Aktuelle Zwischenbilanz",
    shortName: "Zwischenbilanz", personKind: "company", optional: true,
    legacyKeys: ["funnel.interimBalanceIfAvailable"],
    rule: "juristische Person · optional («Falls vorhanden»)",
  }),
  def({
    id: "betreibung", code: "J5", group: "person", labelDe: "Aktueller Betreibungsauszug",
    shortName: "Betreibungsauszug", personKind: "company", sfDokField: "Dok_Betreibungsregisterauszug__c",
    legacyKeys: ["funnel.debtCollectionExtractCurrent"],
    rule: "juristische Person",
  }),
  def({
    id: "steuer_jp", code: "J6", group: "person", labelDe: "Aktuelle Steuererklärung der Gesellschaft",
    shortName: "Steuererklaerung", personKind: "company", legacyKeys: ["funnel.taxReturnLatestJur"],
    rule: "juristische Person",
  }),

  // ---- Eigenmittel & Vorsorge ------------------------------------------------------------
  def({
    id: "vermoegen", code: "E1", group: "eigenmittel", labelDe: "Aufstellung und Nachweis der Eigenmittel",
    shortName: "Eigenmittelnachweis", legacyKeys: ["funnel.ownFundsProofOfficial", "funnel.ownFundsProofJur"],
    fields: ["Bank", "Kontoinhaber", "Privatkonto", "Saldo total"],
    rule: "immer",
  }),
  def({
    id: "s3a", code: "E2", group: "eigenmittel", labelDe: "Säule 3a Bescheinigung",
    shortName: "Saeule3a-Bescheinigung",
    fields: ["Vorsorgeeinrichtung", "Versicherte Person", "Beiträge 2025", "Beginn Vorsorgeverhältnis"],
    rule: "3a = Ja oder (ab 50 = Ja, natürliche Person)",
  }),
  def({
    id: "police", code: "E3", group: "eigenmittel", labelDe: "Vorsorgepolice 3a inkl. Wertmitteilung",
    shortName: "Vorsorgepolice-3a", expect: 2,
    // «Rückkaufswerte 3. Säule» = the Wertmitteilung of the 3a policy.
    legacyKeys: ["funnel.pillar3BuybackValues"],
    fields: ["Versicherer", "Police-Nr.", "Vorsorgeplan", "Versicherungsbeginn", "Monatsprämie", "Rückkaufswert per 09.01.2026", "Begünstigte Bank"],
    rule: "wie E2 · erwartet 2 Dateien",
  }),
  def({
    id: "pkvorbezug", code: "E4", group: "eigenmittel", labelDe: "Bestätigung PK-Vorbezug / Verpfändung",
    shortName: "PK-Vorbezug",
    rule: "Pensionskasse = Ja",
  }),
  def({
    id: "schenkung", code: "E5", group: "eigenmittel", labelDe: "Schenkungsvertrag",
    shortName: "Schenkungsvertrag", legacyKeys: ["funnel.giftContract"],
    rule: "Schenkung = Ja",
  }),
  def({
    id: "erbe", code: "E6", group: "eigenmittel", labelDe: "Erbschaftsbestätigung",
    shortName: "Erbschaftsbestaetigung", legacyKeys: ["funnel.inheritanceConfirmation", "funnel.inheritanceContract"],
    rule: "Erbschaft = Ja",
  }),
  def({
    id: "darlehen", code: "E7", group: "eigenmittel", labelDe: "Darlehensvertrag",
    shortName: "Darlehensvertrag", legacyKeys: ["funnel.loanContractGift"],
    rule: "Darlehen = Ja",
  }),
];

const BY_ID = new Map(REQ.map((r) => [r.id, r]));
const BY_LEGACY = new Map<string, RequirementDef>();
for (const r of REQ) for (const k of r.legacyKeys) BY_LEGACY.set(k, r);

export function getRequirement(id: string): RequirementDef | undefined {
  return BY_ID.get(baseId(id));
}

/** The requirement an old `funnel.*` key (Inquiry.documentsMissing, Document.docType) stands for. */
export function requirementForLegacyKey(key: string): RequirementDef | undefined {
  return BY_LEGACY.get(key);
}

/** `id#borrower` → `id`. */
export function baseId(instanceId: string): string {
  const i = instanceId.indexOf("#");
  return i < 0 ? instanceId : instanceId.slice(0, i);
}

// ---- Reasons ----------------------------------------------------------------------------

/** Question keys a reason can point at: `q.<key>` / `opt.<key>.<value>` in the i18n file. */
export type QuestionKey = keyof Answers | "job" | "pkSe";

export interface ReasonCondition {
  question: QuestionKey;
  /** The German option key (`opt.<question>.<value>`), e.g. "Ja", "Stockwerkeigentum". */
  value: string;
}

/**
 * Why a requirement is on the list. `key` is the i18n key:
 *  - why.required     «Pflicht»
 *  - why.perBorrower  «Pflicht · pro Kreditnehmer»
 *  - why.ifAvailable  «Falls vorhanden»
 *  - why.because      «weil: {reason}» — reason = the conditions, e.g. «Baurecht = Ja»
 */
export type ReqReason =
  | { key: "why.required" }
  | { key: "why.perBorrower" }
  | { key: "why.ifAvailable" }
  | { key: "why.because"; conditions: ReasonCondition[] };

/** Short German names of the questions, as the prototype shows them («weil: Baurecht = Ja»). */
export const QUESTION_SHORT_DE: Record<QuestionKey, string> = {
  antrag: "Kreditantrag",
  kn: "Kreditnehmer",
  anrede: "Anrede",
  immo: "Art der Immobilie",
  nbDocs: "Grundbuch und GVZ vorhanden",
  lieg: "Liegenschaft",
  nutz: "Nutzung",
  heizung: "Heizung",
  baurecht: "Baurecht",
  aufstockung: "Erhöhung",
  reno: "Renovation",
  reserviert: "reserviert",
  angebote: "Angebote",
  job: "Beschäftigung",
  pkSe: "Pensionskasse vorhanden",
  ab50: "ab 50",
  kinder: "Kinder",
  unterhalt: "Unterhaltszahlungen",
  kredite: "Privatkredite",
  leasing: "Leasings",
  buerge: "Solidarbürgschaft",
  laufzeit: "Laufzeit",
  s3a: "Säule 3a",
  schenkung: "Schenkung",
  erbe: "Erbschaft",
  darlehen: "Darlehen",
  pk: "Pensionskasse",
};

/** The German reason line, as written to Salesforce (spec 6.11 `reason`). */
export function reasonTextDe(reason: ReqReason): string {
  switch (reason.key) {
    case "why.required":
      return "Pflicht";
    case "why.perBorrower":
      return "Pflicht · pro Kreditnehmer";
    case "why.ifAvailable":
      return "Falls vorhanden";
    case "why.because":
      return "weil: " + reason.conditions.map((c) => `${QUESTION_SHORT_DE[c.question]} = ${c.value}`).join(" · ");
  }
}

const REQUIRED: ReqReason = { key: "why.required" };
const PER_BORROWER: ReqReason = { key: "why.perBorrower" };
const IF_AVAILABLE: ReqReason = { key: "why.ifAvailable" };
const because = (...conditions: ReasonCondition[]): ReqReason => ({ key: "why.because", conditions });
const cond = (question: QuestionKey, value: string): ReasonCondition => ({ question, value });

// ---- Instances --------------------------------------------------------------------------

export interface PersonRef {
  kind: "borrower" | "guarantor" | "signatory" | "company";
  /** Set for kind = borrower. */
  borrowerId?: string;
  first: string;
  last: string;
  /** Set for kind = company. */
  company?: string;
  /** «Gary Gerber» / «Muster AG». */
  display: string;
}

export interface RequirementInstance {
  /** `id` for case-level requirements, `id#<borrowerId>` for per-borrower ones. */
  instanceId: string;
  id: string;
  code: string;
  group: ReqGroup;
  labelKey: string;
  labelDe: string;
  reason: ReqReason;
  expect: number;
  optional: boolean;
  perBorrower: boolean;
  borrowerId?: string;
  /** Whose document it is (for the group heading and the stored file name). */
  person?: PersonRef;
  def: RequirementDef;
}

export type ReqState = Pick<FunnelState, "ans" | "borrowers" | "txt">;

/** «Vorname Name» → first / last; the last word is the family name. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function borrowerRef(b: Borrower): PersonRef {
  return { kind: "borrower", borrowerId: b.id, first: b.vor, last: b.nach, display: [b.vor, b.nach].filter(Boolean).join(" ") };
}

/**
 * The natural-person borrowers as the rules see them. With none entered yet there is still
 * one (the customer from step 1), so the list never loses its person documents.
 * The first borrower's name falls back to the step-1 contact (types.ts: they are kept in step).
 */
export function effectiveBorrowers(state: ReqState): Borrower[] {
  const list = state.borrowers && state.borrowers.length ? state.borrowers : [{ id: "1", vor: "", nach: "", pkSe: "Nein" as YesNo }];
  return list.map((b, i) =>
    i === 0 ? { ...b, vor: b.vor || state.txt?.vor || "", nach: b.nach || state.txt?.nach || "" } : b
  );
}

/** Spec P3: angestellt «oder Beschäftigung offen». */
const isEmployedOrOpen = (job: Job | undefined) => job === undefined || job === "Angestellt";

/**
 * The requirements for an answer state, in display order (spec 4.1).
 *
 * Order: Objekt O1–O15 · Hypothek H1–H3 · Person P1, then per Kreditnehmer P2–P9, then
 * P10–P13 (or J1–J6 for a juristische Person, then P12–P13), P14–P16 · Eigenmittel E1–E7.
 */
export function reqList(state: ReqState): RequirementInstance[] {
  const a = state.ans;
  const out: RequirementInstance[] = [];
  const push = (id: string, reason: ReqReason, extra?: { borrower?: Borrower; person?: PersonRef }) => {
    const d = BY_ID.get(id)!;
    const b = extra?.borrower;
    out.push({
      instanceId: b ? `${id}#${b.id}` : id,
      id,
      code: d.code,
      group: d.group,
      labelKey: d.labelKey,
      labelDe: d.labelDe,
      reason,
      expect: d.expect,
      optional: d.optional,
      perBorrower: d.perBorrower,
      borrowerId: b?.id,
      person: b ? borrowerRef(b) : extra?.person,
      def: d,
    });
  };

  const abl = a.antrag === "Ablösung";
  const kauf = a.antrag === "Neue Hypothek";
  const jp = a.kn === "Juristische Person";
  const proj = a.immo === "Bauprojekt";
  const neu = a.immo === "Neubau";

  // ---- Objekt
  if (!proj) {
    push("fotos", REQUIRED);
    push("verkaufsdoku", IF_AVAILABLE);
    push("stwe_plan", REQUIRED);
  }
  const gbReason = neu ? because(cond("nbDocs", "Ja")) : REQUIRED;
  if (!neu || a.nbDocs === "Ja") {
    push("grundbuch", gbReason);
    if (!proj) push("gvz", gbReason);
  }
  if (kauf && !proj) push("kaufvertrag", because(cond("antrag", "Neue Hypothek")));
  if (kauf && a.reserviert === "Ja") {
    const r = because(cond("reserviert", "Ja"));
    push("reservation", r);
    push("reservation_zahlung", r);
  }
  if (proj || (kauf && a.reno === "Ja")) {
    const r = proj ? because(cond("immo", "Bauprojekt")) : because(cond("reno", "Ja"));
    push("baubewilligung", r);
    push("projekt", r);
  }
  if (a.lieg === "Stockwerkeigentum") {
    const r = because(cond("lieg", "Stockwerkeigentum"));
    push("stwe_regl", r);
    push("ef", r);
  }
  if (a.nutz === "Vermietet") push("mieterspiegel", because(cond("nutz", "Vermietet")));
  if (a.baurecht === "Ja") push("baurecht", because(cond("baurecht", "Ja")));
  if (a.angebote === "Ja") push("angebote", because(cond("angebote", "Ja")));

  // ---- Bestehende Hypothek
  if (abl) {
    const r = because(cond("antrag", "Ablösung"));
    push("hyp_rahmen", r);
    push("hyp_sicher", r);
    push("hyp_zins", r);
  }

  // ---- Person
  const borrowers = jp ? [] : effectiveBorrowers(state);
  const firma = (state.txt?.firma || "").trim();
  const company: PersonRef | undefined = jp ? { kind: "company", first: "", last: "", company: firma, display: firma } : undefined;
  const main = jp ? company : borrowers[0] ? borrowerRef(borrowers[0]) : undefined;

  push("vollmacht", REQUIRED, { person: main });
  if (jp) {
    const zeichner = (state.txt?.zeichner || "").trim();
    const signatory: PersonRef = { kind: "signatory", ...splitFullName(zeichner), display: zeichner };
    push("hr", REQUIRED, { person: company });
    push("wb", REQUIRED, { person: signatory });
    push("jahresabschluss", REQUIRED, { person: company });
    push("zwischenbilanz", IF_AVAILABLE, { person: company });
    push("betreibung", REQUIRED, { person: company });
    push("steuer_jp", REQUIRED, { person: company });
  } else {
    for (const b of borrowers) {
      push("id", PER_BORROWER, { borrower: b });
      if (isEmployedOrOpen(b.job)) {
        push("lohnausweise", PER_BORROWER, { borrower: b });
        push("lohnabrechnungen", PER_BORROWER, { borrower: b });
        push("anstellung", PER_BORROWER, { borrower: b });
        // Spec P6 says «angestellt»; an open Beschäftigung is treated as angestellt like P3–P5
        // (the prototype does so, and the Gerber counter starts at 13 only that way).
        push("pk", PER_BORROWER, { borrower: b });
      } else if (b.job === "Selbständig") {
        if (b.pkSe === "Ja") push("pk", because(cond("job", "Selbständig"), cond("pkSe", "Ja")), { borrower: b });
        push("abschluss_se", because(cond("job", "Selbständig")), { borrower: b });
      } else if (b.job === "Pensioniert") {
        push("rente", because(cond("job", "Pensioniert")), { borrower: b });
      }
      push("steuer", PER_BORROWER, { borrower: b });
    }
    // «Ist ein Kreditnehmer 50 Jahre oder älter?» is one question per case (DECISIONS D4), so
    // the forecast is asked once — unless every borrower is already retired.
    if (a.ab50 === "Ja" && borrowers.some((b) => b.job !== "Pensioniert")) push("ahv_voraus", because(cond("ab50", "Ja")), { person: main });
    if (a.kinder === "Ja" && a.unterhalt === "Ja") push("unterhalt", because(cond("kinder", "Ja"), cond("unterhalt", "Ja")), { person: main });
  }
  // Privatkredite, Leasings and the Solidarbürgschaft are asked for both borrower types (spec 3).
  if (a.kredite === "Ja") push("kredit", because(cond("kredite", "Ja")), { person: main });
  if (a.leasing === "Ja") push("leasing", because(cond("leasing", "Ja")), { person: main });
  if (a.buerge === "Ja") {
    const name = (state.txt?.buergeName || "").trim();
    const guarantor: PersonRef = { kind: "guarantor", ...splitFullName(name), display: name };
    const r = because(cond("buerge", "Ja"));
    push("b_id", r, { person: guarantor });
    push("b_steuer", r, { person: guarantor });
    push("b_lohn", r, { person: guarantor });
  }

  // ---- Eigenmittel
  push("vermoegen", REQUIRED);
  const s3aYes = a.s3a === "Ja";
  const ab50Nat = a.ab50 === "Ja" && !jp;
  if (s3aYes || ab50Nat) {
    const conds = [...(s3aYes ? [cond("s3a", "Ja")] : []), ...(ab50Nat ? [cond("ab50", "Ja")] : [])];
    push("s3a", because(...conds));
    push("police", because(...conds));
  }
  if (a.pk === "Ja") push("pkvorbezug", because(cond("pk", "Ja")));
  if (a.schenkung === "Ja") push("schenkung", because(cond("schenkung", "Ja")));
  if (a.erbe === "Ja") push("erbe", because(cond("erbe", "Ja")));
  if (a.darlehen === "Ja") push("darlehen", because(cond("darlehen", "Ja")));

  // Spec principle 4: every document is asked exactly once.
  return out;
}

/** A hypothetical change: answers, and/or one borrower's per-person answers. */
export interface ReqPatch {
  ans?: Partial<Answers>;
  borrower?: { id: string } & Partial<Omit<Borrower, "id">>;
}

export interface ReqDelta {
  /** Instance ids the change adds. */
  added: string[];
  /** Instance ids the change removes. */
  removed: string[];
  /** added − removed: the «+N Unterlagen» badge. */
  net: number;
}

/** How a hypothetical answer change would change the list (for the «+N Unterlagen» badges). */
export function reqDelta(state: ReqState, patch: ReqPatch): ReqDelta {
  const before = reqList(state).map((r) => r.instanceId);
  const next: ReqState = {
    ...state,
    ans: { ...state.ans, ...(patch.ans || {}) },
    borrowers: patch.borrower
      ? effectiveBorrowers(state).map((b) => (b.id === patch.borrower!.id ? { ...b, ...patch.borrower } : b))
      : state.borrowers,
  };
  const after = reqList(next).map((r) => r.instanceId);
  const b = new Set(before);
  const af = new Set(after);
  const added = after.filter((id) => !b.has(id));
  const removed = before.filter((id) => !af.has(id));
  return { added, removed, net: added.length - removed.length };
}
