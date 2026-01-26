export type SFFieldType =
  | "currency"
  | "boolean"
  | "string"
  | "picklist"
  | "date";


export const SALESFORCE_CASE_FIELDS: Record<string, SFFieldType> = {

  Ist_die_Liegenschaft_bereits_reserviert__c: "boolean",
  Gibt_es_Renovationen_oder_Zusatzkosten__c: "boolean",
  Bestehen_bereits_Finanzierungsangebote__c: "boolean",
  Steueroptimierung__c: "boolean",
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

  Hypothekarlaufzeiten__c: "picklist",
  Art_der_Immobilie__c: "picklist",
  Art_der_Liegenschaft__c: "picklist",
  Nutzung_der_Immobilie__c: "picklist",
  Kreditnehmer__c: "picklist",
  Reason: "picklist",

  Kommentar__c: "string",
  Case_Name__c: "string",
  Bank__c: "string",
  Zins__c: "string",
  Laufzeit__c: "string",

  Kaufdatum__c: "date",
  If_Neubau__c: "date",
};
