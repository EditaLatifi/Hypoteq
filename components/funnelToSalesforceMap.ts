// funnelToSalesforceMap.ts
// Account fields: FirstName, LastName, Email, Telephone
// All other fields go to Case

export const funnelToSalesforceMap = {
  // Account fields only
  firstName: { salesforceField: "FirstName", salesforceObject: "account" },
  lastName:  { salesforceField: "LastName",  salesforceObject: "account" },
  email:     { salesforceField: "PersonEmail", salesforceObject: "account" },
  phone:     { salesforceField: "Phone", salesforceObject: "account" },

  // Case fields - project info
  projektArt: { salesforceField: "Reason", salesforceObject: "case" },
  borrowerType: { salesforceField: "Kreditnehmer__c", salesforceObject: "case" },

  // Correspondence language (from funnel language)
  korrespondenzsprache: { salesforceField: "Korrespondenzsprache__c", salesforceObject: "case" },

  // Stage (always set by bot)
  Stage__c: { salesforceField: "Stage__c", salesforceObject: "case" },

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

  // abloesung_betrag is not mapped directly — it flows into Gesch_tzter_Hypothekenbedarf__c and
  // Hypothekarvolumen__c via the calculation block (Abl_sung__c does not exist on Case).
  hypothekarbetrag: { salesforceField: "Hypothekarbetrag__c", salesforceObject: "case" },
  erhoehung_betrag: { salesforceField: "Erh_hung__c", salesforceObject: "case" }, // Mortgage increase amount (only sent if erhoehung=Ja)

  caseName: { salesforceField: "Case_Name__c", salesforceObject: "case" },
  // NOTE: Partner_Consultant__c (Kundenberater) is deliberately NOT mapped here. It is a
  // Contact *lookup*, so it needs a record Id — writing the raw partner email into it makes
  // Salesforce reject the whole Case ("unzulässiger Typ des ID-Werts"). Partner submissions
  // hid this because syncFunnelStepsToSalesforce overwrites the field with the resolved
  // Contact Id afterwards; a direct submission carrying a partnerEmail did not, and lost the
  // lead. The Contact is resolved in syncFunnelStepsToSalesforce — leave it to do that.

} as const;
