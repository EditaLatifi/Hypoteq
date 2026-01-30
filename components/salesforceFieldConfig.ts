export type SFFieldType =
  | "currency"
  | "boolean"
  | "string"
  | "picklist"
  | "date";


export const SALESFORCE_CASE_FIELDS: Record<string, SFFieldType> = {

  // Client count field (number, not currency)
  Client__c: "string",

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
  Abl_sung__c: "currency",
  Erh_hung__c: "currency",  // Mortgage increase amount (from erhoehung_betrag)
  Erh_hung_betrag__c: "currency",
  Hypothekenbedarf__c: "currency",  // Calculated mortgage need
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
  Zins__c: "string",
  Laufzeit__c: "string",
  Bank2__c: "string",  // Second bank offer
  Zins2__c: "string",  // Second bank interest rate
  Laufzeit2__c: "string",  // Second bank term
  Bank3__c: "string",  // Third bank offer
  Zins3__c: "string",  // Third bank interest rate
  Laufzeit3__c: "string",  // Third bank term
  Partner_Email__c: "string",  // Partner consultant email
  Eigenmittel_Prozent__c: "string",  // Own funds percentage
  Tragbarkeit_Prozent__c: "string",  // Affordability percentage
  
  // Client lookup fields (Account IDs)
  Client_2__c: "string",
  Client_3__c: "string",

  // Currency fields for mortgage volume
  Hypothekarvolumen__c: "currency",  // Mortgage volume/amount

  // Date fields
  Kaufdatum__c: "date",
  
  // Picklist for new construction type
  If_Neubau__c: "picklist",  // "Bereits erstellt" or "Bauprojekt"
};
