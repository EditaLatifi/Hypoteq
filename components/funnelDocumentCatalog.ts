/**
 * Catalog of every document the funnel can ask for.
 *
 * The key is the i18n key used in DocumentsStep (`messages/*.json` -> funnel.*), NOT the
 * translated label: labels differ per locale, so a French submission would otherwise
 * produce French identifiers that neither Salesforce nor the completeness check could match.
 *
 * `salesforceField` is one of the ten Dok_*__c booleans that already exist on Case. They
 * were created before this feature was wired up and were entirely unused. Several funnel
 * documents legitimately map onto the same flag (every pension document feeds
 * Dok_Pensionskassenausweis__c), and several have no flag at all.
 *
 * ===========================================================================
 * `requirement`: EVERY document is optional. This is HYPOTEQ's decision — nothing the
 * funnel asks for blocks or chases a customer.
 *
 * CONSEQUENCE, deliberate and accepted: with no required document anywhere, the
 * completeness check can never report a gap. `missing` is always empty, `complete` is
 * always true, so Mail 2b ("fehlende Unterlagen") is never sent and no Nachreichung link
 * is ever minted. Every customer receives Mail 2a instead, including one who uploaded
 * nothing at all.
 *
 * The machinery is intentionally left in place rather than deleted: flipping any single
 * entry below back to "required" revives the check for that document alone.
 * ===========================================================================
 */

export type DocRequirement = "required" | "optional";

export interface DocCatalogEntry {
  /** One of the ten pre-existing Dok_*__c booleans on Case, or null when none fits. */
  salesforceField: string | null;
  requirement: DocRequirement;
}

export const DOCUMENT_CATALOG: Record<string, DocCatalogEntry> = {
  // ---- Authorisation --------------------------------------------------------
  // No Dok_*__c checkbox exists for this one; the Case tracks it through the
  // Dokumenten-Check state instead.
  "funnel.auskunftsermaechtigungDoc":     { salesforceField: null, requirement: "optional" },

  // ---- Added from HYPOTEQ's document-requirements spec (Mai 2026) ------------
  // Dok_Betreibungsregisterauszug__c existed on Case from the start and had never been
  // asked for by the funnel; the spec puts it in the company base set, so it is now wired.
  "funnel.debtCollectionExtractCurrent":  { salesforceField: "Dok_Betreibungsregisterauszug__c", requirement: "optional" },
  // A plain interior/exterior photo set, distinct from the sales documentation and the
  // Baubeschrieb that also carry photos — all three feed the same Case flag.
  "funnel.propertyPhotosInteriorExterior": { salesforceField: "Dok_Fotos_der_Immobilie__c", requirement: "optional" },
  // No Dok_*__c flag exists for these three.
  "funnel.baurechtsvertrag":              { salesforceField: null, requirement: "optional" },
  "funnel.monthlyPayslips3":              { salesforceField: null, requirement: "optional" },
  "funnel.leasingContract":               { salesforceField: null, requirement: "optional" },

  // ---- Identity -------------------------------------------------------------
  "funnel.passportIDAllBorrowers":        { salesforceField: "Dok_Identitaetsdokument__c", requirement: "optional" },
  "funnel.passportAuthorizedPersonJur":   { salesforceField: "Dok_Identitaetsdokument__c", requirement: "optional" },

  // ---- Income / tax ---------------------------------------------------------
  "funnel.salaryStatementBonus":          { salesforceField: "Dok_Lohnausweis__c",         requirement: "optional" },
  "funnel.taxReturnLatest":               { salesforceField: "Dok_Steuererklaerung__c",    requirement: "optional" },
  "funnel.taxReturnLatestJur":            { salesforceField: "Dok_Steuererklaerung__c",    requirement: "optional" },

  // ---- Pension --------------------------------------------------------------
  "funnel.pensionFund3rdPillarBuyback":   { salesforceField: "Dok_Pensionskassenausweis__c", requirement: "optional" },
  "funnel.pensionCertificatePKAHV":       { salesforceField: "Dok_Pensionskassenausweis__c", requirement: "optional" },
  "funnel.pensionForecastAHV":            { salesforceField: "Dok_Pensionskassenausweis__c", requirement: "optional" },

  // ---- Purchase / reservation contract --------------------------------------
  "funnel.purchaseContractDraft":         { salesforceField: "Dok_Kaufvertrag__c",         requirement: "optional" },
  "funnel.purchaseOrRenovationContract":  { salesforceField: "Dok_Kaufvertrag__c",         requirement: "optional" },
  "funnel.reservationContractDoc":        { salesforceField: "Dok_Kaufvertrag__c",         requirement: "optional" },

  // ---- Land registry --------------------------------------------------------
  "funnel.landRegistryNotOlder6Months":   { salesforceField: "Dok_Grundbuchauszug__c",     requirement: "optional" },
  "funnel.landRegistryIfAvailable":       { salesforceField: "Dok_Grundbuchauszug__c",     requirement: "optional" }, // "falls vorhanden"

  // ---- Building insurance ---------------------------------------------------
  "funnel.buildingInsuranceIfAvailable":  { salesforceField: "Dok_Gebaeudeversicherungsausweis__c", requirement: "optional" }, // "falls bereits vorhanden"

  // ---- Photos / floor plans -------------------------------------------------
  "funnel.salesDocPhotos":                { salesforceField: "Dok_Fotos_der_Immobilie__c", requirement: "optional" },
  "funnel.constructionDescriptionPhotos": { salesforceField: "Dok_Fotos_der_Immobilie__c", requirement: "optional" },
  "funnel.oldSalesDocuments":             { salesforceField: "Dok_Fotos_der_Immobilie__c", requirement: "optional" },
  "funnel.constructionPlansNetArea":      { salesforceField: "Dok_Grundrissplaene__c",     requirement: "optional" },

  // ---- No Dok_*__c flag exists for these ------------------------------------
  "funnel.ownFundsProofOfficial":         { salesforceField: null, requirement: "optional" },
  "funnel.ownFundsProofJur":              { salesforceField: null, requirement: "optional" },
  "funnel.commercialRegisterCurrent":     { salesforceField: null, requirement: "optional" },
  "funnel.annualFinancialStatementsJur":  { salesforceField: null, requirement: "optional" },
  "funnel.balanceSheetAudit3Years":       { salesforceField: null, requirement: "optional" },
  "funnel.interimBalanceIfAvailable":     { salesforceField: null, requirement: "optional" }, // "falls vorhanden"
  "funnel.currentMortgageContract":       { salesforceField: null, requirement: "optional" },
  "funnel.bankStatementReservation":      { salesforceField: null, requirement: "optional" },
  "funnel.buildingPermitDoc2":            { salesforceField: null, requirement: "optional" },
  "funnel.projectPlanCostEstimate":       { salesforceField: null, requirement: "optional" },
  "funnel.condominiumActValue":           { salesforceField: null, requirement: "optional" },
  "funnel.usageRegulationsSTWE":          { salesforceField: null, requirement: "optional" },
  "funnel.renovationFundInfoCondominium": { salesforceField: null, requirement: "optional" },
  "funnel.rentalOverviewCurrent":         { salesforceField: null, requirement: "optional" },
  "funnel.giftContract":                  { salesforceField: null, requirement: "optional" },
  "funnel.loanContractGift":              { salesforceField: null, requirement: "optional" },
  "funnel.inheritanceContract":           { salesforceField: null, requirement: "optional" },
  "funnel.inheritanceConfirmation":       { salesforceField: null, requirement: "optional" },
};

/** Dok_Betreibungsregisterauszug__c exists on Case but the funnel never asks for it. */
export const UNUSED_SALESFORCE_DOC_FIELDS = ["Dok_Betreibungsregisterauszug__c"];

export function isRequiredDoc(key: string): boolean {
  return DOCUMENT_CATALOG[key]?.requirement === "required";
}

export interface CompletenessResult {
  complete: boolean;
  /** i18n keys of required documents with no file attached. */
  missing: string[];
  /**
   * i18n keys that were shown AND uploaded — the exact complement of `missing`.
   *
   * The Dok_*__c booleans cannot stand in for this: ten of them cover forty documents, so
   * "Dok_Fotos_der_Immobilie__c is true" does not say which of the three photo documents
   * arrived. The Dokumenten-Check tab needs per-document detail, hence the explicit list.
   */
  supplied: string[];
  /** Dok_*__c -> true when at least one file was attached for a document feeding it. */
  salesforceFlags: Record<string, boolean>;
}

/**
 * Binary check, per spec V1: a document counts as provided when at least one file is
 * attached to it. No content validation - that is V2 (DocDive).
 *
 * "Missing" means SHOWN BUT NOT UPLOADED. It deliberately ignores `requirement`: the funnel
 * no longer labels anything required or optional, so the only honest definition of a gap is
 * "we asked for it and it did not arrive". Filtering by `requirement` here is what produced
 * "Ihr Dossier ist vollständig" mails to customers who had uploaded nothing at all.
 *
 * `visibleKeys` matters: only documents actually shown for this case type can be missing,
 * otherwise a Kauf dossier would be chased for Ablösung paperwork it was never offered.
 */
export function computeDocumentCompleteness(
  visibleKeys: string[],
  providedKeys: string[],
): CompletenessResult {
  const provided = new Set(providedKeys);
  const visible = Array.from(new Set(visibleKeys));

  const missing = visible.filter((k) => !provided.has(k));
  // Restricted to `visible` for the same reason `missing` is: a document the customer was
  // never shown cannot be reported either way.
  const supplied = visible.filter((k) => provided.has(k));

  const salesforceFlags: Record<string, boolean> = {};
  for (const key of visible) {
    const field = DOCUMENT_CATALOG[key]?.salesforceField;
    if (!field) continue;
    // Several documents share one flag - it is true when any of them was supplied.
    salesforceFlags[field] = (salesforceFlags[field] ?? false) || provided.has(key);
  }

  return { complete: missing.length === 0, missing, supplied, salesforceFlags };
}
