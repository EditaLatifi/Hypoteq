import { SALESFORCE_ACCOUNT_FIELDS } from "./salesforceAccountFieldConfig";

function sanitizeSFAccountValue(sfField: string, value: any) {
  const type = SALESFORCE_ACCOUNT_FIELDS[sfField];
  if (!type) return value ?? null;
  switch (type) {
    case "boolean":
      if (value === true || value === false) return value;
      if (value == null) return false;
      const v = String(value).trim().toLowerCase();
      if (["ja", "yes", "true", "1"].includes(v)) return true;
      if (["nein", "no", "false", "0", ""].includes(v)) return false;
      return false;
    case "date":
      return value || null;
    case "picklist":
      return value || null;
    case "string":
    default:
      return value ?? null;
  }
}

import { funnelToSalesforceMap } from './funnelToSalesforceMap';
import { SALESFORCE_CASE_FIELDS, SFFieldType } from "./salesforceFieldConfig";


function sanitizeSFValue(sfField: string, value: any) {
  const type = SALESFORCE_CASE_FIELDS[sfField];

  if (!type) return undefined;

  switch (type) {
    case "currency": {
      if (value === "" || value == null) return null;
      const n = Number(
        String(value)
          .replace(/CHF\s?/gi, "")
          .replace(/'/g, "")
      );
      return Number.isFinite(n) ? n : null;
    }

    case "boolean": {
      if (value === true || value === false) return value;
      const v = String(value).toLowerCase();
      return ["ja", "yes", "true", "1"].includes(v);
    }

    case "date":
      return value || null;

    case "picklist":
    case "string":
      return value ?? null;
  }
}

export async function syncFunnelStepsToSalesforce(stepData: Record<string, any>, salesforceApi: any) {

  const flatData = {
    ...stepData,
    ...(stepData.financing || {}),
    ...(stepData.project || {}),
    ...(stepData.property || {}),
    ...(stepData.client || {}),
  };

  if (!flatData.borrowerType && Array.isArray(stepData.borrowers) && stepData.borrowers.length > 0) {
    flatData.borrowerType = stepData.borrowers[0].type;
  }

  flatData.projektArt =
    flatData.projektArt === "kauf" ? "Neue Hypothek" :
    flatData.projektArt === "abloesung" ? "Ablösung" :
    flatData.projektArt;

  flatData.borrowerType =
    flatData.borrowerType === "nat" ? "Natürliche Person" :
    flatData.borrowerType === "jur" ? "Juristische Personen" :
    flatData.borrowerType;

  flatData.artImmobilie =
    flatData.artImmobilie === "bestehend" ? "Bestehende Immobilie" :
    flatData.artImmobilie === "neubau" ? "Neubau" :
    flatData.artImmobilie;

  flatData.neubauArt =
    flatData.neubauArt === "bereits_erstellt" ? "Bereits erstellt" :
    flatData.neubauArt === "bauprojekt" ? "Bauprojekt" :
    flatData.neubauArt;

  flatData.artLiegenschaft =
    flatData.artLiegenschaft === "Wohnung" ? "Wohnung" :
    flatData.artLiegenschaft;

flatData.modell =
  flatData.modell === "saron" ? "Saron" :
  flatData.modell === "mix" ? "Mix" :
  flatData.modell === "1" ? "1 Jahr" :
  flatData.modell === "2" ? "2 Jahre" :
  flatData.modell === "3" ? "3 Jahre" :
  flatData.modell === "4" ? "4 Jahre" :
  flatData.modell === "5" ? "5 Jahre" :
  flatData.modell === "6" ? "6 Jahre" :
  flatData.modell === "7" ? "7 Jahre" :
  flatData.modell === "8" ? "8 Jahre" :
  flatData.modell === "9" ? "9 Jahre" :
  flatData.modell === "10" ? "10 Jahre" :
  flatData.modell;

  const NUTZUNG_MAP: Record<string, string> = {
    "Selbstbewohnt": "Selbstbewohnt",
    "Zweitwohnsitz / Ferienliegenschaft": "Zweitwohnsitz",
    "Vermietet & teilweise selbstbewohnt": "Vermietet & teilweise selbstbewohnt",
    "Rendite-Immobilie": "Rendite-Immobilie",
    "Für eigenes Geschäft": "Für eigenes Geschäft",
  };

  if (flatData.nutzung) {
    flatData.nutzung = NUTZUNG_MAP[flatData.nutzung] ?? null;
  }

  const email = flatData.email;
  let personAccount = await salesforceApi.findPersonAccountByEmail(email);

  let lastName = flatData.lastName || flatData.nachname || flatData.name || '';
  if (!lastName || lastName.trim() === '') {
    lastName = 'Unknown';
  }
  const firstName = flatData.firstName || flatData.vorname || '';
  const personEmail = flatData.email || flatData.emailAdresse || '';
  const phone = flatData.phone || flatData.telefon || '';
  let createdNewPersonAccount = false;
  if (!personAccount) {

    personAccount = await salesforceApi.createPersonAccount({
      LastName: lastName,
      FirstName: firstName,
      PersonEmail: personEmail,
      Phone: phone,

    });
    createdNewPersonAccount = true;
  }

  const caseData: Record<string, any> = {
    AccountId: personAccount.Id,
  };
  const personAccountData: Record<string, any> = {};

  const alternateFunnelKeys: Record<string, string[]> = {
    'Betrag__c': ['renovationsBetrag'],
    'Abl_sung__c': ['abloesung_betrag'],
    'Erh_hung_betrag__c': ['erhoehung_betrag', 'erhoehungBetrag'],
    'J_hrlicher_Netto_Mietertrag__c': ['netto_mietertrag', 'nettoMietertragJaehrlich'],
  };

  for (const [funnelField, mapping] of Object.entries(funnelToSalesforceMap)) {
    if (mapping.salesforceObject !== "case") continue;
    let value = flatData[funnelField];
    if (Array.isArray(value)) value = value.join(", ");
    const sfField = mapping.salesforceField;
    const sanitized = sanitizeSFValue(sfField, value);
    if (sanitized !== undefined) {
      caseData[sfField] = sanitized;
    }
  }

  for (const [funnelField, mapping] of Object.entries(funnelToSalesforceMap)) {
    if (mapping.salesforceObject !== "personaccount") continue;
    let value = flatData[funnelField];
    if (Array.isArray(value)) value = value.join(", ");
    const sfField = mapping.salesforceField;
    personAccountData[sfField] = sanitizeSFAccountValue(sfField, value);
  }

  if (!caseData['Case_Name__c']) {
    const defaultName = `${flatData.firstName || ''} ${flatData.lastName || ''} ${flatData.projektArt || ''}`.trim() || `Case ${Date.now()}`;
    caseData['Case_Name__c'] = defaultName;
  }

  if (createdNewPersonAccount && personAccount && personAccount.Id) {
    await salesforceApi.updatePersonAccount(personAccount.Id, personAccountData);
  } else if (!createdNewPersonAccount && personAccount && personAccount.Id) {

  } else {
    console.warn('Salesforce sync warning: PersonAccount Id is missing, skipping updatePersonAccount.');
  }

  for (const key of Object.keys(caseData)) {
    if (!SALESFORCE_CASE_FIELDS[key] && key !== "AccountId") {
      console.warn(`🧹 Removing non-case field from Case: ${key}`);
      delete caseData[key];
    }
  }

  for (const [field, type] of Object.entries(SALESFORCE_CASE_FIELDS)) {
    const value = caseData[field];
    if (value == null) continue;
    if (type === "currency" && typeof value !== "number") {
      console.error(`❌ Currency field got non-number`, field, value);
      caseData[field] = null;
    }
    if (type === "boolean" && typeof value !== "boolean") {
      console.error(`❌ Boolean field got non-boolean`, field, value);
      caseData[field] = false;
    }
    if (type === "date" && typeof value !== "string") {
      caseData[field] = null;
    }
  }

  Object.keys(caseData).forEach(
    k => caseData[k] === "" && (caseData[k] = null)
  );

  console.log('[Salesforce Sync] Full caseData before sending:', JSON.stringify(caseData, null, 2));

  await salesforceApi.createOrUpdateCase(caseData);
}