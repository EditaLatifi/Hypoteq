/**
 * Pre-tick the Case's "Dokumenten-Check" tab from what the customer actually uploaded.
 *
 * WHY THIS EXISTS
 * ---------------
 * The funnel already writes the ten Dok_*__c checkboxes on Case. The Dokumenten-Check tab
 * does not read them: it renders its own checklist and persists the ticks as JSON in
 * Dokumenten_Check_State__c. So a dossier could arrive with every document uploaded, have
 * seven Dok_*__c booleans set, and still show "0 / 11 Dokumente — 0%" to the caseworker,
 * who then re-ticked by hand what the customer had already supplied.
 *
 * THE FORMAT
 * ----------
 * Read back off Cases a caseworker had saved by hand — the component's source is not
 * readable by the integration user (metadata access is denied), so the shape below is
 * observed, not documented:
 *
 *   {"filters":{"typ":"nat","projekt":"kauf",...},
 *    "checked":{"<Sektion>|<Label>":true, ...},
 *    "savedAt":"2026-08-20T08:57:47.524Z"}
 *
 * A key is the section heading and the document label joined by "|", in the tab's own
 * German wording. That wording is close to the funnel's but NOT identical
 * ("HYPOTEQ-Formular Auskunftsermächtigung" vs "Unterschriebene Auskunftsermächtigung",
 * "Deckenform" vs "Dachform"), which is why this file is an explicit table rather than a
 * label lookup through messages/de.json. A key that does not match byte-for-byte simply
 * ticks nothing — silently — so the strings below must never be "tidied up".
 *
 * `filters` is deliberately NOT written. The tab shows each filter as "aus Case: <Feld>",
 * i.e. it derives them from Case fields; the saved block is a snapshot. Writing a value
 * from a vocabulary we have only partly observed (nothing in production has ever saved a
 * juristische Person) would be a guess, and a wrong filter changes which sections render.
 * Omitting it leaves that derivation to the component.
 *
 * COVERAGE
 * --------
 * Only entries confirmed present in saved production state are mapped. The tab's checklist
 * is narrower than the funnel's document set, and several sections (juristische Person,
 * Stockwerkeigentum, Bauprojekt/Renovation) have never been saved by anyone, so their exact
 * labels are unknown. Those funnel documents are listed in UNMAPPED_FUNNEL_DOCS and are
 * reported by the sync rather than guessed at.
 */

/** Every "<Sektion>|<Label>" seen in state a human saved through the tab. */
export const VERIFIED_TAB_ENTRIES: readonly string[] = [
  "Grundlegende Unterlagen|HYPOTEQ-Formular Auskunftsermächtigung",
  "Grundlegende Unterlagen|Pass, Identitätskarte, Aufenthaltsbewilligung",
  "Grundlegende Unterlagen|Aktuelle Aufstellung und Nachweis der Eigenmittel",
  "Grundlegende Unterlagen|Aktuelle Steuererklärung (inkl. Schulden-, Wertschriften-, Liegenschaftsverzeichnis)",
  "Grundlegende Unterlagen|Fotos der Immobilie (Innen- und Aussenbereich)",
  "Grundlegende Unterlagen|Baurechtsvertrag (falls die Liegenschaft im Baurecht erstellt wurde)",
  "Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis",
  "Angestellte / Unselbständig Erwerbstätige|Letzte 3 Monatslohnabrechnungen",
  "Angestellte / Unselbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule",
  "Selbständig Erwerbstätige|Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre",
  "Selbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule",
  "Rentner|Rentenbescheinigung (PK, AHV)",
  "Ab 50 Jahre Alter der Kreditnehmer|Rentenansprechung (AHV)",
  "Ab 50 Jahre Alter der Kreditnehmer|Pensionskassenausweis und Rückkaufswerte von der 3. Säule",
  "Renditeobjekt|Aktueller Mieterspiegel inkl. Mietzinsaufstellung",
  "Andere Einkommen und Schulden|Leasingvertrag (falls vorhanden)",
  "Andere Einkommen und Schulden|Schenkungsvertrag (falls vorhanden)",
  "Andere Einkommen und Schulden|Darlehensvertrag (falls vorhanden)",
  "Andere Eigentümer|Schenkungsvertrag",
  "Andere Eigentümer|Darlehensvertrag",
  "Andere Eigentümer|Erbschaftsbestätigung",
  "Falls reserviert|Bankauszug Reservationszahlung",
  "Falls reserviert|Reservationsvertrag",
  "Ablösung|Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Deckenform, Bodenbeläge, Baubeschrieb",
  "Ablösung|Aktueller Hypothekarvertrag (bei Ablösung der Hypothek)",
  "Neubau|Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Deckenform, Bodenbeläge, Baubeschrieb",
  "Neubau|Verkaufsdokumentation inkl. Fotos des Innen- und Aussenbereichs",
  "Neubau|Kaufvertrag (Entwurf/original) und, falls vorhanden, Reservationsvertrag",
  "Neubau|Aktuelle Gebäudeversicherungspolice (inkl. Kubatur in m³), falls nicht vorhanden, Kubatur m³",
];

/**
 * Funnel document key (messages/*.json -> funnel.*) -> the tab entries it satisfies.
 *
 * One funnel document can tick several entries. That is not a workaround: the same document
 * appears under more than one heading (the Pensionskassenausweis under Angestellte,
 * Selbständige and Ab-50), and the tab renders only the sections that apply to the Case —
 * so ticking all of them sets exactly the one the caseworker sees.
 */
export const DOKUMENTEN_CHECK_MAP: Record<string, string[]> = {
  // ---- Grundlegende Unterlagen ----------------------------------------------
  "funnel.auskunftsermaechtigungDoc": ["Grundlegende Unterlagen|HYPOTEQ-Formular Auskunftsermächtigung"],
  "funnel.passportIDAllBorrowers": ["Grundlegende Unterlagen|Pass, Identitätskarte, Aufenthaltsbewilligung"],
  "funnel.ownFundsProofOfficial": ["Grundlegende Unterlagen|Aktuelle Aufstellung und Nachweis der Eigenmittel"],
  "funnel.taxReturnLatest": [
    "Grundlegende Unterlagen|Aktuelle Steuererklärung (inkl. Schulden-, Wertschriften-, Liegenschaftsverzeichnis)",
  ],
  "funnel.propertyPhotosInteriorExterior": ["Grundlegende Unterlagen|Fotos der Immobilie (Innen- und Aussenbereich)"],
  "funnel.baurechtsvertrag": [
    "Grundlegende Unterlagen|Baurechtsvertrag (falls die Liegenschaft im Baurecht erstellt wurde)",
  ],

  // ---- Erwerbsstatus --------------------------------------------------------
  "funnel.salaryStatementBonus": ["Angestellte / Unselbständig Erwerbstätige|Aktueller Lohnausweis"],
  "funnel.monthlyPayslips3": ["Angestellte / Unselbständig Erwerbstätige|Letzte 3 Monatslohnabrechnungen"],
  // The same certificate is asked for under three headings; only the section that applies
  // to this Case is rendered, so all three are ticked.
  "funnel.pensionFund3rdPillarBuyback": [
    "Angestellte / Unselbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule",
    "Selbständig Erwerbstätige|Pensionskassenausweis und Rückkaufswerte von der 3. Säule",
    "Ab 50 Jahre Alter der Kreditnehmer|Pensionskassenausweis und Rückkaufswerte von der 3. Säule",
  ],
  "funnel.balanceSheetAudit3Years": [
    "Selbständig Erwerbstätige|Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre",
  ],
  "funnel.pensionCertificatePKAHV": ["Rentner|Rentenbescheinigung (PK, AHV)"],
  // The tab writes "Rentenansprechung", the funnel "Rentenvorausberechnung". Same document.
  "funnel.pensionForecastAHV": ["Ab 50 Jahre Alter der Kreditnehmer|Rentenansprechung (AHV)"],

  // ---- Renditeobjekt --------------------------------------------------------
  "funnel.rentalOverviewCurrent": ["Renditeobjekt|Aktueller Mieterspiegel inkl. Mietzinsaufstellung"],

  // ---- Andere Einkommen und Schulden / Andere Eigentümer --------------------
  "funnel.leasingContract": ["Andere Einkommen und Schulden|Leasingvertrag (falls vorhanden)"],
  // Schenkungs- and Darlehensvertrag appear under both headings, worded differently.
  "funnel.giftContract": [
    "Andere Einkommen und Schulden|Schenkungsvertrag (falls vorhanden)",
    "Andere Eigentümer|Schenkungsvertrag",
  ],
  "funnel.loanContractGift": [
    "Andere Einkommen und Schulden|Darlehensvertrag (falls vorhanden)",
    "Andere Eigentümer|Darlehensvertrag",
  ],
  "funnel.inheritanceConfirmation": ["Andere Eigentümer|Erbschaftsbestätigung"],

  // ---- Falls reserviert -----------------------------------------------------
  "funnel.bankStatementReservation": ["Falls reserviert|Bankauszug Reservationszahlung"],
  "funnel.reservationContractDoc": ["Falls reserviert|Reservationsvertrag"],

  // ---- Ablösung / Neubau ----------------------------------------------------
  "funnel.currentMortgageContract": ["Ablösung|Aktueller Hypothekarvertrag (bei Ablösung der Hypothek)"],
  "funnel.constructionPlansNetArea": [
    "Ablösung|Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Deckenform, Bodenbeläge, Baubeschrieb",
    "Neubau|Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Deckenform, Bodenbeläge, Baubeschrieb",
  ],
  "funnel.salesDocPhotos": ["Neubau|Verkaufsdokumentation inkl. Fotos des Innen- und Aussenbereichs"],
  "funnel.purchaseContractDraft": ["Neubau|Kaufvertrag (Entwurf/original) und, falls vorhanden, Reservationsvertrag"],
  "funnel.purchaseOrRenovationContract": [
    "Neubau|Kaufvertrag (Entwurf/original) und, falls vorhanden, Reservationsvertrag",
  ],
  "funnel.buildingInsuranceIfAvailable": [
    "Neubau|Aktuelle Gebäudeversicherungspolice (inkl. Kubatur in m³), falls nicht vorhanden, Kubatur m³",
  ],
};

/**
 * Funnel documents the tab has no entry for, as far as production state shows.
 *
 * Two different reasons, both outside this codebase to fix:
 *  - the tab's checklist genuinely does not ask for it (a Grundbuchauszug never appeared in
 *    any saved state, not even on Kauf/bestehend Cases), or
 *  - it lives in a section nobody has ever saved (juristische Person, Stockwerkeigentum,
 *    Bauprojekt/Renovation), so its exact label is unknown to us.
 *
 * Listed rather than mapped on a hunch: a near-miss label ticks nothing and looks identical
 * to a bug. Getting these ticked needs the component's label list from the Salesforce side.
 */
export const UNMAPPED_FUNNEL_DOCS: readonly string[] = [
  "funnel.landRegistryNotOlder6Months",
  "funnel.landRegistryIfAvailable",
  "funnel.constructionDescriptionPhotos",
  "funnel.oldSalesDocuments",
  "funnel.debtCollectionExtractCurrent",
  "funnel.condominiumActValue",
  "funnel.usageRegulationsSTWE",
  "funnel.renovationFundInfoCondominium",
  "funnel.buildingPermitDoc2",
  "funnel.projectPlanCostEstimate",
  "funnel.inheritanceContract",
  // juristische Person — the tab has never been saved for one.
  "funnel.commercialRegisterCurrent",
  "funnel.passportAuthorizedPersonJur",
  "funnel.annualFinancialStatementsJur",
  "funnel.interimBalanceIfAvailable",
  "funnel.taxReturnLatestJur",
  "funnel.ownFundsProofJur",
];

export interface DokumentenCheckState {
  checked: Record<string, boolean>;
  filters?: unknown;
  savedAt?: string;
  [key: string]: unknown;
}

/** Tab entries satisfied by the documents this dossier supplied. */
export function tabEntriesFor(suppliedKeys: string[]): string[] {
  const out = new Set<string>();
  for (const key of suppliedKeys) {
    for (const entry of DOKUMENTEN_CHECK_MAP[key] || []) out.add(entry);
  }
  return [...out];
}

/** Supplied documents that tick nothing, so the caller can log what the tab cannot show. */
export function unmappedSupplied(suppliedKeys: string[]): string[] {
  return [...new Set(suppliedKeys.filter((k) => !(DOKUMENTEN_CHECK_MAP[k]?.length)))];
}

/**
 * Build the value for Dokumenten_Check_State__c.
 *
 * `previous` is whatever the Case already holds. It is merged, never replaced: a caseworker
 * may have ticked things by hand (or a Nachreichung may have run before this one), and a
 * submit that blanked those ticks would destroy work. Nothing is ever unticked here either —
 * this function only knows what arrived, not what was withdrawn.
 *
 * Returns null when there is nothing to say and no existing state to preserve, so the caller
 * can leave the field untouched instead of writing an empty checklist over it.
 */
export function buildDokumentenCheckState(
  suppliedKeys: string[],
  previous?: string | null,
  now: Date = new Date()
): string | null {
  let base: DokumentenCheckState | null = null;
  if (previous) {
    try {
      const parsed = JSON.parse(previous);
      // Only an object with a usable `checked` map is a state we can merge onto. Anything
      // else (the German prose an earlier version of the sync wrote here, say) is not
      // something to preserve.
      if (parsed && typeof parsed === "object" && parsed.checked && typeof parsed.checked === "object") {
        base = parsed as DokumentenCheckState;
      }
    } catch {
      /* not JSON — treat as no previous state */
    }
  }

  const entries = tabEntriesFor(suppliedKeys);
  if (!entries.length && !base) return null;

  const checked: Record<string, boolean> = { ...(base?.checked || {}) };
  for (const entry of entries) checked[entry] = true;

  // Spread `base` first so an existing `filters` snapshot survives; this function never
  // writes one of its own (see the file header).
  const state: DokumentenCheckState = {
    ...(base || {}),
    checked,
    savedAt: now.toISOString(),
  };

  return JSON.stringify(state);
}
