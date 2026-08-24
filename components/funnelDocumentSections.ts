/**
 * Which document sections a given case sees.
 *
 * Transcribed from HYPOTEQ's "Dokumenten-Anforderungen" specification (v1.0, Mai 2026),
 * which is the source of truth for what the funnel asks a customer to supply. It replaced
 * an earlier structure that had grown inside DocumentsStep and had drifted from it.
 *
 * Kept out of the component on purpose: this logic decides which documents a customer is
 * asked for, and therefore what a "fehlende Unterlagen" mail lists. While it lived inside a
 * 1200-line client component it could not be exercised without a browser, so no combination
 * of case type, employment status and property type was ever verified. Titles and items are
 * i18n keys, so nothing here depends on a locale.
 *
 * Where the spec was ambiguous, the reading is noted at the point it applies.
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
  /** More than one borrower on the case — drives the "Andere Eigentümer" section. */
  hasMultipleOwners: boolean;
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
  hasMultipleOwners: false,
  hasAngestellt: false,
  hasSelbstaendig: false,
  hasRentner: false,
  hasAge50Plus: false,
};

/** Sections both borrower types share, in the spec's order. */
function sharedConditionalSections(f: DocumentFlags): DocumentSection[] {
  return [
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

    ...(f.isBauprojekt || f.isRenovation
      ? [{
          titleKey: "funnel.docSectionBauprojektRenovation",
          items: ["funnel.buildingPermitDoc2", "funnel.projectPlanCostEstimate"],
        }]
      : []),
  ];
}

function juristischePersonSections(f: DocumentFlags): DocumentSection[] {
  return [
    // The signed authorisation stands alone: it is the one form the customer must first
    // download, sign and scan back, and it was being skipped when buried in the base list.
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
        "funnel.debtCollectionExtractCurrent",
        "funnel.taxReturnLatestJur",
        "funnel.ownFundsProofJur",
        "funnel.propertyPhotosInteriorExterior",
        "funnel.baurechtsvertrag",
      ],
    },

    // Neubau — purchase only. An Ablösung never asks for sales documentation.
    ...(f.isNeubau && !f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionNeubau",
          items: [
            "funnel.salesDocPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryNotOlder6Months",
            "funnel.purchaseOrRenovationContract",
            "funnel.buildingInsuranceIfAvailable",
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

    ...sharedConditionalSections(f),

    ...(f.hasMultipleOwners
      ? [{
          titleKey: "funnel.otherOwners",
          // The company set ends with Erbschaftsvertrag where the private set uses
          // Erbschaftsbestätigung — as the spec has it.
          items: ["funnel.giftContract", "funnel.loanContractGift", "funnel.inheritanceContract"],
        }]
      : []),
  ];
}

function natuerlichePersonSections(f: DocumentFlags): DocumentSection[] {
  return [
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
        "funnel.propertyPhotosInteriorExterior",
        "funnel.baurechtsvertrag",
      ],
    },

    ...(f.hasAngestellt
      ? [{
          titleKey: "funnel.forEmployed",
          items: [
            "funnel.salaryStatementBonus",
            "funnel.monthlyPayslips3",
            "funnel.pensionFund3rdPillarBuyback",
          ],
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

    ...(f.isRenditeobjekt
      ? [{
          titleKey: "funnel.docSectionRenditeobjekt",
          items: ["funnel.rentalOverviewCurrent"],
        }]
      : []),

    // "Andere Einkommen und Schulden" is unconditional in the spec: these are debts the
    // customer may have regardless of how the purchase is funded. It used to hang off
    // eigenmittel_schenkung, which meant a customer with a car lease was never asked.
    {
      titleKey: "funnel.otherIncomeAndDebts",
      items: ["funnel.leasingContract", "funnel.giftContract", "funnel.loanContractGift"],
    },

    // The spec lists this under "immer" but titles it "Falls reserviert". Read as
    // conditional: asking a customer who reserved nothing for a reservation contract and
    // its bank transfer would be nonsense, and the title is the more specific statement.
    ...(f.isReserviert
      ? [{
          titleKey: "funnel.reservation",
          items: ["funnel.reservationContractDoc", "funnel.bankStatementReservation"],
        }]
      : []),

    ...(f.isNeubau && !f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionNeubau",
          items: [
            "funnel.salesDocPhotos",
            "funnel.constructionPlansNetArea",
            "funnel.purchaseContractDraft",
            "funnel.buildingInsuranceIfAvailable",
            "funnel.landRegistryNotOlder6Months",
          ],
        }]
      : []),

    ...(f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionAbloesung",
          items: [
            "funnel.constructionPlansNetArea",
            "funnel.landRegistryNotOlder6Months",
            "funnel.currentMortgageContract",
          ],
        }]
      : []),

    ...sharedConditionalSections(f),

    ...(f.hasMultipleOwners
      ? [{
          titleKey: "funnel.otherOwners",
          items: [
            "funnel.giftContract",
            "funnel.loanContractGift",
            "funnel.inheritanceConfirmation",
          ],
        }]
      : []),
  ];
}

export function documentSectionsFor(flags: DocumentFlags): DocumentSection[] {
  const sections = flags.isJur
    ? juristischePersonSections(flags)
    : natuerlichePersonSections(flags);

  // A document can legitimately appear in two sections (Schenkungs- and Darlehensvertrag
  // are both an "andere Schulden" item and an "andere Eigentümer" item). Showing the same
  // upload tile twice would let a customer wonder which one counts, so later duplicates
  // are dropped and any section left empty by that is removed.
  const seen = new Set<string>();
  return sections
    .map((s) => ({
      titleKey: s.titleKey,
      items: s.items.filter((k) => (seen.has(k) ? false : (seen.add(k), true))),
    }))
    .filter((s) => s.items.length > 0);
}

/** Every document key a case will be shown, deduplicated — the input to the completeness check. */
export function visibleDocumentKeys(flags: DocumentFlags): string[] {
  return Array.from(new Set(documentSectionsFor(flags).flatMap((s) => s.items)));
}
