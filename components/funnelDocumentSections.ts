/**
 * Which document sections a given case sees.
 *
 * Lifted verbatim out of DocumentsStep, where it lived inline inside the component. It had
 * to move: this logic decides which documents are REQUIRED of a customer, and therefore who
 * receives a "fehlende Unterlagen" mail — but while it sat inside a 1200-line client
 * component it could not be exercised without a browser, so no combination of case type,
 * employment status and property type was ever verified. The component now renders what
 * this returns; titles stay i18n keys so nothing here depends on a locale.
 *
 * Two structures, picked by borrower type: a juristische Person sees a company set, a
 * natürliche Person the private one.
 */

export interface DocumentFlags {
  /** At least one borrower is a company — selects the whole juristische-Person structure. */
  isJur: boolean;
  isKauf: boolean;
  isNeubau: boolean;
  isBestand: boolean;
  isAbloesung: boolean;
  isStockwerkeigentum: boolean;
  isBauprojekt: boolean;
  isRenovation: boolean;
  isReserviert: boolean;
  isRenditeobjekt: boolean;
  hasAndereEigenmittel: boolean;
  hasAngestellt: boolean;
  hasSelbstaendig: boolean;
  hasRentner: boolean;
  hasAge50Plus: boolean;
}

export interface DocumentSection {
  /** i18n key, not a label — resolved by the component that renders it. */
  titleKey: string;
  /** i18n keys of the documents in this section. */
  items: string[];
}

export const EMPTY_DOCUMENT_FLAGS: DocumentFlags = {
  isJur: false,
  isKauf: false,
  isNeubau: false,
  isBestand: false,
  isAbloesung: false,
  isStockwerkeigentum: false,
  isBauprojekt: false,
  isRenovation: false,
  isReserviert: false,
  isRenditeobjekt: false,
  hasAndereEigenmittel: false,
  hasAngestellt: false,
  hasSelbstaendig: false,
  hasRentner: false,
  hasAge50Plus: false,
};

function juristischePersonSections(f: DocumentFlags): DocumentSection[] {
  return [
    // The signed authorisation gets its own section rather than sitting inside the base
    // list: it is the one document the customer must first download, sign and scan, and
    // burying it among the others is how it gets skipped.
    {
      titleKey: "funnel.docSectionAuskunftsermaechtigung",
      items: ["funnel.auskunftsermaechtigungDoc"],
    },

    {
      titleKey: "funnel.documentsJur",
      items: [
        "funnel.commercialRegisterCurrent",
        "funnel.passportAuthorizedPersonJur",
        "funnel.annualFinancialStatementsJur",
        "funnel.interimBalanceIfAvailable",
        "funnel.taxReturnLatestJur",
        "funnel.ownFundsProofJur",
        "funnel.taxReturnLatest",
      ],
    },

    // Neubau — purchase only. An Ablösung never asks for sales documentation.
    ...(f.isKauf && f.isNeubau && !f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionNeubau",
          items: [
            "funnel.salesDocPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryIfAvailable",
            "funnel.purchaseOrRenovationContract",
            "funnel.buildingInsuranceIfAvailable",
          ],
        }]
      : []),

    ...(f.isKauf && f.isBestand && !f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionExistingProperty",
          items: [
            "funnel.constructionDescriptionPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryNotOlder6Months",
            "funnel.oldSalesDocuments",
          ],
        }]
      : []),

    ...(f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionAbloesung",
          items: [
            "funnel.constructionDescriptionPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryNotOlder6Months",
            "funnel.currentMortgageContract",
          ],
        }]
      : []),

    ...(f.isStockwerkeigentum
      ? [{
          titleKey: "funnel.docSectionStockwerkeigentum",
          items: [
            "funnel.condominiumActValue",
            "funnel.usageRegulationsSTWE",
            "funnel.renovationFundInfoCondominium",
          ],
        }]
      : []),

    ...(f.hasAndereEigenmittel
      ? [{
          titleKey: "funnel.otherOwnFunds",
          // Note: the company set ends with inheritanceContract where the private set uses
          // inheritanceConfirmation. Preserved as-is — this mirrors the original.
          items: ["funnel.giftContract", "funnel.loanContractGift", "funnel.inheritanceContract"],
        }]
      : []),

    ...(f.isBauprojekt || f.isRenovation
      ? [{
          titleKey: "funnel.docSectionBauprojektRenovation",
          items: ["funnel.buildingPermitDoc2", "funnel.projectPlanCostEstimate"],
        }]
      : []),
  ];
}

function natuerlichePersonSections(f: DocumentFlags): DocumentSection[] {
  return [
    // The signed authorisation gets its own section rather than sitting inside the base
    // list: it is the one document the customer must first download, sign and scan, and
    // burying it among the others is how it gets skipped.
    {
      titleKey: "funnel.docSectionAuskunftsermaechtigung",
      items: ["funnel.auskunftsermaechtigungDoc"],
    },

    {
      titleKey: "funnel.personalDocuments",
      items: [
        "funnel.passportIDAllBorrowers",
        "funnel.ownFundsProofOfficial",
        "funnel.taxReturnLatest",
      ],
    },

    ...(f.hasAngestellt
      ? [{
          titleKey: "funnel.forEmployed",
          items: ["funnel.salaryStatementBonus", "funnel.pensionFund3rdPillarBuyback"],
        }]
      : []),

    ...(f.hasSelbstaendig
      ? [{
          titleKey: "funnel.forSelfEmployed",
          items: ["funnel.balanceSheetAudit3Years", "funnel.pensionFund3rdPillarBuyback"],
        }]
      : []),

    ...(f.hasRentner
      ? [{
          titleKey: "funnel.forRetirees",
          items: ["funnel.pensionCertificatePKAHV"],
        }]
      : []),

    ...(f.hasAge50Plus
      ? [{
          titleKey: "funnel.from50Years",
          items: ["funnel.pensionForecastAHV", "funnel.pensionFund3rdPillarBuyback"],
        }]
      : []),

    ...(f.isKauf && f.isNeubau && !f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionNeubau",
          items: [
            "funnel.salesDocPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryIfAvailable",
            "funnel.purchaseContractDraft",
            "funnel.buildingInsuranceIfAvailable",
          ],
        }]
      : []),

    ...(f.isKauf && f.isBestand && !f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionExistingProperty",
          items: [
            "funnel.constructionDescriptionPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryNotOlder6Months",
            "funnel.oldSalesDocuments",
          ],
        }]
      : []),

    ...(f.isReserviert
      ? [{
          titleKey: "funnel.reservation",
          items: ["funnel.reservationContractDoc", "funnel.bankStatementReservation"],
        }]
      : []),

    ...(f.isRenditeobjekt
      ? [{
          titleKey: "funnel.docSectionRenditeobjekt",
          items: ["funnel.rentalOverviewCurrent"],
        }]
      : []),

    ...(f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionAbloesung",
          items: [
            "funnel.constructionDescriptionPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryNotOlder6Months",
            "funnel.currentMortgageContract",
          ],
        }]
      : []),

    ...(f.isStockwerkeigentum
      ? [{
          titleKey: "funnel.docSectionStockwerkeigentum",
          items: [
            "funnel.condominiumActValue",
            "funnel.usageRegulationsSTWE",
            "funnel.renovationFundInfoCondominium",
          ],
        }]
      : []),

    ...(f.hasAndereEigenmittel
      ? [{
          titleKey: "funnel.otherOwnFunds",
          items: ["funnel.giftContract", "funnel.loanContractGift", "funnel.inheritanceConfirmation"],
        }]
      : []),

    ...(f.isBauprojekt || f.isRenovation
      ? [{
          titleKey: "funnel.docSectionBauprojektRenovation",
          items: ["funnel.buildingPermitDoc2", "funnel.projectPlanCostEstimate"],
        }]
      : []),
  ];
}

export function documentSectionsFor(flags: DocumentFlags): DocumentSection[] {
  return flags.isJur ? juristischePersonSections(flags) : natuerlichePersonSections(flags);
}

/** Every document key a case will be shown, deduplicated — the input to the completeness check. */
export function visibleDocumentKeys(flags: DocumentFlags): string[] {
  return Array.from(new Set(documentSectionsFor(flags).flatMap((s) => s.items)));
}
