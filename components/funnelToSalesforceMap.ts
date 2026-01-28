// funnelToSalesforceMap.ts
// Account fields: FirstName, LastName, Email, Telephone
// All other fields go to Case

export const funnelToSalesforceMap = {
  // Account fields only
  firstName: { salesforceField: "FirstName", salesforceObject: "account" },
  lastName:  { salesforceField: "LastName",  salesforceObject: "account" },
  email:     { salesforceField: "PersonEmail", salesforceObject: "account" },
  phone:     { salesforceField: "Phone", salesforceObject: "account" },

  // Case fields - client count
  clientCount: { salesforceField: "Client__c", salesforceObject: "case" },

  // Case fields - project info
  projektArt: { salesforceField: "Reason", salesforceObject: "case" },
  borrowerType: { salesforceField: "Kreditnehmer__c", salesforceObject: "case" },

  artImmobilie: { salesforceField: "Art_der_Immobilie__c", salesforceObject: "case" },
  neubauArt: { salesforceField: "If_Neubau__c", salesforceObject: "case" },
  artLiegenschaft: { salesforceField: "Art_der_Liegenschaft__c", salesforceObject: "case" },
  nutzung: { salesforceField: "Nutzung_der_Immobilie__c", salesforceObject: "case" },

  reserviert: { salesforceField: "Ist_die_Liegenschaft_bereits_reserviert__c", salesforceObject: "case" },

  renovation: { salesforceField: "Gibt_es_Renovationen_oder_Zusatzkosten__c", salesforceObject: "case" },
  renovationsBetrag: { salesforceField: "Betrag__c", salesforceObject: "case" },

  // Financing fields
  finanzierungsangebote: { salesforceField: "Bestehen_bereits_Finanzierungsangebote__c", salesforceObject: "case" },
  bank: { salesforceField: "Bank__c", salesforceObject: "case" },
  zins: { salesforceField: "Zins__c", salesforceObject: "case" },
  laufzeit: { salesforceField: "Laufzeit__c", salesforceObject: "case" },

  kaufpreis: { salesforceField: "Kaufpreis__c", salesforceObject: "case" },

  eigenmittel_bar: { salesforceField: "Bar__c", salesforceObject: "case" },
  eigenmittel_saeule3: { salesforceField: "X3_Saeule__c", salesforceObject: "case" },
  eigenmittel_pk: { salesforceField: "PK_Betrag__c", salesforceObject: "case" },
  eigenmittel_schenkung: { salesforceField: "Schenkung_usw__c", salesforceObject: "case" },

  pkVorbezug: { salesforceField: "Verpf_ndung_PK__c", salesforceObject: "case" },

  modell: { salesforceField: "Hypothekarlaufzeiten__c", salesforceObject: "case" },

  brutto: { salesforceField: "Einkommen__c", salesforceObject: "case" },
  netto_mietertrag: { salesforceField: "J_hrlicher_Netto_Mietertrag__c", salesforceObject: "case" },

  steueroptimierung: { salesforceField: "Steueroptimierung__c", salesforceObject: "case" },
  kaufdatum: { salesforceField: "Kaufdatum__c", salesforceObject: "case" },
  kommentar: { salesforceField: "Kommentar__c", salesforceObject: "case" },

  abloesung_betrag: { salesforceField: "Abl_sung__c", salesforceObject: "case" },
  erhoehung_betrag: { salesforceField: "Erh_hung_betrag__c", salesforceObject: "case" },

  caseName: { salesforceField: "Case_Name__c", salesforceObject: "case" },
  // partnerEmail: { salesforceField: "Partner_Email__c", salesforceObject: "case" },  // Uncomment after creating field in Salesforce
  
} as const;
