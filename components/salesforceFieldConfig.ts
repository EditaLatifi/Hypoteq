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
  Erh_hung_betrag__c: "currency",
  Hypothekenbedarf__c: "currency",  // Calculated mortgage need

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
  Partner_Email__c: "string",  // Partner consultant email
  Eigenmittel_Prozent__c: "string",  // Own funds percentage
  Tragbarkeit_Prozent__c: "string",  // Affordability percentage
  
  // Client lookup fields (Account IDs)
  Client_2__c: "string",
  Client_3__c: "string",

  // Date fields
  Kaufdatum__c: "date",
  If_Neubau__c: "date",
};
