/**
 * The document types the AI layer can recognise, and what to pull out of each.
 *
 * Scope is the MVP of spec section 39 — nine types covering most natural-person cases — not
 * the whole forty-key catalog. Widening it means adding entries here; nothing else changes.
 *
 * `funnelKeys` is the piece the spec leaves out. Section 39 names "Pass / ID" as one type
 * while funnelDocumentCatalog has two keys for it (private borrowers, and a company's
 * authorised signatory); the same holds for the tax return and the purchase contract.
 * Without this table a recognised document has no requirement to attach to. It is written
 * out rather than guessed at: near-miss guessing is exactly what left seventeen documents
 * invisible in the Salesforce Dokumenten-Check tab.
 *
 * `fields` follows section 12. `compare: true` marks the ones section 17 says to check
 * against funnel data; the rest are extracted and shown but never argued with.
 *
 * `maxAgeMonths` implements section 25 — deliberately data rather than prompt text, because
 * the spec requires those deadlines to stay configurable.
 */

export interface FieldSpec {
  /** Key in the result's `fields` map. */
  key: string;
  /** German label for the detail view (section 13). */
  label: string;
  kind: "text" | "money" | "date" | "number" | "percent" | "boolean";
  /** Check this against funnel data (section 17). */
  compare?: boolean;
}

export interface DocTypeSpec {
  /** Canonical id. Stable — it ends up inside stored analyses. */
  id: string;
  /** German label shown to staff and customers. */
  label: string;
  /**
   * Leading word of a generated filename (section 11).
   *
   * Stated rather than derived from `label`: taking the first word of "Aktueller
   * Lohnausweis" produces "Aktueller_2025_Max_Muster.pdf", which names the adjective
   * instead of the document. ASCII only — these become filenames.
   */
  filenameBase: string;
  /** Funnel requirement keys this document can satisfy, best match first. */
  funnelKeys: string[];
  fields: FieldSpec[];
  /** Section 25: how recent the document must be. Null when no rule applies. */
  maxAgeMonths?: number | null;
  /** Section 26: a signature is expected on this document. */
  expectsSignature?: boolean;
}

export const DOCUMENT_TYPES: DocTypeSpec[] = [
  {
    id: "identity_document",
    label: "Pass / Identitätskarte / Aufenthaltsbewilligung",
    filenameBase: "Identitaetsdokument",
    funnelKeys: ["funnel.passportIDAllBorrowers", "funnel.passportAuthorizedPersonJur"],
    fields: [
      { key: "lastName", label: "Name", kind: "text", compare: true },
      { key: "firstName", label: "Vorname", kind: "text", compare: true },
      { key: "dateOfBirth", label: "Geburtsdatum", kind: "date", compare: true },
      { key: "nationality", label: "Nationalität", kind: "text" },
      // Section 17 lists the document number as extracted but never compared.
      { key: "documentNumber", label: "Dokumentnummer", kind: "text" },
      { key: "validUntil", label: "Gültig bis", kind: "date" },
      { key: "permitType", label: "Aufenthaltsbewilligung", kind: "text" },
    ],
  },
  {
    id: "salary_certificate",
    label: "Aktueller Lohnausweis",
    filenameBase: "Lohnausweis",
    funnelKeys: ["funnel.salaryStatementBonus"],
    fields: [
      { key: "employee", label: "Arbeitnehmer", kind: "text", compare: true },
      { key: "employer", label: "Arbeitgeber", kind: "text", compare: true },
      { key: "grossAnnualSalary", label: "Bruttojahreslohn", kind: "money", compare: true },
      { key: "netSalary", label: "Nettolohn", kind: "money" },
      { key: "relevantIncome", label: "Massgebendes Einkommen", kind: "money" },
      { key: "bonus", label: "Bonus / unregelmässige Leistungen", kind: "money" },
      { key: "employeeAddress", label: "Adresse Arbeitnehmer", kind: "text" },
      { key: "periodFrom", label: "Beschäftigung von", kind: "date" },
      { key: "periodTo", label: "Beschäftigung bis", kind: "date" },
    ],
  },
  {
    id: "monthly_payslip",
    label: "Monatslohnabrechnung",
    filenameBase: "Lohnabrechnung",
    funnelKeys: ["funnel.monthlyPayslips3"],
    fields: [
      { key: "period", label: "Monat / Periode", kind: "text" },
      { key: "grossSalary", label: "Bruttolohn", kind: "money", compare: true },
      { key: "netSalary", label: "Nettolohn", kind: "money" },
      { key: "employer", label: "Arbeitgeber", kind: "text", compare: true },
      { key: "allowances", label: "Zulagen / Spesen", kind: "money" },
      { key: "employmentRate", label: "Beschäftigungsgrad", kind: "percent" },
    ],
  },
  {
    id: "tax_return",
    label: "Aktuelle Steuererklärung",
    filenameBase: "Steuererklaerung",
    funnelKeys: ["funnel.taxReturnLatest", "funnel.taxReturnLatestJur"],
    fields: [
      { key: "taxableIncome", label: "Steuerbares Einkommen", kind: "money", compare: true },
      { key: "taxableWealth", label: "Steuerbares Vermögen", kind: "money" },
      { key: "totalDebt", label: "Total Schulden", kind: "money" },
      { key: "securities", label: "Wertschriften", kind: "money" },
      { key: "properties", label: "Liegenschaften", kind: "text" },
      { key: "taxYear", label: "Steuerjahr", kind: "number" },
      { key: "canton", label: "Kanton", kind: "text" },
    ],
  },
  {
    id: "own_funds_proof",
    label: "Aufstellung und Nachweis der Eigenmittel",
    filenameBase: "Eigenmittelnachweis",
    funnelKeys: ["funnel.ownFundsProofOfficial", "funnel.ownFundsProofJur"],
    fields: [
      { key: "ownFundsTotal", label: "Eigenmittel total", kind: "money", compare: true },
      { key: "liquidAssets", label: "Liquide Mittel", kind: "money" },
      { key: "pensionFundAssets", label: "Pensionskassenguthaben", kind: "money" },
      { key: "pensionPledge", label: "PK-Verpfändung", kind: "money" },
      { key: "pillar3", label: "Säule 3", kind: "money" },
      { key: "gifts", label: "Schenkungen", kind: "money" },
      { key: "savings", label: "Ersparnisse", kind: "money" },
    ],
  },
  {
    id: "purchase_contract",
    label: "Kaufvertrag",
    filenameBase: "Kaufvertrag",
    funnelKeys: [
      "funnel.purchaseContractDraft",
      "funnel.purchaseOrRenovationContract",
      "funnel.reservationContractDoc",
    ],
    fields: [
      { key: "purchasePrice", label: "Kaufpreis", kind: "money", compare: true },
      { key: "buyer", label: "Käufer", kind: "text", compare: true },
      { key: "seller", label: "Verkäufer", kind: "text" },
      { key: "propertyAddress", label: "Objektadresse", kind: "text", compare: true },
      { key: "purchaseDate", label: "Kaufdatum", kind: "date" },
      { key: "transactionType", label: "Transaktionsart", kind: "text" },
      { key: "paymentTerms", label: "Zahlungsbedingungen", kind: "text" },
    ],
  },
  {
    id: "land_registry_extract",
    label: "Grundbuchauszug",
    filenameBase: "Grundbuchauszug",
    funnelKeys: ["funnel.landRegistryNotOlder6Months", "funnel.landRegistryIfAvailable"],
    // The funnel itself asks for one "nicht älter als 6 Monate" — that rule lives here.
    maxAgeMonths: 6,
    fields: [
      { key: "parcelNumber", label: "Grundstücknummer / Parzelle", kind: "text", compare: true },
      { key: "owner", label: "Eigentümer", kind: "text", compare: true },
      { key: "plotArea", label: "Grundstückfläche", kind: "number" },
      { key: "easements", label: "Dienstbarkeiten", kind: "text" },
      { key: "existingCharges", label: "Bestehende Grundpfandrechte", kind: "money" },
      { key: "issueDate", label: "Ausstellungsdatum", kind: "date" },
    ],
  },
  {
    id: "pension_fund_statement",
    label: "Pensionskassenausweis",
    filenameBase: "Pensionskassenausweis",
    funnelKeys: [
      "funnel.pensionFund3rdPillarBuyback",
      "funnel.pensionCertificatePKAHV",
      "funnel.pensionForecastAHV",
    ],
    fields: [
      { key: "insuredPerson", label: "Versicherte Person", kind: "text", compare: true },
      { key: "pensionFund", label: "Vorsorgeeinrichtung", kind: "text" },
      { key: "vestedBenefits", label: "Freizügigkeitsleistung", kind: "money", compare: true },
      { key: "wefAdvance", label: "Bisheriger WEF-Vorbezug", kind: "money" },
      { key: "retirementPension", label: "Altersrente", kind: "money" },
      { key: "statementDate", label: "Stand per", kind: "date" },
    ],
  },
  {
    id: "mortgage_contract",
    label: "Aktueller Hypothekarvertrag",
    filenameBase: "Hypothekarvertrag",
    funnelKeys: ["funnel.currentMortgageContract"],
    fields: [
      { key: "mortgageAmount", label: "Bestehender Hypothekarbetrag", kind: "money", compare: true },
      { key: "bank", label: "Bank / Institut", kind: "text", compare: true },
      { key: "interestRate", label: "Zinssatz", kind: "percent" },
      { key: "term", label: "Laufzeit", kind: "text" },
      { key: "expiryDate", label: "Ablaufdatum", kind: "date" },
      { key: "amortisation", label: "Amortisation", kind: "money" },
      { key: "noticePeriod", label: "Kündigungsfrist", kind: "text" },
    ],
  },
  {
    id: "authorisation_form",
    label: "HYPOTEQ-Formular Auskunftsermächtigung",
    filenameBase: "Auskunftsermaechtigung",
    funnelKeys: ["funnel.auskunftsermaechtigungDoc"],
    // Section 26: presence of a signature only, never a claim about its legal validity.
    expectsSignature: true,
    fields: [
      { key: "fullName", label: "Name", kind: "text", compare: true },
      { key: "address", label: "Adresse", kind: "text" },
      { key: "dateOfBirth", label: "Geburtsdatum", kind: "date", compare: true },
      { key: "signaturePresent", label: "Unterschrift vorhanden", kind: "boolean" },
      { key: "signatureDate", label: "Unterzeichnungsdatum", kind: "date" },
    ],
  },
];

const BY_ID = new Map(DOCUMENT_TYPES.map((t) => [t.id, t]));

export function docTypeById(id: string): DocTypeSpec | undefined {
  return BY_ID.get(id);
}

/**
 * The types worth offering for a case, given what the funnel actually asked for.
 *
 * Narrowing the candidate list is not an optimisation. A model asked to choose among ten
 * types when only four were requested has six extra ways to be confidently wrong.
 */
export function candidateTypesFor(visibleFunnelKeys: string[]): DocTypeSpec[] {
  const visible = new Set(visibleFunnelKeys);
  return DOCUMENT_TYPES.filter((t) => t.funnelKeys.some((k) => visible.has(k)));
}

/**
 * Which requirement a recognised document satisfies.
 *
 * Prefers a requirement this case was actually shown; falls back to the type's primary key,
 * so a document recognised outside the asked-for set is still identified rather than lost.
 */
export function funnelKeyFor(typeId: string, visibleFunnelKeys: string[]): string | null {
  const spec = BY_ID.get(typeId);
  if (!spec) return null;
  const visible = new Set(visibleFunnelKeys);
  return spec.funnelKeys.find((k) => visible.has(k)) ?? spec.funnelKeys[0] ?? null;
}

/** Whole months between a document's own date and now — the section 25 freshness check. */
export function ageInMonths(documentDate: string, now: Date = new Date()): number | null {
  const then = new Date(documentDate);
  if (Number.isNaN(then.getTime())) return null;
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (now.getDate() < then.getDate()) months -= 1;
  return months;
}
