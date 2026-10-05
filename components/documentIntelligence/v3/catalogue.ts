/**
 * Funnel v3 recognition catalogue (Spezifikation 4.1, 4.3, 5 and 5.1).
 *
 * One document type per requirement in lib/funnel-v3/requirements.ts (`REQ`, all 47), plus the
 * documents customers upload that the bank does not need (spec 4.3 «Nicht benötigt»). The
 * model classifies every file against this FULL catalogue, not only against the requirements
 * on the customer's list: a Kreditvertrag uploaded while «Privatkredite» is «Nein» has to be
 * recognised as one, or spec 4.4 (answer corrections) could never fire.
 *
 * Pure — no SDK, no React, no Node API. The analyse route, the client-side placement
 * (lib/funnel-v3/placeFile.ts) and the step 5 UI all read the same rules, so «too old»,
 * «outside the requested years» and «not needed» are decided in one place, from data.
 *
 * Business rules (freshness, periods) are deliberately NOT given to the model as decisions:
 * the model reports what a document is and what it says; whether that is a problem is
 * HYPOTEQ's call, made here where it can be changed and tested without touching a prompt.
 */

import { REQ, getRequirement, type RequirementDef } from "@/lib/funnel-v3/requirements";

export type Lang4 = "de" | "fr" | "it" | "en";

export interface V3FieldSpec {
  /** Key in `V3Analysis.fields`; for requirement types exactly the German keys of `REQ[].fields`. */
  key: string;
  /** What to read, for the model (English). */
  hint?: string;
}

/**
 * When a document is too old for its purpose (spec 4.2 «Veraltet»).
 *  - maxAgeMonths: the document date may be at most this old (Grundbuchauszug: 6 months).
 *  - minYear:      the year the document covers must be at least `now.year - yearsBack`
 *                  («aktuelle Steuererklärung»).
 *  - expiry:       the named field holds an expiry date that must not have passed (ID).
 */
export type FreshnessRule =
  | { kind: "maxAgeMonths"; months: number }
  | { kind: "minYear"; yearsBack: number }
  | { kind: "expiry"; field: string };

export interface V3DocType {
  /** A REQ id (`grundbuch`) or a not-needed id (`nn_steuerrechnung`). Stored with the analysis. */
  id: string;
  kind: "requirement" | "notneeded";
  /** German label (stored, shown in «Weitere Dateien» for not-needed types). */
  labelDe: string;
  /**
   * Documents that only differ by WHOSE they are share a family: a passport is a passport,
   * whether it is a borrower's (P2), the Solidarbürge's (P14) or the signatory's (J2). The
   * model is offered only the family head; placement picks the instance by the person.
   */
  family: string;
  /** How customers and issuers name it, in all four funnel languages. */
  aliases: Record<Lang4, string[]>;
  /** What it looks like, for the model (English). */
  describe: string;
  fields: V3FieldSpec[];
  freshness?: FreshnessRule[];
  /**
   * The requirement asks for the last `years` complete years (Lohnausweise der letzten 3 Jahre).
   * A file for another year is kept as «Überzählig» (spec 4.3), not counted. Placement rule.
   */
  period?: { years: number };
  /** What to read for the stored file name (spec 5.1). */
  naming: { person: boolean; bank: boolean; date: "date" | "year" | "none" };
  /** When the model should leave a remark for the bank (spec 3 Schritt 6 «Hinweise»). */
  noteWhen?: string;
  /** German reason shown under «Weitere Dateien» for a not-needed type. */
  notNeededReason?: string;
}

const a = (de: string[], fr: string[], it: string[], en: string[]): Record<Lang4, string[]> => ({ de, fr, it, en });

const ID_FIELDS_HINTS: Record<string, string> = {
  Name: "family name as printed",
  Vornamen: "all given names as printed",
  Geburtsdatum: "date of birth, DD.MM.YYYY",
  "Nationalität": "nationality",
  Dokumentart: "Pass, Identitätskarte or Ausländerausweis (with permit letter, e.g. «Ausweis C»)",
  "Gültig bis": "expiry date, DD.MM.YYYY",
};

/** Hints for the demo-specific keys of REQ[].fields, so they generalise beyond the Gerber case. */
const FIELD_HINTS: Record<string, string> = {
  ...ID_FIELDS_HINTS,
  "Bruttolohn 2025": "gross salary (Bruttolohn, Ziffer 8) of 2025 — only from a certificate for 2025, else null",
  "Bruttolohn 2024": "gross salary (Bruttolohn, Ziffer 8) of 2024 — only from a certificate for 2024, else null",
  "Bruttolohn 2023": "gross salary (Bruttolohn, Ziffer 8) of 2023 — only from a certificate for 2023, else null",
  "Verkaufspreis 2024": "asking or sale price as printed, with CHF",
  "Zins Q1 2026": "interest amount of the most recent billed period, with the period",
  "Ablösedatum": "date the current mortgage (tranche or framework) can be redeemed — end of the fixed term / maturity, DD.MM.YYYY; null when the document names none",
  "Saldo per 31.12.2025": "fund balance at the most recent closing date, with that date",
  "Beiträge 2025": "contributions paid in the year the certificate covers, with the year",
  "Rückkaufswert per 09.01.2026": "surrender value (Rückkaufswert) with the date it refers to",
  "Ausstellungsdatum": "issue date of the extract, DD.MM.YYYY",
  "Grundpfandrechte": "registered mortgage notes (Schuldbriefe) with amount and creditor",
  "Unterschrift": "«vorhanden» when the form is signed, else «fehlt»",
  "Begünstigte Bank": "bank the policy is pledged or assigned to, if any",
  "ZEK-relevant": "«ja» when the contract is a consumer credit reported to the ZEK",
};

interface ReqTypeInput {
  family?: string;
  aliases: Record<Lang4, string[]>;
  describe: string;
  /** Only for requirements whose REQ[].fields is empty. */
  fields?: string[];
  freshness?: FreshnessRule[];
  period?: { years: number };
  naming?: Partial<V3DocType["naming"]>;
  noteWhen?: string;
}

/**
 * Per requirement: aliases, description and rules. Defaults are documented where they are a
 * HYPOTEQ decision the spec leaves open (marked «default»).
 */
const REQ_INPUT: Record<string, ReqTypeInput> = {
  // ---- Zum Objekt --------------------------------------------------------------------
  fotos: {
    aliases: a(["Fotos", "Objektfotos", "Bilder der Liegenschaft"], ["Photos du bien", "Photos de l'immeuble"], ["Foto dell'immobile", "Fotografie"], ["Property photos", "Pictures of the property"]),
    describe: "Photographs of the property, inside and/or outside (images or a PDF of photos).",
    naming: { date: "year" },
  },
  verkaufsdoku: {
    aliases: a(["Verkaufsdokumentation", "Verkaufsprospekt", "Exposé", "Verkaufsunterlagen"], ["Dossier de vente", "Documentation de vente", "Plaquette de vente"], ["Documentazione di vendita", "Dossier di vendita", "Prospetto di vendita"], ["Sales documentation", "Sales brochure", "Exposé"]),
    describe: "Sales brochure / exposé of an agent or seller describing the property, usually with photos, plans and price.",
    naming: { date: "date" },
  },
  stwe_plan: {
    aliases: a(["Grundrisspläne", "Baupläne", "Aufteilungspläne", "Nettowohnfläche"], ["Plans du bien", "Plans de construction", "Plans d'étage", "Surface habitable nette"], ["Planimetrie", "Piani di costruzione", "Superficie abitabile netta"], ["Floor plans", "Building plans", "Net living area"]),
    describe: "Floor plans / building plans of the property or of the condominium unit (Aufteilungspläne), often with areas.",
    naming: { date: "none" },
  },
  grundbuch: {
    aliases: a(["Grundbuchauszug", "Auszug aus dem Grundbuch", "Grundstückbeschreibung"], ["Extrait du registre foncier", "Extrait RF"], ["Estratto del registro fondiario", "Estratto RF"], ["Land register extract", "Land registry extract"]),
    describe: "Official extract of the Swiss land register (Grundbuch) for a parcel or condominium unit: owner, description, servitudes, mortgage notes.",
    freshness: [{ kind: "maxAgeMonths", months: 6 }],
    naming: { date: "date" },
  },
  gvz: {
    aliases: a(["Gebäudeversicherungspolice", "Gebäudeversicherungsausweis", "GVZ-Police", "Versicherungsnachweis Gebäude", "Kubatur"], ["Police d'assurance immobilière", "Assurance bâtiment", "ECA", "Attestation d'assurance du bâtiment"], ["Polizza di assicurazione dello stabile", "Assicurazione fabbricati"], ["Building insurance policy", "Building insurance certificate"]),
    describe: "Policy or certificate of the cantonal (or private) building insurance stating insured value and building volume (Kubatur).",
    naming: { date: "date" },
  },
  kaufvertrag: {
    aliases: a(["Kaufvertrag", "Kaufvertragsentwurf", "öffentliche Urkunde Kauf"], ["Contrat de vente", "Acte de vente", "Projet d'acte de vente"], ["Contratto di compravendita", "Atto di compravendita", "Bozza del contratto di compravendita"], ["Purchase contract", "Sale and purchase agreement", "Draft purchase contract"]),
    describe: "Contract of sale of the property, draft or notarised original (a draft purchase contract IS this type).",
    fields: ["Käufer", "Verkäufer", "Objekt", "Kaufpreis", "Datum"],
    naming: { date: "date" },
  },
  reservation: {
    aliases: a(["Reservationsvertrag", "Reservationsvereinbarung"], ["Contrat de réservation", "Convention de réservation"], ["Contratto di riservazione", "Accordo di prenotazione"], ["Reservation agreement", "Reservation contract"]),
    describe: "Reservation agreement for a property or unit, usually with a reservation fee.",
    fields: ["Verkäufer", "Käufer", "Objekt", "Reservationsbetrag", "Datum"],
    naming: { date: "date" },
  },
  reservation_zahlung: {
    aliases: a(["Nachweis Reservationszahlung", "Zahlungsbestätigung Reservation", "Bankauszug Reservation"], ["Preuve du paiement de la réservation", "Avis de débit réservation"], ["Prova del pagamento della riservazione", "Avviso di addebito"], ["Proof of reservation payment", "Payment confirmation"]),
    describe: "Bank statement or debit advice proving the payment of a reservation fee for a property.",
    fields: ["Bank", "Betrag", "Valuta", "Empfänger"],
    naming: { date: "date" },
  },
  baubewilligung: {
    aliases: a(["Baubewilligung", "Baubewilligungsentscheid"], ["Permis de construire", "Autorisation de construire"], ["Licenza edilizia", "Permesso di costruzione"], ["Building permit", "Planning permission"]),
    describe: "Decision of a municipality granting a building permit.",
    fields: ["Gemeinde", "Bauvorhaben", "Bewilligt am"],
    naming: { date: "date" },
  },
  projekt: {
    aliases: a(["Projektpläne", "Baubeschrieb", "Werkvertrag", "Kostenvoranschlag", "Kostenzusammenzug"], ["Plans du projet", "Descriptif de construction", "Contrat d'entreprise", "Devis général"], ["Piani di progetto", "Descrizione della costruzione", "Contratto d'appalto", "Preventivo dei costi"], ["Project plans", "Construction description", "Construction contract", "Cost estimate"]),
    describe: "Project documents of a construction or renovation: plans, construction description, contractor agreement, cost summary, building volume.",
    fields: ["Bauherr", "Objekt", "Gesamtkosten", "Kubatur"],
    naming: { date: "date" },
  },
  stwe_regl: {
    aliases: a(["Begründungsakt", "Stockwerkeigentum", "STWE-Reglement", "Nutzungs- und Verwaltungsreglement", "Wertquoten"], ["Acte constitutif de PPE", "Règlement d'administration et d'utilisation", "PPE", "Quotes-parts"], ["Atto costitutivo PPP", "Regolamento d'uso e d'amministrazione", "PPP", "Quote di valore"], ["Condominium deed", "Condominium regulations", "Value quotas"]),
    describe: "Deed constituting condominium ownership (Stockwerkeigentum / PPE / PPP) with value quotas, or its use and administration regulations.",
    naming: { date: "date" },
  },
  ef: {
    aliases: a(["Erneuerungsfonds", "Auszug Erneuerungsfonds", "Fondsausweis"], ["Fonds de rénovation", "Extrait du fonds de rénovation"], ["Fondo di rinnovamento", "Estratto del fondo di rinnovamento"], ["Renewal fund", "Renovation fund statement"]),
    describe: "Statement of a condominium community's renewal fund (balance, account).",
    naming: { date: "date" },
  },
  mieterspiegel: {
    aliases: a(["Mieterspiegel", "Mietzinsaufstellung", "Mietzinsliste"], ["État locatif", "Liste des loyers"], ["Stato locativo", "Elenco delle pigioni"], ["Rent roll", "Tenant schedule", "Rental income list"]),
    describe: "List of tenants and rents of a rented property.",
    fields: ["Objekt", "Mieteinheiten", "Mietzinseinnahmen pro Jahr", "Stichtag"],
    freshness: [{ kind: "maxAgeMonths", months: 12 }],
    naming: { date: "date" },
  },
  baurecht: {
    aliases: a(["Baurechtsvertrag", "Baurecht", "selbständiges und dauerndes Baurecht"], ["Contrat de droit de superficie", "Droit de superficie", "DDP"], ["Contratto di diritto di superficie", "Diritto di superficie"], ["Building lease agreement", "Ground lease", "Right of superficies"]),
    describe: "Contract granting a building right (Baurecht / droit de superficie / diritto di superficie) with duration and ground rent.",
    fields: ["Baurechtsgeber", "Baurechtsnehmer", "Dauer bis", "Baurechtszins"],
    naming: { date: "date" },
  },
  angebote: {
    aliases: a(["Finanzierungsangebot", "Hypothekarofferte", "Offerte"], ["Offre de financement", "Offre hypothécaire"], ["Offerta di finanziamento", "Offerta ipotecaria"], ["Financing offer", "Mortgage offer"]),
    describe: "A bank's or insurer's offer for a mortgage on this property (amount, rate, term).",
    fields: ["Bank", "Betrag", "Zinssatz", "Laufzeit", "Gültig bis"],
    naming: { date: "date" },
  },

  // ---- Bestehende Hypothek -----------------------------------------------------------
  hyp_rahmen: {
    aliases: a(["Hypothekarvertrag", "Rahmenvertrag", "Kreditvertrag Hypothek"], ["Contrat hypothécaire", "Contrat-cadre"], ["Contratto ipotecario", "Contratto quadro"], ["Mortgage agreement", "Framework agreement"]),
    describe: "Existing mortgage framework agreement with the current lender.",
    naming: { bank: true, date: "date" },
  },
  hyp_sicher: {
    aliases: a(["Sicherungsvereinbarung", "Schuldbrief", "Sicherungsübereignung", "Register-Schuldbrief"], ["Convention de sûreté", "Cédule hypothécaire", "Cédule de registre"], ["Convenzione di garanzia", "Cartella ipotecaria", "Cartella ipotecaria registrale"], ["Security agreement", "Mortgage note"]),
    describe: "Security agreement transferring mortgage notes (Schuldbriefe / cédules / cartelle) to the current lender, or the mortgage note itself.",
    naming: { bank: true, date: "date" },
  },
  hyp_zins: {
    aliases: a(["Zinsabrechnung", "Zinsausweis Hypothek", "Hypothekarzinsabrechnung"], ["Décompte d'intérêts", "Avis d'intérêts hypothécaires"], ["Conteggio degli interessi", "Conteggio interessi ipotecari"], ["Interest statement", "Mortgage interest statement"]),
    describe: "The lender's most recent interest statement of the existing mortgage (product, capital, rate, term).",
    freshness: [{ kind: "maxAgeMonths", months: 12 }],
    naming: { bank: true, date: "date" },
  },

  // ---- Zur Person --------------------------------------------------------------------
  vollmacht: {
    aliases: a(["Auskunftsermächtigung", "Vollmacht HYPOTEQ", "Einwilligung Bonitätsprüfung"], ["Autorisation de renseignements", "Procuration HYPOTEQ"], ["Autorizzazione a fornire informazioni", "Procura HYPOTEQ"], ["Authorisation to obtain information", "HYPOTEQ power of attorney"]),
    describe: "HYPOTEQ's signed form authorising it to obtain information about the applicant.",
    naming: { person: true, date: "date" },
  },
  id: {
    aliases: a(["Pass", "Identitätskarte", "ID", "Ausländerausweis", "Aufenthaltsbewilligung"], ["Passeport", "Carte d'identité", "Permis de séjour"], ["Passaporto", "Carta d'identità", "Permesso di dimora"], ["Passport", "Identity card", "Residence permit"]),
    describe: "Passport, identity card or foreigner's residence permit of a person (front and back).",
    freshness: [{ kind: "expiry", field: "Gültig bis" }],
    naming: { person: true, date: "none" },
  },
  lohnausweise: {
    aliases: a(["Lohnausweis", "Lohnausweise", "Formular 11"], ["Certificat de salaire"], ["Certificato di salario"], ["Salary certificate", "Wage statement"]),
    describe: "Swiss annual salary certificate (Lohnausweis, form 11) of one year.",
    period: { years: 3 },
    naming: { person: true, date: "year" },
  },
  lohnabrechnungen: {
    aliases: a(["Lohnabrechnung", "Monatslohnabrechnung", "Salärabrechnung"], ["Fiche de salaire", "Décompte de salaire"], ["Conteggio dello stipendio", "Busta paga"], ["Payslip", "Monthly pay statement"]),
    describe: "Monthly payslip(s) — one or several months in one file.",
    freshness: [{ kind: "maxAgeMonths", months: 4 }],
    naming: { person: true, date: "date" },
  },
  anstellung: {
    aliases: a(["Anstellungsvertrag", "Arbeitsvertrag"], ["Contrat de travail"], ["Contratto di lavoro"], ["Employment contract"]),
    describe: "Employment contract between an employer and the person.",
    naming: { person: true, date: "date" },
  },
  pk: {
    aliases: a(["Pensionskassenausweis", "Vorsorgeausweis", "BVG-Ausweis", "Versicherungsausweis Pensionskasse"], ["Certificat de prévoyance", "Certificat LPP", "Attestation de caisse de pension"], ["Certificato di previdenza", "Certificato LPP", "Certificato della cassa pensione"], ["Pension fund certificate", "BVG certificate"]),
    describe: "Annual occupational pension fund certificate (2nd pillar, BVG / LPP) of the insured person.",
    freshness: [{ kind: "maxAgeMonths", months: 18 }],
    naming: { person: true, date: "date" },
  },
  abschluss_se: {
    aliases: a(["Bilanz", "Erfolgsrechnung", "Jahresrechnung", "Revisionsbericht", "Selbständigerwerbend"], ["Bilan", "Compte de résultat", "Comptes annuels", "Rapport de révision"], ["Bilancio", "Conto economico", "Conti annuali", "Rapporto di revisione"], ["Balance sheet", "Income statement", "Annual accounts", "Audit report"]),
    describe: "Balance sheet and income statement of a self-employed person's business for one year, possibly with audit report.",
    fields: ["Firma", "Geschäftsjahr", "Umsatz", "Reingewinn"],
    period: { years: 3 },
    naming: { person: true, date: "year" },
  },
  rente: {
    aliases: a(["Rentenbescheinigung", "Rentenverfügung", "AHV-Rentenverfügung", "Rentenausweis PK"], ["Attestation de rente", "Décision de rente AVS"], ["Attestato di rendita", "Decisione di rendita AVS"], ["Pension statement", "AHV pension decision"]),
    describe: "Statement of a retirement pension paid by the AHV/AVS or a pension fund.",
    fields: ["Rentenart", "Rente pro Monat", "Gültig ab"],
    naming: { person: true, date: "date" },
  },
  steuer: {
    aliases: a(["Steuererklärung", "Steuererklärung natürliche Personen", "Wertschriftenverzeichnis"], ["Déclaration d'impôt", "Déclaration fiscale"], ["Dichiarazione d'imposta", "Dichiarazione fiscale"], ["Tax return"]),
    describe: "A private person's tax return (as filed) for one tax year, with assets, debts and income.",
    freshness: [{ kind: "minYear", yearsBack: 2 }],
    naming: { person: true, date: "year" },
  },
  ahv_voraus: {
    aliases: a(["Rentenvorausberechnung", "AHV-Rentenvorausberechnung"], ["Calcul anticipé de la rente AVS", "Estimation de rente AVS"], ["Calcolo anticipato della rendita AVS"], ["AHV pension forecast", "Pension projection"]),
    describe: "AHV/AVS compensation office's forecast of a future old-age pension.",
    fields: ["Versicherte Person", "Voraussichtliche Rente pro Monat", "Rentenbeginn"],
    naming: { person: true, date: "date" },
  },
  unterhalt: {
    aliases: a(["Unterhaltsvereinbarung", "Elternvereinbarung", "Scheidungskonvention", "Unterhaltsvertrag"], ["Convention d'entretien", "Convention parentale", "Convention de divorce"], ["Convenzione di mantenimento", "Accordo parentale", "Convenzione di divorzio"], ["Maintenance agreement", "Child support agreement", "Divorce settlement"]),
    describe: "Agreement or court decision about maintenance (alimony / child support) payments.",
    naming: { person: true, date: "year" },
    noteWhen: "the agreement states monthly amounts that affect affordability (e.g. «CHF 1'400 pro Monat für zwei Kinder»)",
  },
  kredit: {
    aliases: a(["Kreditvertrag", "Privatkredit", "Konsumkredit", "Kleinkredit"], ["Contrat de crédit", "Crédit privé", "Crédit à la consommation"], ["Contratto di credito", "Credito privato", "Credito al consumo"], ["Loan agreement", "Personal loan", "Consumer credit"]),
    describe: "Consumer / private credit agreement (not a mortgage, not a leasing).",
    naming: { person: true, date: "date" },
    noteWhen: "always: state the remaining debt and whether it is to be repaid with the financing (e.g. «Wird mit der Erhöhung abgelöst»), when the document or context says so",
  },
  leasing: {
    aliases: a(["Leasingvertrag", "Autoleasing"], ["Contrat de leasing", "Leasing"], ["Contratto di leasing", "Leasing"], ["Lease agreement", "Car leasing"]),
    describe: "Leasing contract (usually a car) with monthly rate and remaining term.",
    naming: { person: true, date: "date" },
    noteWhen: "always: monthly rate and remaining term in one short sentence",
  },
  b_id: {
    family: "id",
    aliases: a(["Pass Solidarbürge", "ID Bürge"], ["Passeport de la caution solidaire"], ["Passaporto del fideiussore solidale"], ["Joint guarantor's passport"]),
    describe: "Passport / identity card of the joint and several guarantor (Solidarbürge).",
    fields: Object.keys(ID_FIELDS_HINTS),
    freshness: [{ kind: "expiry", field: "Gültig bis" }],
    naming: { person: true, date: "none" },
  },
  b_steuer: {
    family: "steuer",
    aliases: a(["Steuererklärung Solidarbürge"], ["Déclaration d'impôt de la caution solidaire"], ["Dichiarazione d'imposta del fideiussore solidale"], ["Joint guarantor's tax return"]),
    describe: "Tax return of the joint and several guarantor.",
    fields: ["Steuerjahr", "Kanton", "Zivilstand", "Kinder", "Liegenschaft"],
    freshness: [{ kind: "minYear", yearsBack: 2 }],
    naming: { person: true, date: "year" },
  },
  b_lohn: {
    family: "lohnausweise",
    aliases: a(["Lohnausweis Solidarbürge"], ["Certificat de salaire de la caution solidaire"], ["Certificato di salario del fideiussore solidale"], ["Joint guarantor's salary certificate"]),
    describe: "Salary certificate of the joint and several guarantor.",
    fields: ["Arbeitgeber", "AHV-Nr.", "Bruttolohn 2025", "Bruttolohn 2024", "Bruttolohn 2023"],
    period: { years: 3 },
    naming: { person: true, date: "year" },
  },
  hr: {
    aliases: a(["Handelsregisterauszug", "HR-Auszug"], ["Extrait du registre du commerce", "Extrait RC"], ["Estratto del registro di commercio", "Estratto RC"], ["Commercial register extract", "Trade register extract"]),
    describe: "Extract of the Swiss commercial register for a company.",
    fields: ["Firma", "UID", "Sitz", "Zeichnungsberechtigte", "Auszug vom"],
    freshness: [{ kind: "maxAgeMonths", months: 6 }],
    naming: { person: true, date: "date" },
  },
  wb: {
    family: "id",
    aliases: a(["Pass zeichnungsberechtigte Person", "ID Geschäftsführer"], ["Passeport de la personne autorisée à signer"], ["Passaporto della persona con diritto di firma"], ["Authorised signatory's passport"]),
    describe: "Passport / identity card of the company's authorised signatory.",
    fields: Object.keys(ID_FIELDS_HINTS),
    freshness: [{ kind: "expiry", field: "Gültig bis" }],
    naming: { person: true, date: "none" },
  },
  jahresabschluss: {
    aliases: a(["Jahresabschluss", "Jahresrechnung Gesellschaft", "Bilanz und Erfolgsrechnung AG/GmbH"], ["Comptes annuels de la société", "Bilan et compte de résultat"], ["Conti annuali della società", "Bilancio e conto economico"], ["Company annual accounts", "Financial statements"]),
    describe: "Annual financial statements (balance sheet and income statement) of a company for one financial year.",
    fields: ["Firma", "Geschäftsjahr", "Bilanzsumme", "Eigenkapital", "Reingewinn"],
    period: { years: 3 },
    naming: { person: true, date: "year" },
  },
  zwischenbilanz: {
    aliases: a(["Zwischenbilanz", "Zwischenabschluss"], ["Bilan intermédiaire", "Comptes intermédiaires"], ["Bilancio intermedio", "Chiusura intermedia"], ["Interim balance sheet", "Interim accounts"]),
    describe: "Interim (mid-year) balance sheet of a company.",
    fields: ["Firma", "Stichtag", "Eigenkapital"],
    freshness: [{ kind: "maxAgeMonths", months: 12 }],
    naming: { person: true, date: "date" },
  },
  betreibung: {
    aliases: a(["Betreibungsauszug", "Betreibungsregisterauszug"], ["Extrait du registre des poursuites", "Extrait des poursuites"], ["Estratto del registro delle esecuzioni", "Estratto esecuzioni"], ["Debt collection register extract", "Debt enforcement extract"]),
    describe: "Extract of the debt collection (Betreibung / poursuites / esecuzioni) register.",
    fields: ["Schuldner", "Betreibungen", "Ausgestellt am"],
    // default: 3 months, the usual bank requirement for an «aktueller» Betreibungsauszug.
    freshness: [{ kind: "maxAgeMonths", months: 3 }],
    naming: { person: true, date: "date" },
  },
  steuer_jp: {
    aliases: a(["Steuererklärung Gesellschaft", "Steuererklärung juristische Person"], ["Déclaration d'impôt de la société", "Déclaration fiscale personne morale"], ["Dichiarazione d'imposta della società", "Dichiarazione persone giuridiche"], ["Company tax return", "Corporate tax return"]),
    describe: "Tax return of a company (legal entity): taxable profit and capital.",
    fields: ["Firma", "Steuerjahr", "Steuerbarer Gewinn", "Steuerbares Kapital"],
    freshness: [{ kind: "minYear", yearsBack: 2 }],
    naming: { person: true, date: "year" },
  },

  // ---- Eigenmittel & Vorsorge --------------------------------------------------------
  vermoegen: {
    aliases: a(["Vermögensausweis", "Kontoauszug", "Depotauszug", "Eigenmittelnachweis", "Saldobestätigung"], ["Relevé de compte", "Relevé de fortune", "Justificatif des fonds propres"], ["Estratto conto", "Estratto patrimoniale", "Prova dei fondi propri"], ["Bank statement", "Asset statement", "Proof of equity"]),
    describe: "Bank or securities statement showing the applicant's available assets (own funds for the financing).",
    // default: 3 months — own funds have to be shown as they are now.
    freshness: [{ kind: "maxAgeMonths", months: 3 }],
    naming: { date: "date" },
  },
  s3a: {
    aliases: a(["Säule 3a Bescheinigung", "3a-Bescheinigung", "Bescheinigung gebundene Vorsorge"], ["Attestation 3e pilier A", "Attestation de prévoyance liée 3a"], ["Attestazione pilastro 3a", "Attestazione previdenza vincolata"], ["Pillar 3a certificate"]),
    describe: "Annual certificate of a pillar 3a account or policy (contributions of a year), as used for taxes.",
    freshness: [{ kind: "minYear", yearsBack: 2 }],
    naming: { date: "year" },
    noteWhen: "the 3a assets are pledged or assigned to a bank (e.g. «3a-Konto an ZKB verpfändet»)",
  },
  police: {
    aliases: a(["Vorsorgepolice 3a", "Lebensversicherung 3a", "Wertmitteilung", "Rückkaufswert"], ["Police de prévoyance 3a", "Assurance vie 3a", "Valeur de rachat"], ["Polizza di previdenza 3a", "Assicurazione vita 3a", "Valore di riscatto"], ["Pillar 3a insurance policy", "Surrender value statement"]),
    describe: "A pillar 3a life insurance policy, or its annual statement of value (Wertmitteilung / surrender value).",
    freshness: [{ kind: "maxAgeMonths", months: 15 }],
    naming: { date: "date" },
    noteWhen: "the policy is pledged or assigned to a bank (e.g. «Police ist an die ZKB verpfändet – bei Ablösung an die neue Bank zu übertragen»)",
  },
  pkvorbezug: {
    aliases: a(["PK-Vorbezug", "Bestätigung Vorbezug", "Verpfändung Pensionskasse", "WEF-Vorbezug"], ["Versement anticipé EPL", "Mise en gage LPP", "Retrait anticipé caisse de pension"], ["Prelievo anticipato PPA", "Costituzione in pegno LPP"], ["Pension fund withdrawal confirmation", "Pension fund pledge"]),
    describe: "Pension fund's confirmation of an early withdrawal or pledge for home ownership (WEF / EPL / PPA).",
    fields: ["Vorsorgeeinrichtung", "Versicherte Person", "Betrag", "Art"],
    naming: { date: "date" },
  },
  schenkung: {
    aliases: a(["Schenkungsvertrag", "Schenkungsbestätigung"], ["Contrat de donation", "Acte de donation"], ["Contratto di donazione", "Atto di donazione"], ["Gift agreement", "Deed of gift"]),
    describe: "Contract or confirmation of a gift of money for the financing.",
    fields: ["Schenkgeber", "Beschenkte", "Betrag", "Datum"],
    naming: { date: "date" },
  },
  erbe: {
    aliases: a(["Erbschaftsbestätigung", "Erbvorbezug", "Erbteilungsvertrag", "Erbbescheinigung"], ["Certificat d'héritier", "Avancement d'hoirie", "Partage successoral"], ["Certificato ereditario", "Anticipo ereditario", "Divisione ereditaria"], ["Certificate of inheritance", "Advance on inheritance"]),
    describe: "Confirmation of an inheritance or an advance on inheritance.",
    fields: ["Erblasser", "Erben", "Betrag"],
    naming: { date: "date" },
  },
  darlehen: {
    aliases: a(["Darlehensvertrag", "Privatdarlehen", "Familiendarlehen"], ["Contrat de prêt", "Prêt privé"], ["Contratto di mutuo", "Prestito privato"], ["Loan agreement (private)", "Family loan"]),
    describe: "Private loan agreement (e.g. from family) contributing to the own funds — not a consumer credit from a bank.",
    fields: ["Darlehensgeber", "Darlehensnehmer", "Betrag", "Zins", "Rückzahlung"],
    naming: { date: "date" },
    noteWhen: "repayment terms burden affordability",
  },
};

/** Documents customers upload that the bank does not need (spec 4.3 «Nicht benötigt»). */
const NOT_NEEDED: Omit<V3DocType, "kind" | "family" | "naming" | "fields">[] = [
  {
    id: "nn_steuerrechnung", labelDe: "Steuerrechnung",
    aliases: a(["Steuerrechnung", "Schlussrechnung Steuern", "provisorische Steuerrechnung"], ["Bordereau d'impôt", "Décompte d'impôt", "Facture d'impôt"], ["Fattura d'imposta", "Conteggio d'imposta"], ["Tax bill", "Tax invoice"]),
    describe: "A tax authority's bill or final/provisional tax invoice (NOT the tax return itself).",
    notNeededReason: "Steuerrechnungen werden für die Prüfung nicht benötigt.",
  },
  {
    id: "nn_nebenkosten", labelDe: "Nebenkostenabrechnung",
    aliases: a(["Nebenkostenabrechnung", "Heiz- und Nebenkostenabrechnung"], ["Décompte des charges", "Décompte de chauffage et frais accessoires"], ["Conteggio delle spese accessorie", "Conteggio riscaldamento"], ["Service charge statement", "Utility cost statement"]),
    describe: "Statement of ancillary / heating costs of a flat or building.",
    notNeededReason: "Für die Finanzierungsprüfung nicht erforderlich.",
  },
  {
    id: "nn_betriebskosten", labelDe: "Betriebskostenabrechnung",
    aliases: a(["Betriebskostenabrechnung", "Jahresrechnung STWEG", "Verwaltungsabrechnung"], ["Décompte des frais d'exploitation", "Comptes de la PPE"], ["Conteggio dei costi d'esercizio", "Conti della PPP"], ["Operating cost statement", "Condominium annual accounts"]),
    describe: "Operating cost statement or annual accounts of a building / condominium community (not the renewal fund statement).",
    notNeededReason: "Für die Finanzierungsprüfung nicht erforderlich.",
  },
  {
    id: "nn_entwurf", labelDe: "Entwurf",
    aliases: a(["Entwurf", "nicht eingereichte Fassung"], ["Brouillon", "Projet non déposé"], ["Bozza", "Versione non inoltrata"], ["Draft", "Unsubmitted version"]),
    describe: "A draft or unsubmitted version of a document (e.g. a tax return marked «Entwurf»). A draft PURCHASE CONTRACT is NOT this type — it is «kaufvertrag».",
    notNeededReason: "Entwurf, nicht eingereichte Fassung. Nicht erforderlich.",
  },
  {
    id: "nn_verpfaendung", labelDe: "Verpfändungserklärung",
    aliases: a(["Verpfändungserklärung", "Verpfändungsvertrag", "Abtretung Vorsorge"], ["Acte de nantissement", "Déclaration de mise en gage"], ["Atto di costituzione in pegno", "Dichiarazione di pegno"], ["Pledge agreement", "Pledge declaration"]),
    describe: "A pledge / assignment declaration of pillar 3a or insurance assets to a bank, WITHOUT the policy or certificate itself (a pension fund pledge confirmation is «pkvorbezug»).",
    notNeededReason: "Verpfändung zugunsten der bisherigen Bank – wird mit der Ablösung hinfällig.",
  },
  {
    id: "nn_kontoauszug", labelDe: "Kontoauszug ohne Bezug",
    aliases: a(["Kreditkartenabrechnung", "Kontoauszug Zahlungsverkehr"], ["Relevé de carte de crédit", "Relevé de transactions"], ["Estratto carta di credito", "Estratto movimenti"], ["Credit card statement", "Transaction statement"]),
    describe: "A credit card statement or an account statement that shows only everyday transactions — neither own funds nor a reservation payment.",
    notNeededReason: "Zeigt weder Eigenmittel noch eine Reservationszahlung. Nicht erforderlich.",
  },
  {
    id: "nn_rechnung", labelDe: "Rechnung / Quittung",
    aliases: a(["Rechnung", "Quittung", "Handwerkerrechnung"], ["Facture", "Quittance"], ["Fattura", "Ricevuta"], ["Invoice", "Receipt"]),
    describe: "An invoice or receipt (craftsmen, utilities, purchases).",
    notNeededReason: "Rechnungen werden für die Prüfung nicht benötigt.",
  },
  {
    id: "nn_versicherung", labelDe: "Andere Versicherungspolice",
    aliases: a(["Hausratversicherung", "Haftpflichtversicherung", "Krankenkasse", "Versicherungspolice"], ["Assurance ménage", "Assurance RC", "Caisse maladie"], ["Assicurazione economia domestica", "Assicurazione RC", "Cassa malati"], ["Household insurance", "Liability insurance", "Health insurance"]),
    describe: "An insurance policy that is neither the building insurance nor a pillar 3a policy (household, liability, health, car).",
    notNeededReason: "Für die Finanzierungsprüfung nicht erforderlich.",
  },
  {
    id: "nn_korrespondenz", labelDe: "Korrespondenz",
    aliases: a(["Brief", "Begleitschreiben", "E-Mail"], ["Lettre", "Courrier", "Courriel"], ["Lettera", "Corrispondenza", "E-mail"], ["Letter", "Cover letter", "E-mail"]),
    describe: "A letter, cover note or e-mail printout that is not itself one of the documents above.",
    notNeededReason: "Korrespondenz wird für die Prüfung nicht benötigt.",
  },
];

function reqType(def: RequirementDef): V3DocType {
  const input = REQ_INPUT[def.id];
  if (!input) throw new Error(`No recognition entry for requirement ${def.id}`);
  // REQ[].fields is the single source of the keys; a catalogue list is only a fallback for
  // the requirements the prototype had no extract for.
  const keys = def.fields.length ? [...def.fields] : input.fields ?? [];
  const person = def.personKind !== "none" && def.personKind !== "bank";
  return {
    id: def.id,
    kind: "requirement",
    labelDe: def.labelDe,
    family: input.family ?? def.id,
    aliases: input.aliases,
    describe: input.describe,
    fields: keys.map((key) => ({ key, ...(FIELD_HINTS[key] ? { hint: FIELD_HINTS[key] } : {}) })),
    freshness: input.freshness,
    period: input.period,
    naming: {
      person: input.naming?.person ?? person,
      bank: input.naming?.bank ?? def.personKind === "bank",
      date: input.naming?.date ?? (def.datedName ? "date" : "none"),
    },
    noteWhen: input.noteWhen,
  };
}

export const V3_DOC_TYPES: readonly V3DocType[] = [
  ...REQ.map(reqType),
  ...NOT_NEEDED.map((t): V3DocType => ({
    ...t,
    kind: "notneeded",
    family: t.id,
    fields: [],
    naming: { person: false, bank: false, date: "none" },
  })),
];

const BY_ID = new Map(V3_DOC_TYPES.map((t) => [t.id, t]));

export function v3DocType(id: string | null | undefined): V3DocType | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The types the model chooses between: every family head (members are resolved by person). */
export function classifiableTypes(): V3DocType[] {
  return V3_DOC_TYPES.filter((t) => t.family === t.id);
}

/** Requirement ids a recognised type can satisfy: itself and the other members of its family. */
export function familyMembers(typeId: string): string[] {
  const t = v3DocType(typeId);
  if (!t) return [];
  return V3_DOC_TYPES.filter((x) => x.kind === "requirement" && x.family === t.family).map((x) => x.id);
}

export function isRequirementType(id: string | null | undefined): boolean {
  return v3DocType(id)?.kind === "requirement" && Boolean(getRequirement(id!));
}

// ---- Dates and freshness ---------------------------------------------------------------

/** `2026-01-15`, `15.01.2026`, `2026-01`, `2026` → a Date (first day for partial dates), or null. */
export function parseDocDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return utc(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return utc(+m[1], +m[2], 1);
  m = s.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  if (m) return utc(+m[1], 1, 1);
  return null;
}

function utc(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(date.getTime()) ? null : date;
}

/** The year a document covers or carries, from its date. */
export function docYear(raw: string | null | undefined): number | null {
  const d = parseDocDate(raw);
  return d ? d.getUTCFullYear() : null;
}

/** Whole months between two dates (date → now); negative when the date lies ahead. */
export function monthsBetween(from: Date, now: Date): number {
  let months = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + (now.getUTCMonth() - from.getUTCMonth());
  if (now.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

export type OutdatedReason =
  | { code: "maxAge"; months: number; date: string }
  | { code: "year"; year: number }
  | { code: "expired"; date: string };

/** Why the document is too old for its purpose, or null. Pure; `now` is passed in. */
export function freshnessProblem(
  typeId: string | null | undefined,
  docDate: string | null | undefined,
  fields: Record<string, { value: string | number | null } | undefined> = {},
  now: Date = new Date()
): OutdatedReason | null {
  const t = v3DocType(typeId);
  if (!t?.freshness) return null;
  for (const rule of t.freshness) {
    if (rule.kind === "maxAgeMonths") {
      const d = parseDocDate(docDate);
      // A year alone («2025») cannot prove a 6-month deadline either way: not flagged.
      if (!d || !/\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}/.test(String(docDate))) continue;
      if (addMonths(d, rule.months).getTime() < startOfDay(now)) {
        return { code: "maxAge", months: rule.months, date: isoDay(d) };
      }
    } else if (rule.kind === "minYear") {
      const y = docYear(docDate);
      if (y !== null && y < now.getUTCFullYear() - rule.yearsBack) return { code: "year", year: y };
    } else if (rule.kind === "expiry") {
      const raw = fields[rule.field]?.value;
      const d = typeof raw === "string" ? parseDocDate(raw) : null;
      // Only a full date counts — «gültig» or a year is not an expiry date.
      if (d && /\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}/.test(String(raw)) && d.getTime() < startOfDay(now)) {
        return { code: "expired", date: isoDay(d) };
      }
    }
  }
  return null;
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}
function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** German sentence for an outdated reason (stored on the row; the UI translates from the code). */
export function outdatedReasonDe(r: OutdatedReason): string {
  switch (r.code) {
    case "maxAge":
      return `Älter als ${r.months} Monate (Dokumentdatum ${formatDe(r.date)}).`;
    case "year":
      return `Nicht aktuell (Jahr ${r.year}).`;
    case "expired":
      return `Abgelaufen am ${formatDe(r.date)}.`;
  }
}

function formatDe(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * The years a period requirement asks for (Lohnausweise der letzten 3 Jahre → 2023–2025 in
 * 2026), or null when the type has no period. Placement rule (spec 4.3 «Überzählig»).
 */
export function requestedYears(typeId: string | null | undefined, now: Date = new Date()): number[] | null {
  const t = v3DocType(typeId);
  if (!t?.period) return null;
  const y = now.getUTCFullYear();
  return Array.from({ length: t.period.years }, (_, i) => y - 1 - i);
}
