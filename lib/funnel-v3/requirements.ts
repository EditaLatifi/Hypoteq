/**
 * The document requirements, v5 (docs/funnel-v5/HYPOTEQ_Handover_Edita.md, chapter 4.1;
 * cross-checked against the prototype's reqList). The v3 base is
 * docs/funnel-v3/HYPOTEQ_Funnel_Spezifikation.md, chapter 4.1.
 *
 * Pure: no React, no Prisma, no network. The UI, the AI catalogue, the renaming and the
 * Salesforce sync all read the same catalogue (`REQ`) and the same rule set (`reqList`).
 *
 * Ids are the prototype's string ids (`fotos`, `grundbuch`, `hyp_zins` …) — they are stored in
 * the database and in the Salesforce JSON, so an id that still exists never changes. `code` is
 * the handover's number (O4, P2 …).
 *
 * v5 changes (Handover 4.1, «Änderung»): Rahmenvertrag and Schuldbrief are no longer asked
 * (uploaded anyway they are «nicht benötigt», components/documentIntelligence/v3/catalogue.ts);
 * the Produktvereinbarung takes the Rahmenvertrag's place; one current Lohnausweis instead of
 * three, the two older ones only when a bonus is recognised, the Anstellungsvertrag only on a
 * Lohnerhöhung, the AHV-Vorausberechnung from the ID's birth date (4.2); the Eigenmittel
 * documents follow the amounts entered, not yes/no answers; the Auskunftsermächtigung is its
 * own block in the closing (Handover 6, `block: "signature"`).
 *
 * Where the prototype and the handover differ, the handover wins; every such place is marked
 * «handover over prototype» below.
 */

import type { Answers, Borrower, DocInfo, Eigenmittel, Job, Texts } from "./types";
import { EMPTY_EM, isRentedNutzung } from "./types";
import { tabEntriesFor } from "@/components/dokumentenCheckState";

export type ReqGroup = "objekt" | "hypothek" | "person" | "eigenmittel";

/**
 * The «<Kat>» of the stored name (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 8.1): 00
 * HYPOTEQ-Formulare · 01 Kreditnehmer 1 (02 for Kreditnehmer 2, storedName.ts katOf) · 03 Objekt
 * · 04 Finanzierung / bestehende Hypothek, the Eigenmittel with it.
 */
export type RenameGroup = "00" | "01" | "02" | "03" | "04";

export const RENAME_GROUP: Record<ReqGroup, RenameGroup> = {
  person: "01",
  hypothek: "04",
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
  /** Prototype id. Stable — stored in the DB and in Salesforce JSON. */
  id: string;
  /** Handover 4.1 number, e.g. "O4". P14–P16 are split into P14, P15, P16. */
  code: string;
  group: ReqGroup;
  /** i18n key of the label (messages/funnel-v3); `doc.<id>` unless v5 renamed the document. */
  labelKey: string;
  /** German label — the Salesforce JSON and the dossier are written in German. */
  labelDe: string;
  /** Number of files that make the requirement complete (P5 = 2, E3 = 2). */
  expect: number;
  /** «Habe ich nicht» allowed; does not block `completeForSalesforce`. */
  optional: boolean;
  /** Asked per natural-person Kreditnehmer (expanded by reqList; instance `id#<borrower>`). */
  perBorrower: boolean;
  /**
   * Shown in its own block, not in the documents list: the Auskunftsermächtigung (Handover 6,
   * «eigener Block im Abschluss»). It is still a requirement — counted, placed, sent to
   * Salesforce — so a signed copy found in the uploaded folder fulfils it.
   */
  block?: "signature";
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
  /** Field keys to extract (the AI catalogue reads them; prefill.ts and facts.ts use them). */
  fields: readonly string[];
  /** The Handover 4.1 rule, verbatim, for documentation and the internal view. */
  rule: string;
}

type DefInput = Omit<RequirementDef, "labelKey" | "renameGroup" | "tabEntries" | "expect" | "optional" | "perBorrower" | "sfDokField" | "personKind" | "datedName" | "legacyKeys" | "fields"> &
  Partial<Pick<RequirementDef, "labelKey" | "expect" | "optional" | "perBorrower" | "sfDokField" | "personKind" | "datedName" | "legacyKeys" | "fields">>;

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
    labelKey: `doc.${d.id}`,
    ...d,
    legacyKeys,
    renameGroup: d.id === "vollmacht" ? "00" : RENAME_GROUP[d.group],
    tabEntries: tabEntriesFor([...legacyKeys]),
  };
}

/** The catalogue, in handover order. */
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
    // Prefill (Handover 3.1): Objektwert (unsicher) · Baujahr, Zimmer, Heizungsart.
    fields: ["Anbieter", "Objekt", "Baujahr", "Verkaufspreis", "Zimmer", "Wohnfläche", "Garten", "Heizung", "Kubatur"],
    rule: "immer, ausser Bauprojekt · «Habe ich nicht» erlaubt",
  }),
  def({
    id: "stwe_plan", code: "O3", group: "objekt", labelDe: "Bau- / Grundrisspläne inkl. Nettowohnfläche",
    shortName: "Grundrissplaene", sfDokField: "Dok_Grundrissplaene__c",
    legacyKeys: ["funnel.constructionPlansNetArea"],
    fields: ["Objekt", "Pläne", "Einheit Nr. 1", "Nettowohnfläche"],
    rule: "immer, ausser Bauprojekt",
  }),
  def({
    id: "grundbuch", code: "O4", group: "objekt", labelDe: "Aktueller Grundbuchauszug (max. 6 Monate)",
    shortName: "Grundbuchauszug", sfDokField: "Dok_Grundbuchauszug__c",
    legacyKeys: ["funnel.landRegistryNotOlder6Months", "funnel.landRegistryIfAvailable"],
    // Prefill: PLZ, Ort, Art der Immobilie = bestehend, Baurecht · Objektadresse, Wertquote, Grundpfandrechte.
    fields: ["Grundbuch", "Eigentümer", "Objekt", "Adresse", "PLZ", "Ort", "Wertquote", "Baurecht", "Grundpfandrechte", "Ausstellungsdatum"],
    rule: "immer · Neubau nur bei «vorhanden»",
  }),
  def({
    id: "gvz", code: "O5", group: "objekt", labelDe: "Aktuelle Gebäudeversicherungspolice (inkl. Kubatur)",
    shortName: "Gebaeudeversicherung", sfDokField: "Dok_Gebaeudeversicherungsausweis__c",
    legacyKeys: ["funnel.buildingInsuranceIfAvailable"],
    fields: ["Versicherung", "Policen-Nr.", "Eigentümerschaft", "Versicherungssumme", "Erstellungsjahr", "Volumen", "Adresse", "PLZ", "Ort"],
    rule: "wie O4, ausser Bauprojekt",
  }),
  def({
    id: "kaufvertrag", code: "O6", group: "objekt", labelDe: "Kaufvertrag (Entwurf oder Original)",
    shortName: "Kaufvertrag", sfDokField: "Dok_Kaufvertrag__c",
    legacyKeys: ["funnel.purchaseContractDraft", "funnel.purchaseOrRenovationContract"],
    // Prefill: Kreditantrag = Neue Hypothek, Kaufpreis, Kaufdatum.
    fields: ["Käufer", "Verkäufer", "Objekt", "Kaufpreis", "Eigentumsübertragung", "Datum"],
    rule: "Neue Hypothek, ausser Bauprojekt",
  }),
  def({
    id: "reservation", code: "O7", group: "objekt", labelDe: "Reservationsvertrag",
    shortName: "Reservationsvertrag", legacyKeys: ["funnel.reservationContractDoc"],
    rule: "Neue Hypothek + reserviert",
  }),
  def({
    id: "reservation_zahlung", code: "O8", group: "objekt", labelDe: "Nachweis Reservationszahlung (Bankauszug)",
    shortName: "Reservationszahlung", legacyKeys: ["funnel.bankStatementReservation"],
    rule: "Neue Hypothek + reserviert",
  }),
  def({
    id: "baubewilligung", code: "O9", group: "objekt", labelDe: "Baubewilligung",
    shortName: "Baubewilligung", legacyKeys: ["funnel.buildingPermitDoc2"],
    rule: "nur Bauprojekt (v5: nicht mehr bei Renovation)",
  }),
  def({
    id: "projekt", code: "O10", group: "objekt",
    labelDe: "Projektpläne, Baubeschrieb und Werkvertrag inkl. Kostenzusammenzug und Kubatur",
    shortName: "Projektunterlagen", legacyKeys: ["funnel.projectPlanCostEstimate"],
    rule: "nur Bauprojekt",
  }),
  def({
    id: "reno_liste", code: "O11", group: "objekt",
    labelDe: "Aufstellung der Renovationen (Betrag und Ort, z.B. Küche, Bad, Fassade)",
    shortName: "Renovationen",
    fields: ["Objekt", "Positionen", "Total"],
    rule: "Neue Hypothek + Renovation",
  }),
  def({
    id: "stwe_regl", code: "O12", group: "objekt",
    labelDe: "Begründungsakt mit Wertquoten · Nutzungs- und Verwaltungsreglement",
    shortName: "STWE-Reglement", legacyKeys: ["funnel.condominiumActValue", "funnel.usageRegulationsSTWE"],
    fields: ["Gemeinschaft", "Umfang", "Wertquote Einheit Nr. 1"],
    rule: "STWE",
  }),
  def({
    id: "ef", code: "O13", group: "objekt", labelDe: "Angaben zum Erneuerungsfonds",
    shortName: "Erneuerungsfonds", legacyKeys: ["funnel.renovationFundInfoCondominium"],
    fields: ["Kontoinhaber", "IBAN", "Saldo per 31.12.2025", "Erstellt am"],
    rule: "STWE",
  }),
  def({
    id: "mieterspiegel", code: "O14", group: "objekt", labelDe: "Aktueller Mieterspiegel inkl. Mietzinsaufstellung",
    shortName: "Mieterspiegel", legacyKeys: ["funnel.rentalOverviewCurrent"],
    fields: ["Objekt", "Mieteinheiten", "Mietzinseinnahmen pro Jahr", "Stichtag"],
    rule: "Nutzung = Vermietet (auch «Vermietet & teilweise selbstbewohnt»)",
  }),
  def({
    id: "baurecht", code: "O15", group: "objekt", labelDe: "Baurechtsvertrag",
    shortName: "Baurechtsvertrag", legacyKeys: ["funnel.baurechtsvertrag"],
    rule: "Chip Baurecht",
  }),
  def({
    id: "angebote", code: "O16", group: "objekt", labelDe: "Bestehende Finanzierungsangebote",
    shortName: "Finanzierungsangebot",
    rule: "Chip Angebote",
  }),

  // ---- Bestehende Hypothek ---------------------------------------------------------------
  def({
    id: "produkt", code: "H1", group: "hypothek", labelDe: "Aktuelle Produktvereinbarung",
    shortName: "Produktvereinbarung",
    // It replaces the Rahmenvertrag (Rosanna): an old «aktueller Hypothekarvertrag» key means it.
    legacyKeys: ["funnel.currentMortgageContract"],
    fields: ["Bank", "Produkt", "Betrag", "Zinssatz", "Laufzeit", "Ablösedatum"],
    rule: "Ablösung (ersetzt Hypothekar-/Rahmenvertrag)",
  }),
  def({
    id: "hyp_zins", code: "H2", group: "hypothek", labelDe: "Letzte Zinsabrechnung",
    shortName: "Zinsabrechnung",
    // Prefill: Kreditantrag = Ablösung, bestehende Hypothek · Bank, Zins, Laufzeit, Ablösedatum.
    fields: ["Produkt", "Kapital", "Zinssatz", "Laufzeit", "Zins Q1 2026", "Ablösedatum"],
    rule: "Ablösung (DECISIONS V3)",
  }),

  // ---- Zur Person --------------------------------------------------------------------------
  def({
    id: "vollmacht", code: "P0", group: "person", labelDe: "HYPOTEQ Auskunftsermächtigung",
    shortName: "Auskunftsermaechtigung", legacyKeys: ["funnel.auskunftsermaechtigungDoc"], block: "signature",
    // Handover 6: the AI checks the form, the signature and the name.
    fields: ["Vollmachtgeber", "Adresse", "Unterschrift", "Unterzeichnet am"],
    rule: "immer · eigener Block im Abschluss (Handover 6)",
  }),
  def({
    id: "id", code: "P1", group: "person", labelDe: "Pass / Identitätskarte",
    shortName: "ID", perBorrower: true, datedName: false, sfDokField: "Dok_Identitaetsdokument__c",
    legacyKeys: ["funnel.passportIDAllBorrowers"],
    // Prefill: Anrede, Vorname, Nachname, Kreditnehmer = natürlich · Geburtsdatum, Nationalität, ab 50.
    fields: ["Name", "Vornamen", "Geschlecht", "Geburtsdatum", "Nationalität", "Dokumentart", "Gültig bis"],
    rule: "pro Kreditnehmer",
  }),
  def({
    id: "lohnausweise", code: "P2", group: "person", labelKey: "doc.lohnausweis1", labelDe: "Aktueller Lohnausweis",
    shortName: "Lohnausweis", perBorrower: true, sfDokField: "Dok_Lohnausweis__c",
    legacyKeys: ["funnel.salaryStatementBonus"],
    // Prefill: Beschäftigung = angestellt, Bruttoeinkommen · Arbeitgeber. «Jahr» and «Bruttolohn»
    // are what 4.2 compares (facts.ts).
    fields: ["Arbeitgeber", "AHV-Nr.", "Jahr", "Bruttolohn", "Beschäftigungsgrad"],
    rule: "angestellt · 1 Datei (v5: statt 3 Jahre)",
  }),
  def({
    id: "lohnabrechnungen", code: "P3", group: "person", labelDe: "Letzte 3 Monatslohnabrechnungen",
    shortName: "Lohnabrechnungen", perBorrower: true, legacyKeys: ["funnel.monthlyPayslips3"],
    fields: ["Arbeitgeber", "Perioden", "Monatslohn brutto", "13. Monatslohn", "Familienzulagen", "Nettolohn", "Pauschalspesen", "Auszahlung"],
    rule: "angestellt",
  }),
  def({
    id: "pk", code: "P4", group: "person", labelDe: "Pensionskassenausweis",
    shortName: "Pensionskassenausweis", perBorrower: true, sfDokField: "Dok_Pensionskassenausweis__c",
    // pensionFund3rdPillarBuyback is the retired combined PK + 3a document.
    legacyKeys: ["funnel.pensionFundCertificate", "funnel.pensionFund3rdPillarBuyback"],
    fields: ["Versicherte Person", "Geburtsdatum", "Versicherter Lohn", "Altersguthaben", "Vorbezug für Wohneigentum möglich"],
    rule: "angestellt · selbständig mit PK",
  }),
  def({
    id: "lohnausweise_alt", code: "P5", group: "person", labelDe: "Lohnausweise der zwei Vorjahre",
    shortName: "Lohnausweis", perBorrower: true, expect: 2,
    fields: ["Arbeitgeber", "AHV-Nr.", "Jahr", "Bruttolohn", "Beschäftigungsgrad"],
    rule: "automatisch, wenn Bonus erkannt (4.2)",
  }),
  def({
    id: "anstellung", code: "P6", group: "person", labelDe: "Anstellungsvertrag",
    shortName: "Anstellungsvertrag", perBorrower: true,
    fields: ["Arbeitgeber", "Arbeitnehmer", "Anstellung", "Jahreslohn"],
    rule: "automatisch, wenn Lohnerhöhung erkannt (4.2)",
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
    // Per borrower in the id (`steuer#<KN1>`, as stored before v5), asked for Kreditnehmer 1:
    // P17 does not list it for Kreditnehmer 2.
    shortName: "Steuererklaerung", perBorrower: true, sfDokField: "Dok_Steuererklaerung__c",
    legacyKeys: ["funnel.taxReturnLatest"],
    // Prefill: Nutzung = selbstbewohnt (unsicher, über Eigenmietwert) · Zivilstand, Kinder.
    // Abgleich (Spezifikation Datenabgleich 4): the income and the assets as secondary sources.
    fields: ["Steuerjahr", "Kanton", "Zivilstand", "Kinder", "Unterhaltsbeiträge", "Liegenschaft", "Eigenmietwert", "Hypothekarschuld", "Einkünfte unselbständig", "Einkünfte selbständig", "Renteneinkünfte", "Vermögen"],
    rule: "natürliche Person",
  }),
  def({
    id: "ahv_voraus", code: "P10", group: "person", labelDe: "Rentenvorausberechnung (AHV)",
    shortName: "Rentenvorausberechnung", legacyKeys: ["funnel.pensionForecastAHV"],
    rule: "automatisch, wenn ID ≥ 50 Jahre zeigt (4.2)",
  }),
  def({
    id: "unterhalt", code: "P11", group: "person", labelDe: "Unterhaltsvereinbarung",
    shortName: "Unterhaltsvereinbarung",
    fields: ["Parteien", "Kinder", "Unterhaltsbeitrag", "Gültig ab"],
    rule: "Chip Unterhalt",
  }),
  def({
    id: "kredit", code: "P12", group: "person", labelDe: "Kreditverträge (Privatkredite)",
    shortName: "Kreditvertrag",
    fields: ["Kreditgeber", "Vertragsnummer", "Restschuld", "Monatsrate", "ZEK-relevant"],
    rule: "Chip Privatkredit",
  }),
  def({
    id: "leasing", code: "P13", group: "person", labelDe: "Leasingverträge",
    shortName: "Leasingvertrag", legacyKeys: ["funnel.leasingContract"],
    fields: ["Leasinggeber", "Leasingnehmer", "Leasingrate", "Restlaufzeit"],
    rule: "Chip Leasing",
  }),
  def({
    id: "b_id", code: "P14", group: "person", labelDe: "Solidarbürge · Pass / ID",
    shortName: "ID", personKind: "guarantor", datedName: false,
    rule: "Chip Solidarbürgschaft",
  }),
  def({
    id: "b_steuer", code: "P15", group: "person", labelDe: "Solidarbürge · aktuelle Steuererklärung",
    shortName: "Steuererklaerung", personKind: "guarantor",
    rule: "Chip Solidarbürgschaft",
  }),
  def({
    id: "b_lohn", code: "P16", group: "person", labelKey: "doc.b_lohn1", labelDe: "Solidarbürge · aktueller Lohnausweis",
    // v5: the current one only, like P2 (replaces DECISIONS D22's three files).
    shortName: "Lohnausweis", personKind: "guarantor",
    rule: "Chip Solidarbürgschaft · aktueller Lohnausweis",
  }),
  def({
    id: "hr", code: "J1", group: "person", labelDe: "Aktueller Handelsregisterauszug",
    shortName: "Handelsregisterauszug", personKind: "company", sfDokField: "Dok_Handelsregisterauszug__c", legacyKeys: ["funnel.commercialRegisterCurrent"],
    // Prefill: Firma, zeichnungsberechtigte Person · UID, Sitz.
    fields: ["Firma", "UID", "Sitz", "Zeichnungsberechtigte", "Auszug vom"],
    rule: "juristische Person",
  }),
  def({
    id: "wb", code: "J2", group: "person", labelDe: "Pass / ID der zeichnungsberechtigten Person",
    shortName: "ID", personKind: "signatory", datedName: false, sfDokField: "Dok_ID_Zeichnungsberechtigte__c", legacyKeys: ["funnel.passportAuthorizedPersonJur"],
    rule: "juristische Person",
  }),
  def({
    id: "jahresabschluss", code: "J3", group: "person",
    labelDe: "Jahresabschlüsse (Bilanz und Erfolgsrechnung) der letzten 3 Jahre",
    shortName: "Jahresabschluss", personKind: "company", sfDokField: "Dok_Jahresabschluesse__c", legacyKeys: ["funnel.annualFinancialStatementsJur"],
    rule: "juristische Person",
  }),
  def({
    id: "zwischenbilanz", code: "J4", group: "person", labelDe: "Aktuelle Zwischenbilanz",
    shortName: "Zwischenbilanz", personKind: "company", optional: true,
    legacyKeys: ["funnel.interimBalanceIfAvailable"],
    rule: "juristische Person · optional",
  }),
  def({
    id: "betreibung", code: "J5", group: "person", labelDe: "Aktueller Betreibungsauszug",
    shortName: "Betreibungsauszug", personKind: "company", sfDokField: "Dok_Betreibungsregisterauszug__c",
    legacyKeys: ["funnel.debtCollectionExtractCurrent"],
    rule: "juristische Person",
  }),
  def({
    id: "steuer_jp", code: "J6", group: "person", labelDe: "Aktuelle Steuererklärung der Gesellschaft",
    shortName: "Steuererklaerung", personKind: "company", sfDokField: "Dok_Steuererklaerung_Gesellschaft__c", legacyKeys: ["funnel.taxReturnLatestJur"],
    rule: "juristische Person",
  }),

  // ---- Eigenmittel & Vorsorge ------------------------------------------------------------
  def({
    id: "vermoegen", code: "E1", group: "eigenmittel", labelDe: "Aufstellung und Nachweis der Eigenmittel",
    shortName: "Eigenmittelnachweis", sfDokField: "Dok_Eigenmittelnachweis__c", legacyKeys: ["funnel.ownFundsProofOfficial", "funnel.ownFundsProofJur"],
    fields: ["Bank", "Kontoinhaber", "Privatkonto", "Saldo total"],
    rule: "nur Neue Hypothek",
  }),
  def({
    id: "s3a", code: "E2", group: "eigenmittel", labelDe: "Säule 3a Bescheinigung",
    shortName: "Saeule3a-Bescheinigung",
    // Prefill: Säule 3a (Guthaben) · Verpfändung.
    fields: ["Vorsorgeeinrichtung", "Versicherte Person", "Guthaben", "Beiträge 2025", "Beginn Vorsorgeverhältnis", "Verpfändung"],
    rule: "Betrag Säule 3a > 0 oder ab 50",
  }),
  def({
    id: "police", code: "E3", group: "eigenmittel", labelDe: "Vorsorgepolice 3a inkl. Wertmitteilung",
    shortName: "Vorsorgepolice-3a", expect: 2,
    // «Rückkaufswerte 3. Säule» = the Wertmitteilung of the 3a policy.
    legacyKeys: ["funnel.pillar3BuybackValues"],
    // Prefill: Säule 3a (Rückkaufswert) · Verpfändung (Begünstigte Bank).
    fields: ["Versicherer", "Police-Nr.", "Vorsorgeplan", "Versicherungsbeginn", "Monatsprämie", "Rückkaufswert", "Begünstigte Bank"],
    rule: "wie E2 · erwartet 2 Dateien",
  }),
  def({
    id: "pkvorbezug", code: "E4", group: "eigenmittel", labelKey: "doc.pkvorbezug1", labelDe: "Bestätigung PK-Vorbezug",
    shortName: "PK-Vorbezug",
    rule: "Betrag PK-Vorbezug > 0",
  }),
  def({
    id: "pkverp", code: "E5", group: "eigenmittel", labelDe: "Bestätigung PK-Verpfändung",
    shortName: "PK-Verpfaendung",
    rule: "Betrag PK-Verpfändung > 0",
  }),
  def({
    id: "schenkung", code: "E6", group: "eigenmittel", labelDe: "Schenkungsvertrag",
    shortName: "Schenkungsvertrag", legacyKeys: ["funnel.giftContract"],
    rule: "Betrag Schenkung > 0",
  }),
  def({
    id: "erbe", code: "E7", group: "eigenmittel", labelKey: "doc.erbe1", labelDe: "Erbvorbezug / Erbschaftsbestätigung",
    shortName: "Erbschaftsbestaetigung", legacyKeys: ["funnel.inheritanceConfirmation", "funnel.inheritanceContract"],
    rule: "Betrag Erbvorbezug > 0",
  }),
  def({
    id: "darlehen", code: "E8", group: "eigenmittel", labelDe: "Darlehensvertrag",
    shortName: "Darlehensvertrag", legacyKeys: ["funnel.loanContractGift"],
    rule: "Betrag Darlehen > 0",
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

/** P0: the requirement shown in its own block (Handover 6). */
export const SIGNATURE_REQUIREMENT_ID = "vollmacht";

export function isSignatureRequirement(r: { id: string } | string): boolean {
  return baseId(typeof r === "string" ? r : r.id) === SIGNATURE_REQUIREMENT_ID;
}

/** The documents list without the Auskunftsermächtigung block (Handover 4.3 vs 6). */
export function documentInstances<T extends { id: string }>(list: readonly T[]): T[] {
  return list.filter((r) => !isSignatureRequirement(r));
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
 *  - why.bonus        «weil: variabler Lohnanteil erkannt» (4.2)
 *  - why.raise        «weil: Lohnerhöhung erkannt» (4.2)
 *  - why.age50        «weil: ab 50 (aus ID)» (4.2)
 *  - why.amount       «weil: {field} eingetragen» — an Eigenmittel amount (field = `em.<field>`)
 */
export type ReqReason =
  | { key: "why.required" }
  | { key: "why.perBorrower" }
  | { key: "why.ifAvailable" }
  | { key: "why.because"; conditions: ReasonCondition[] }
  | { key: "why.bonus" }
  | { key: "why.raise" }
  | { key: "why.age50" }
  | { key: "why.amount"; field: keyof Eigenmittel };

/** Short German names of the questions, as the prototype shows them («weil: Baurecht = Ja»). */
export const QUESTION_SHORT_DE: Record<QuestionKey, string> = {
  antrag: "Kreditantrag",
  kn: "Kreditnehmer",
  anrede: "Anrede",
  immo: "Art der Immobilie",
  nbDocs: "Grundbuch und GVZ vorhanden",
  lieg: "Liegenschaft",
  nutz: "Nutzung",
  aufstockung: "Erhöhung",
  reno: "Renovation",
  reserviert: "reserviert",
  laufzeit: "Laufzeit",
  job: "Beschäftigung",
  pkSe: "Pensionskasse vorhanden",
  unterhalt: "Unterhaltszahlungen",
  kredite: "Privatkredite",
  leasing: "Leasings",
  buerge: "Solidarbürgschaft",
  baurecht: "Baurecht",
  angebote: "Angebote",
  steuer: "Steueroptimierung",
};

/** German names of the Eigenmittel rows (the `em.*` labels), for «weil: Säule 3a eingetragen». */
export const EM_LABEL_DE: Record<keyof Eigenmittel, string> = {
  spar: "Ersparnisse",
  s3a: "Säule 3a",
  pkVor: "PK-Vorbezug",
  pkVerp: "PK-Verpfändung",
  schenk: "Schenkung",
  erbe: "Erbvorbezug",
  darl: "Darlehen",
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
    case "why.bonus":
      return "weil: variabler Lohnanteil erkannt";
    case "why.raise":
      return "weil: Lohnerhöhung erkannt";
    case "why.age50":
      return "weil: ab 50 (aus ID)";
    case "why.amount":
      return `weil: ${EM_LABEL_DE[reason.field]} eingetragen`;
    case "why.because":
      return "weil: " + reason.conditions.map((c) => `${QUESTION_SHORT_DE[c.question]} = ${c.value}`).join(" · ");
  }
}

const REQUIRED: ReqReason = { key: "why.required" };
const PER_BORROWER: ReqReason = { key: "why.perBorrower" };
const IF_AVAILABLE: ReqReason = { key: "why.ifAvailable" };
const because = (...conditions: ReasonCondition[]): ReqReason => ({ key: "why.because", conditions });
const cond = (question: QuestionKey, value: string): ReasonCondition => ({ question, value });
const amountReason = (field: keyof Eigenmittel): ReqReason => ({ key: "why.amount", field });

// ---- Instances --------------------------------------------------------------------------

export interface PersonRef {
  kind: "borrower" | "guarantor" | "signatory" | "company";
  /** Set for kind = borrower. */
  borrowerId?: string;
  first: string;
  last: string;
  /** Set for kind = company. */
  company?: string;
  /** «Max Mustermann» / «Muster AG». */
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

/**
 * Inquiries stored before v5 answered the Eigenmittel sources with yes/no (DECISIONS V9).
 * legacy.ts carries those answers here; a «Ja» asks for its document like an amount does, so
 * an old Nachreichung still asks for what the customer said they have.
 */
export interface LegacyEquity {
  s3a?: "Ja" | "Nein";
  /** «Pensionskasse (Vorbezug oder Verpfändung)» — the combined v3 document, E4. */
  pk?: "Ja" | "Nein";
  schenkung?: "Ja" | "Nein";
  erbe?: "Ja" | "Nein";
  darlehen?: "Ja" | "Nein";
}

/** What the rules read. FunnelState is one; `em` and `info` default to «nothing entered / recognised». */
export interface ReqState {
  ans: Answers;
  borrowers: Borrower[];
  txt: Texts;
  /** The Eigenmittel amounts (E2–E8 by amount). */
  em?: Eigenmittel;
  /** Facts read from the documents (4.2): bonus, raise, ab50. */
  info?: Pick<DocInfo, "bonus" | "raise" | "ab50">;
  /** Stored before v5 (legacy.ts). */
  legacyEquity?: LegacyEquity;
}

/** «Vorname Name» → first / last; the last word is the family name. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function borrowerRef(b: Borrower): PersonRef {
  return { kind: "borrower", borrowerId: b.id, first: b.vor, last: b.nach, display: [b.vor, b.nach].filter(Boolean).join(" ") };
}

/**
 * The natural-person borrowers as the rules see them. With none entered yet there is still
 * one (the customer from step 1), so the list never loses its person documents.
 * The first borrower's name falls back to the step-1 contact (types.ts: they are kept in step).
 */
export function effectiveBorrowers(state: Pick<ReqState, "borrowers" | "txt">): Borrower[] {
  const list = state.borrowers && state.borrowers.length ? state.borrowers : [{ id: "1", vor: "", nach: "", pkSe: "Nein" as const }];
  return list.map((b, i) =>
    i === 0 ? { ...b, vor: b.vor || state.txt?.vor || "", nach: b.nach || state.txt?.nach || "" } : b
  );
}

/** Angestellt «oder Beschäftigung offen» (DECISIONS D21) — also Kreditnehmer 2, who is not asked (P17). */
const isEmployedOrOpen = (job: Job | undefined) => job === undefined || job === "Angestellt";

const positive = (n: number | undefined) => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * The requirements for an answer state, in display order (Handover 4.1).
 *
 * Order: Objekt O1–O16 · Hypothek H1–H2 · Person P0, then Kreditnehmer 1 (P1–P11), then
 * Kreditnehmer 2 (P17), P12–P16 (a juristische Person: J1–J6, then P12–P16) · Eigenmittel E1–E8.
 */
export function reqList(state: ReqState): RequirementInstance[] {
  const a = state.ans;
  const em = state.em ?? EMPTY_EM;
  const info = state.info ?? {};
  const legacy = state.legacyEquity ?? {};
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
  // v5: the Baubewilligung and the project documents only for a Bauprojekt, no longer for a renovation.
  if (proj) {
    const r = because(cond("immo", "Bauprojekt"));
    push("baubewilligung", r);
    push("projekt", r);
  }
  // Handover over prototype: O11 is «Neue Hypothek + Renovation»; the prototype also excluded
  // a Bauprojekt, the handover does not.
  if (kauf && a.reno === "Ja") push("reno_liste", because(cond("reno", "Ja")));
  if (a.lieg === "Stockwerkeigentum") {
    const r = because(cond("lieg", "Stockwerkeigentum"));
    push("stwe_regl", r);
    push("ef", r);
  }
  // «Vermietet & teilweise selbstbewohnt» as well (HYPOTEQ 19.10. B5, DECISIONS V58); the reason names the answer given.
  if (a.nutz && isRentedNutzung(a.nutz)) push("mieterspiegel", because(cond("nutz", a.nutz)));
  if (a.baurecht === "Ja") push("baurecht", because(cond("baurecht", "Ja")));
  if (a.angebote === "Ja") push("angebote", because(cond("angebote", "Ja")));

  // ---- Bestehende Hypothek
  if (abl) {
    const r = because(cond("antrag", "Ablösung"));
    push("produkt", r);
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
    borrowers.forEach((b, i) => {
      const first = i === 0;
      push("id", PER_BORROWER, { borrower: b });
      if (isEmployedOrOpen(b.job)) {
        push("lohnausweise", PER_BORROWER, { borrower: b });
        push("lohnabrechnungen", PER_BORROWER, { borrower: b });
        // P4 says «angestellt»; an open Beschäftigung is treated as angestellt (DECISIONS D21).
        push("pk", PER_BORROWER, { borrower: b });
        // 4.2: read from Kreditnehmer 1's Lohnausweis and payslips (facts.ts). P17 lists neither
        // for Kreditnehmer 2.
        if (first && info.bonus) push("lohnausweise_alt", { key: "why.bonus" }, { borrower: b });
        if (first && info.raise) push("anstellung", { key: "why.raise" }, { borrower: b });
      } else if (b.job === "Selbständig") {
        if (b.pkSe === "Ja") push("pk", because(cond("job", "Selbständig"), cond("pkSe", "Ja")), { borrower: b });
        push("abschluss_se", because(cond("job", "Selbständig")), { borrower: b });
      } else if (b.job === "Pensioniert") {
        push("rente", because(cond("job", "Pensioniert")), { borrower: b });
      }
      if (first) {
        push("steuer", REQUIRED, { borrower: b });
        // «ab 50» is one fact per case, from the ID (4.2): the forecast is asked once — unless
        // every borrower is already retired.
        if (info.ab50 && borrowers.some((x) => x.job !== "Pensioniert")) push("ahv_voraus", { key: "why.age50" }, { person: main });
        if (a.unterhalt === "Ja") push("unterhalt", because(cond("unterhalt", "Ja")), { person: main });
      }
    });
  }
  // Privatkredit, Leasing and the Solidarbürgschaft are chips for both borrower types.
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

  // ---- Eigenmittel (each amount asks for its document; a stored v3 «Ja» counts as one)
  if (kauf) push("vermoegen", because(cond("antrag", "Neue Hypothek")));
  const s3aAmount = positive(em.s3a) || legacy.s3a === "Ja";
  if (s3aAmount || (info.ab50 && !jp)) {
    const r: ReqReason = s3aAmount ? amountReason("s3a") : { key: "why.age50" };
    push("s3a", r);
    push("police", r);
  }
  if (positive(em.pkVor) || legacy.pk === "Ja") push("pkvorbezug", amountReason("pkVor"));
  if (positive(em.pkVerp)) push("pkverp", amountReason("pkVerp"));
  if (positive(em.schenk) || legacy.schenkung === "Ja") push("schenkung", amountReason("schenk"));
  if (positive(em.erbe) || legacy.erbe === "Ja") push("erbe", amountReason("erbe"));
  if (positive(em.darl) || legacy.darlehen === "Ja") push("darlehen", amountReason("darl"));

  // Spec principle 4: every document is asked exactly once.
  return out;
}

// ---- Delta («+3») ---------------------------------------------------------------------------

/** A hypothetical change: answers, Eigenmittel amounts, and/or one borrower's per-person answers. */
export interface ReqPatch {
  ans?: Partial<Answers>;
  em?: Partial<Eigenmittel>;
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

/** How a hypothetical change would change the list (for the «+N Unterlagen» badges). */
export function reqDelta(state: ReqState, patch: ReqPatch): ReqDelta {
  const before = reqList(state).map((r) => r.instanceId);
  const next: ReqState = {
    ...state,
    ans: { ...state.ans, ...(patch.ans || {}) },
    em: { ...(state.em ?? EMPTY_EM), ...(patch.em || {}) },
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

/**
 * Handover 2 «Jeder Chip zeigt, wie viele Unterlagen er auslöst (z.B. «+3»)»: the documents a
 * chip adds, measured from «off» to «on» (so a tapped chip keeps its badge, as in the
 * prototype). 0 for «Steueroptimierung», which asks for nothing.
 */
export function chipDelta(state: ReqState, chip: keyof Answers): number {
  const off = reqDelta({ ...state, ans: { ...state.ans, [chip]: "Nein" } as Answers }, { ans: { [chip]: "Ja" } as Partial<Answers> });
  return Math.max(0, off.net);
}

/** The documents an Eigenmittel amount adds (any amount > 0 against none): Säule 3a «+2». */
export function emDelta(state: ReqState, key: keyof Eigenmittel): number {
  const base: ReqState = { ...state, em: { ...(state.em ?? EMPTY_EM), [key]: 0 } };
  return Math.max(0, reqDelta(base, { em: { [key]: 1 } as Partial<Eigenmittel> }).net);
}
