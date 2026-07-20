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

  // Currency fields
  Betrag__c: "currency",
  Kaufpreis__c: "currency",
  Bar__c: "currency",
  X3_Saeule__c: "currency",
  PK_Betrag__c: "currency",
  Schenkung_usw__c: "currency",
  Einkommen__c: "currency",
  J_hrlicher_Netto_Mietertrag__c: "currency",
  Erh_hung__c: "currency",  // Mortgage increase amount (from erhoehung_betrag)
  Erh_hung_betrag__c: "currency",
  Gesch_tzter_Hypothekenbedarf__c: "currency",  // Calculated mortgage need (Funnel: "geschätzter Hypothekarbedarf", Label: Hypothekarbetrag)
  Hypothekarbetrag__c: "currency",  // Direct mortgage amount input (Ablösung)
  Eigenmittel__c: "currency",  // Total equity amount

  // Picklist fields
  Hypothekarlaufzeiten__c: "picklist",
  Art_der_Immobilie__c: "picklist",
  Art_der_Liegenschaft__c: "picklist",
  Nutzung_der_Immobilie__c: "picklist",
  Kreditnehmer__c: "picklist",
  Reason: "picklist",
  Verpf_ndung_PK__c: "picklist",

  // String fields
  Kommentar__c: "string",
  Case_Name__c: "string",
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

  // Date fields
  Kaufdatum__c: "date",
  
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
