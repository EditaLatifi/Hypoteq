export type SFFieldType =
  | "currency"
  | "percent"
  | "boolean"
  | "string"
  | "picklist"
  | "date";


export const SALESFORCE_CASE_FIELDS: Record<string, SFFieldType> = {

  // Client count field (number, not currency)
  Client__c: "string",

  // Correspondence language field
  Korrespondenzsprache__c: "picklist",

  // Boolean fields
  Ist_die_Liegenschaft_bereits_reserviert__c: "boolean",
  Gibt_es_Renovationen_oder_Zusatzkosten__c: "boolean",
  Bestehen_bereits_Finanzierungsangebote__c: "boolean",
  Steueroptimierung__c: "boolean",
  // The chips of «Trifft etwas davon zu?» (HYPOTEQ 19.10. D.1: in Checkboxes, «auswertbar»;
  // the answers stay in Dokumenten_Check_State__c as well). Funnel v5 payloads only.
  Privatkredit__c: "boolean",
  Leasing__c: "boolean",
  Unterhaltspflicht__c: "boolean",
  Solidarbuergschaft__c: "boolean",

  // Currency fields
  Betrag__c: "currency",
  Kaufpreis__c: "currency",
  Bar__c: "currency",
  X3_Saeule__c: "currency",
  PK_Betrag__c: "currency",
  Schenkung_usw__c: "currency",
  Einkommen__c: "currency",
  J_hrlicher_Netto_Mietertrag__c: "currency",
  // The Erhöhung amount (erhoehung_betrag, only with Erhöhung = Ja). HYPOTEQ 19.10. B17: this is
  // the field in use; Erh_hung_betrag__c is ignored — listed here, but nothing writes it.
  Erh_hung__c: "currency",
  Erh_hung_betrag__c: "currency",
  Gesch_tzter_Hypothekenbedarf__c: "currency",  // Calculated mortgage need (Funnel: "geschätzter Hypothekarbedarf", Label: Hypothekarbetrag)
  Hypothekarbetrag__c: "currency",  // Direct mortgage amount input (Ablösung)
  Eigenmittel__c: "currency",  // Total equity amount
  // HYPOTEQ 19.10. B4 / D.1: the Renovationsbetrag (only with Renovation = Ja) — not Betrag__c.
  Renovationsbetrag__c: "currency",
  // HYPOTEQ 19.10. B17 / D.1: the Geschätzter Objektwert as entered (DECISIONS V60).
  Geschaetzter_Objektwert__c: "currency",
  // HYPOTEQ 19.10. D.1: the Eigenmittel source Darlehen (it used to be in the JSON only).
  Darlehen_Eigenmittel__c: "currency",

  // Picklist fields
  Hypothekarlaufzeiten__c: "picklist",
  Art_der_Immobilie__c: "picklist",
  Art_der_Liegenschaft__c: "picklist",
  Nutzung_der_Immobilie__c: "picklist",
  Kreditnehmer__c: "picklist",
  Reason: "picklist",
  Verpf_ndung_PK__c: "picklist",
  // HYPOTEQ 19.10. B17: the number of borrowers linked in Salesforce, «1» / «2» / «3» (Client__c,
  // Client_2__c, Client_3__c); more only in the JSON.
  Wie_viele_Kunden__c: "picklist",

  // Document completeness. These fields already existed on Case (built before the funnel
  // was wired up, previously unused). Dokumenten_Check_State__c is a 131k textarea holding
  // the human-readable list of what is still missing.
  Documents_completed__c: "boolean",
  Dokumenten_Check_State__c: "string",
  Dok_Identitaetsdokument__c: "boolean",
  Dok_Lohnausweis__c: "boolean",
  Dok_Steuererklaerung__c: "boolean",
  Dok_Betreibungsregisterauszug__c: "boolean",
  Dok_Pensionskassenausweis__c: "boolean",
  Dok_Kaufvertrag__c: "boolean",
  Dok_Grundbuchauszug__c: "boolean",
  Dok_Gebaeudeversicherungsausweis__c: "boolean",
  Dok_Fotos_der_Immobilie__c: "boolean",
  Dok_Grundrissplaene__c: "boolean",

  // String fields
  Kommentar__c: "string",
  Case_Name__c: "string",
  // Property location (Objektinformationen tab). The funnel already collects both in
  // PropertyStep, where they are mandatory — they used to feed only the Case name.
  PLZ_Ort__c: "string",   // "8645 Rapperswil" — SF max length 30
  City__c: "string",      // "Rapperswil"      — SF max length 80
  Bank__c: "string",
  Zins__c: "percent",  // Interest rate — SF field type: Percent
  Laufzeit__c: "string",
  Bank2__c: "string",  // Second bank offer
  Zins2__c: "percent",  // Second bank interest rate — SF field type: Percent
  Laufzeit2__c: "string",  // Second bank term
  Bank3__c: "string",  // Third bank offer
  Zins3__c: "percent",  // Third bank interest rate — SF field type: Percent
  Laufzeit3__c: "string",  // Third bank term
  EigenmittelProzent__c: "percent",  // Own funds percentage (Funnel: "Eigenmittel", Label: Eigenmittel %) — SF field type: Percent
  Tragbarkeit__c: "percent",  // Affordability percentage (Funnel: "Tragbarkeit", Label: Tragbarkeit) — SF field type: Percent
  
  // Client lookup fields (Account IDs)
  Client_2__c: "string",
  Client_3__c: "string",

  // Currency fields for mortgage volume
  Hypothekarvolumen__c: "currency",  // Mortgage volume/amount

  // Kauf- & Ablöse-Datum. HYPOTEQ 19.10. B13 / B15: Kaufdatum__c is Text(80) — the sync writes
  // «TT.MM.JJJJ» (Kauf: the Kaufdatum, Ablösung: the Ablösedatum of the Zinsabrechnung), and the
  // same date as a real Date in Kaufdatum_Datum__c, only when it is a calendar date (DECISIONS V41).
  Kaufdatum__c: "string",
  Kaufdatum_Datum__c: "date",

  // Heizungsart from the documents (Handover 8; v5 no longer asks it). Picklist values (HYPOTEQ
  // 19.10. B15): Wärmepumpe Luft-Wasser, Wärmepumpe Wasser-Wasser, Fernwärme, Holz, Gas Erdgas,
  // Gas Biogas, Öl, Andere (toWaermeerzeugung).
  Waermeerzeugung__c: "picklist",
  
  // Picklist for new construction type
  If_Neubau__c: "picklist",  // "Bereits erstellt" or "Bauprojekt"

  // Stage field for Case
  Stage__c: "picklist",

  // Kundenberater / customer advisor — Contact lookup (stores Contact ID).
  // Only set for partner submissions. NOT the sales partner: that is an Account
  // lookup written from SF_SALES_PARTNER_FIELD in syncFunnelStepsToSalesforce.ts,
  // which is assigned after the non-Case-field cleanup and so isn't listed here.
  Partner_Consultant__c: "string",
};
