/**
 * Which document sections a given case sees.
 *
 * Transcribed from HYPOTEQ's "Dokumenten-Anforderungen" specification (v1.0, Mai 2026),
 * which is the source of truth for what the funnel asks a customer to supply, as revised by
 * the business's row-by-row feedback on the document rules (September 2026). It replaced
 * an earlier structure that had grown inside DocumentsStep and had drifted from it.
 *
 * Kept out of the component on purpose: this logic decides which documents a customer is
 * asked for, and therefore what a "fehlende Unterlagen" mail lists. While it lived inside a
 * 1200-line client component it could not be exercised without a browser, so no combination
 * of case type, employment status and property type was ever verified. Titles and items are
 * i18n keys, so nothing here depends on a locale.
 *
 * Where the spec was ambiguous, the reading is noted at the point it applies.
 *
 * Retired keys (funnel.pensionFund3rdPillarBuyback, the old Neubau section's title) are no
 * longer emitted but stay in the catalog, the translations and the Dokumenten-Check map:
 * submissions made before the change still reference them.
 */

import { normalizeNutzung } from "./propertyLabels";

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
  /** More than one borrower on the case — drives the company "Andere Eigentümer" section. */
  hasMultipleOwners: boolean;
  hasAngestellt: boolean;
  hasSelbstaendig: boolean;
  hasRentner: boolean;
  hasAge50Plus: boolean;

  // ---- Added with the September 2026 feedback --------------------------------
  /** The customer ticked that the property stands on Baurecht (property.baurecht). */
  isBaurecht: boolean;
  /**
   * Neubau only: the customer ticked that a Grundbuchauszug and a Gebäudeversicherungs-
   * police already exist (property.neubauGrundbuchGvVorhanden). Not every new build has
   * them yet; an existing property always does.
   */
  hasNeubauGrundbuchGv: boolean;
  /** A self-employed borrower ticked "Pensionskasse vorhanden". */
  hasPkSelbstaendig: boolean;
  /** An amount was entered for 3. Säule under Eigenmittel. */
  hasSaeule3: boolean;
  /** The customer answered "ja" to "Bestehen Leasingverträge?". */
  hasLeasing: boolean;
  /** An amount was entered for Schenkung under Eigenmittel. */
  hasSchenkung: boolean;
  /** An amount was entered for Darlehen under Eigenmittel. */
  hasDarlehen: boolean;
  /** An amount was entered for Erbvorbezug / Erbschaft under Eigenmittel. */
  hasErbschaft: boolean;
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
  isBaurecht: false,
  hasNeubauGrundbuchGv: false,
  hasPkSelbstaendig: false,
  hasSaeule3: false,
  hasLeasing: false,
  hasSchenkung: false,
  hasDarlehen: false,
  hasErbschaft: false,
};

/** The flags added with the September 2026 feedback, in declaration order. */
export const FEEDBACK_FLAG_NAMES: (keyof DocumentFlags)[] = [
  "isBaurecht",
  "hasNeubauGrundbuchGv",
  "hasPkSelbstaendig",
  "hasSaeule3",
  "hasLeasing",
  "hasSchenkung",
  "hasDarlehen",
  "hasErbschaft",
];

/**
 * "Objektunterlagen" — the documents about the property itself, for both borrower types.
 *
 * The business's feedback: the property documents were scattered (photos and Baurecht in the
 * base set, everything else only for a Neubau), so an existing property was never asked for
 * its Grundbuchauszug or Gebäudeversicherung. They are needed for every case, so they now
 * sit in one always-shown section right after the base documents.
 *
 *  - Sales documentation: an Ablösung has no current sales documentation, so it is asked
 *    for the old one instead.
 *  - Grundbuchauszug and Gebäudeversicherung: always for an existing property; for a Neubau
 *    only when the customer ticked that they already exist.
 *  - Kaufvertrag: only on a purchase. The reservation contract it used to mention has its
 *    own "Falls reserviert" section.
 *  - Baurechtsvertrag: only when the customer ticked Baurecht.
 */
function objektSection(f: DocumentFlags, purchaseContractKey: string): DocumentSection {
  const grundbuchUndGv = !f.isNeubau || f.hasNeubauGrundbuchGv;
  return {
    titleKey: "funnel.docSectionObjekt",
    items: [
      f.isAbloesung ? "funnel.oldSalesDocuments" : "funnel.salesDocPhotos",
      "funnel.constructionPlansNetArea",
      "funnel.propertyPhotosInteriorExterior",
      ...(grundbuchUndGv
        ? ["funnel.landRegistryNotOlder6Months", "funnel.buildingInsuranceIfAvailable"]
        : []),
      ...(f.isKauf && !f.isAbloesung ? [purchaseContractKey] : []),
      ...(f.isBaurecht ? ["funnel.baurechtsvertrag"] : []),
    ],
  };
}

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
      ],
    },

    objektSection(f, "funnel.purchaseOrRenovationContract"),

    // What the company Ablösung set asks for beyond the Objekt section: the Baubeschrieb
    // with photos, and the mortgage being replaced. Plans and Grundbuchauszug moved to
    // Objektunterlagen.
    ...(f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionAbloesung",
          items: ["funnel.constructionDescriptionPhotos", "funnel.currentMortgageContract"],
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
      ],
    },

    objektSection(f, "funnel.purchaseContractDraft"),

    // The Pensionskassenausweis and the 3. Säule are separate documents now. The PK
    // certificate is asked of every employee, but of a self-employed borrower only when they
    // ticked that they have a Pensionskasse. The 3a statement is asked for in the
    // Eigenmittel section, and only when 3. Säule money is put in — except from 50 on,
    // where all retirement assets count as security for old age and both are asked for.
    ...(f.hasAngestellt
      ? [{
          titleKey: "funnel.forEmployed",
          items: [
            "funnel.salaryStatementBonus",
            "funnel.monthlyPayslips3",
            "funnel.pensionFundCertificate",
          ],
        }]
      : []),

    ...(f.hasSelbstaendig
      ? [{
          titleKey: "funnel.forSelfEmployed",
          items: [
            "funnel.balanceSheetAudit3Years",
            ...(f.hasPkSelbstaendig ? ["funnel.pensionFundCertificate"] : []),
          ],
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
          items: [
            "funnel.pensionForecastAHV",
            "funnel.pensionFundCertificate",
            "funnel.pillar3BuybackValues",
          ],
        }]
      : []),

    ...(f.isRenditeobjekt
      ? [{
          titleKey: "funnel.docSectionRenditeobjekt",
          items: ["funnel.rentalOverviewCurrent"],
        }]
      : []),

    // One section for what the Eigenmittel and the customer's obligations are made of. It
    // replaces "Andere Einkommen und Schulden" and the private "Andere Eigentümer", which
    // listed the same contracts twice and asked for them unconditionally. Each document now
    // follows the answer that makes it necessary.
    {
      titleKey: "funnel.docSectionEigenmittel",
      items: [
        ...(f.hasLeasing ? ["funnel.leasingContract"] : []),
        ...(f.hasSchenkung ? ["funnel.giftContract"] : []),
        ...(f.hasDarlehen ? ["funnel.loanContractGift"] : []),
        ...(f.hasErbschaft ? ["funnel.inheritanceConfirmation"] : []),
        ...(f.hasSaeule3 ? ["funnel.pillar3BuybackValues"] : []),
      ],
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

    // Plans and Grundbuchauszug moved to Objektunterlagen; the mortgage being replaced is
    // the one Ablösung document left.
    ...(f.isAbloesung
      ? [{
          titleKey: "funnel.docSectionAbloesung",
          items: ["funnel.currentMortgageContract"],
        }]
      : []),

    ...sharedConditionalSections(f),
  ];
}

export function documentSectionsFor(flags: DocumentFlags): DocumentSection[] {
  const sections = flags.isJur
    ? juristischePersonSections(flags)
    : natuerlichePersonSections(flags);

  // A document can legitimately belong to two sections (the Pensionskassenausweis under
  // Angestellte and Ab 50; the 3. Säule under Ab 50 and Eigenmittel). Showing the same
  // upload tile twice would let a customer wonder which one counts, so later duplicates are
  // dropped and any section left empty by that — or by its conditions — is removed.
  const seen = new Set<string>();
  return sections
    .map((s) => ({
      titleKey: s.titleKey,
      items: s.items.filter((k) => (seen.has(k) ? false : (seen.add(k), true))),
    }))
    .filter((s) => s.items.length > 0);
}

// ---------------------------------------------------------------------------------------
// From funnel answers to flags
// ---------------------------------------------------------------------------------------

/** Age in whole years from a Swiss date (DD.MM.YYYY); 0 when the date cannot be read. */
export function ageFromSwissDate(birthdate: string | undefined | null, now: Date = new Date()): number {
  if (!birthdate) return 0;
  const parts = String(birthdate).split(".");
  if (parts.length !== 3) return 0;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2]);
  const birthDate = new Date(year, month, day);
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/** An Eigenmittel amount as entered ("120000", "CHF 120'000") — 0 when blank. */
function amount(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface FunnelAnswers {
  borrowers?: any[];
  project?: any;
  property?: any;
  financing?: any;
}

/**
 * The document flags for what the customer answered in the funnel.
 *
 * Lives here rather than in DocumentsStep so the mapping from answers to documents can be
 * tested end to end — in particular that answers stored as translated labels (Nutzung,
 * Art der Liegenschaft) are read the same way in all four languages.
 */
export function documentFlagsFrom(answers: FunnelAnswers, now: Date = new Date()): DocumentFlags {
  const borrowers = answers.borrowers ?? [];
  const project = answers.project ?? {};
  const property = answers.property ?? {};
  const financing = answers.financing ?? {};
  const kreditnehmer: any[] = Array.isArray(property.kreditnehmer) ? property.kreditnehmer : [];

  const isNeubau = property.artImmobilie === "neubau";

  return {
    isJur: borrowers.some((b: any) => b?.type === "jur"),
    isKauf: project.projektArt === "kauf",
    isNeubau,
    isBestand: property.artImmobilie === "bestehend",
    isAbloesung: project.projektArt === "abloesung",
    // Strictly Stockwerkeigentum, as the spec defines it — not every Wohnung. PropertyStep
    // asks a flat owner whether it is STWE. The direct picklist value is honoured too,
    // should a submission ever carry it.
    isStockwerkeigentum:
      property.stockwerkeigentum === "ja" || property.artLiegenschaft === "Stockwerkeigentum",
    isBauprojekt: property.neubauArt === "bauprojekt",
    isRenovation: property.renovation === "ja",
    isReserviert: property.reserviert === "ja",
    // nutzung holds the label in the customer's language; compare the canonical value.
    isRenditeobjekt: normalizeNutzung(property.nutzung) === "Rendite-Immobilie",
    hasMultipleOwners: kreditnehmer.length > 1,
    hasAngestellt: kreditnehmer.some((kn) => kn?.erwerb === "angestellt"),
    hasSelbstaendig: kreditnehmer.some((kn) => kn?.erwerb === "selbständig"),
    hasRentner: kreditnehmer.some((kn) => kn?.erwerb === "rentner"),
    hasAge50Plus: kreditnehmer.some((kn) => ageFromSwissDate(kn?.geburtsdatum, now) >= 50),
    isBaurecht: property.baurecht === "ja",
    hasNeubauGrundbuchGv: isNeubau && property.neubauGrundbuchGvVorhanden === "ja",
    hasPkSelbstaendig: kreditnehmer.some(
      (kn) => kn?.erwerb === "selbständig" && kn?.pkVorhanden === "ja"
    ),
    hasSaeule3: amount(financing.eigenmittel_saeule3) > 0,
    hasLeasing: financing.leasingVorhanden === "ja",
    hasSchenkung: amount(financing.eigenmittel_schenkung) > 0,
    hasDarlehen: amount(financing.eigenmittel_darlehen) > 0,
    hasErbschaft: amount(financing.eigenmittel_erbschaft) > 0,
  };
}

/** Every document key a case will be shown, deduplicated — the input to the completeness check. */
export function visibleDocumentKeys(flags: DocumentFlags): string[] {
  return Array.from(new Set(documentSectionsFor(flags).flatMap((s) => s.items)));
}
