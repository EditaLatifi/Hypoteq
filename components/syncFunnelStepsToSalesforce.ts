import { SALESFORCE_ACCOUNT_FIELDS } from "./salesforceAccountFieldConfig";
import { funnelToSalesforceMap } from './funnelToSalesforceMap';
import { SALESFORCE_CASE_FIELDS, SFFieldType } from "./salesforceFieldConfig";

// Sales Partner = the partner *company* Account on the Case (HYPOTEQ AG for direct
// leads; Betterhomes / Remax / ... for partner leads). Verified against production:
// the API name is the unhelpfully generic `Account__c` (label "Sales Partner"), which
// is NOT the standard `AccountId` — that one holds the customer. Overridable per-org.
const SALES_PARTNER_FIELD = process.env.SF_SALES_PARTNER_FIELD || 'Account__c';
const HYPOTEQ_ACCOUNT_NAME = process.env.HYPOTEQ_ACCOUNT_NAME || 'HYPOTEQ AG';

// Convert Swiss date format (DD.MM.YYYY) to Salesforce format (YYYY-MM-DD)
function convertSwissDateToSalesforce(swissDate: string): string | null {
  if (!swissDate || swissDate.trim() === '') return null;
  const parts = swissDate.split('.');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Transform German picklist values to proper Salesforce format
function transformErwerbsstatus(value: string | null | undefined): string | null {
  if (!value) return null;
  const mapping: Record<string, string> = {
    'angestellt': 'Angestellt',
    'selbständig': 'Selbständig',
    'rentner': 'Rentner'
  };
  return mapping[value.toLowerCase()] || value;
}

function transformZivilstand(value: string | null | undefined): string | null {
  if (!value) return null;
  const mapping: Record<string, string> = {
    'ledig': 'Ledig',
    'verheiratet': 'Verheiratet',
    'geschieden': 'Geschieden',
    'verwitwet': 'Verwitwet'
  };
  return mapping[value.toLowerCase()] || value;
}

// Validation function
function validatePersonData(person: any, personIndex: number, isPartnerEmail: boolean = false, isJuristicPerson: boolean = false) {
  const errors: string[] = [];
  
  // Skip email/phone validation for juristic persons (companies)
  if (isJuristicPerson) {
    // Only validate that company name (lastName) exists
    if (!person.lastName || person.lastName.trim() === '') {
      errors.push(`Person ${personIndex}: Company name is mandatory`);
    }
    return errors;
  }
  
  // For natural persons - email and phone validation
  // Skip email validation for partner submissions (partner fills in their own email, not end-customer's)
  if (!isPartnerEmail && (!person.email || person.email.trim() === '')) {
    errors.push(`Person ${personIndex}: Email is mandatory`);
  }
  
  // Phone is mandatory only for end-customers, not for partner email-only submissions
  if (!isPartnerEmail && !person.phone && !person.telefon) {
    errors.push(`Person ${personIndex}: Telephone is mandatory`);
  }
  
  return errors;
}

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

// Parse a percentage value into a plain number (handles "1.34", "1,34", "1.34%")
function parsePercent(value: any): number | null {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(/%/g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

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

    case "percent":
      return parsePercent(value);

    case "boolean": {
      if (value === true || value === false) return value;
      const v = String(value).toLowerCase();
      return ["ja", "yes", "true", "1"].includes(v);
    }

    case "date":
      // Convert Swiss date format (DD.MM.YYYY) to Salesforce format (YYYY-MM-DD)
      if (!value || value === '') return null;
      return convertSwissDateToSalesforce(value);

    case "picklist":
      // Handle Ja/Nein picklists - ensure proper capitalization
      if (value && typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'ja' || lowerValue === 'yes') return 'Ja';
        if (lowerValue === 'nein' || lowerValue === 'no') return 'Nein';
      }
      return value ?? null;
      
    case "string":
      return value ?? null;
  }
}

// Translate document i18n keys into German labels for the Salesforce Dokumenten-Check tab.
// Falls back to the bare key so an unmapped document is still visible rather than silently
// dropped from the missing list.
function resolveDocLabelsDe(keys: string[]): string[] {
  let de: any = {};
  try { de = require("@/messages/de.json"); } catch { /* label lookup is best-effort */ }
  return keys.map((key) => {
    const [ns, name] = key.split(".");
    return de?.[ns]?.[name] || key;
  });
}

export async function syncFunnelStepsToSalesforce(stepData: Record<string, any>, salesforceApi: any) {
  console.log('[Salesforce Sync] Starting sync process...');
  
  // Flatten all data
  const flatData = {
    ...stepData,
    ...(stepData.financing || {}),
    ...(stepData.project || {}),
    ...(stepData.property || {}),
    ...(stepData.client || {}),
  };
  // Log flatData for debugging
  console.log("Flat data for mapping:", flatData);

  // Capture raw project type up front — flatData.projektArt gets rewritten to a display
  // label ("Neue Hypothek" / "Ablösung") later, which breaks downstream lowercase checks.
  const projektArtRaw = (flatData.projektArt || '').toLowerCase();
  const isKauf = projektArtRaw === 'kauf' || projektArtRaw === 'neue hypothek';
  const isAbloesung = projektArtRaw === 'abloesung' || projektArtRaw === 'ablösung';

  // For Ablösung, reuse abloesedatum as kaufdatum (Kaufdatum__c is the date field)
  if (isAbloesung && flatData.abloesedatum) {
    flatData.kaufdatum = flatData.abloesedatum;
  }

  // Extract partner email if customerType is "partner" (doesn't create Account, just stored in Case)
  let partnerEmail: string | null = null;
  if (stepData.customerType === 'partner' && stepData.client?.email) {
    partnerEmail = stepData.client.email;
    console.log(`[Salesforce Sync] Partner email detected: ${partnerEmail}`);
  }

  // Extract persons from kreditnehmer array (end-customers who will get Accounts)
  const persons: any[] = [];
  
  // Company names live on kreditnehmer[].firmenname for some funnel paths and on
  // property.firmen[] for others; a juristic lead needs whichever one was filled in.
  const firmenList: any[] = Array.isArray(stepData.property?.firmen) ? stepData.property.firmen : [];

  // Use kreditnehmer array as primary source (end-customer data)
  if (Array.isArray(stepData.property?.kreditnehmer) && stepData.property.kreditnehmer.length > 0) {
    for (let i = 0; i < stepData.property.kreditnehmer.length; i++) {
      const kn = stepData.property.kreditnehmer[i];

      // A borrower is only *usably* juristic when a company name exists to become LastName.
      // Partner submissions routinely flag borrowerType `jur` while leaving Firmenname blank,
      // and treating those as juristic dropped them entirely — discarding complete personal
      // contact data and leaving the sync with zero persons, which killed the whole lead.
      const declaredJuristic = stepData.borrowers?.[0]?.type === 'jur';
      const companyName = String(
        kn.firmenname ||
        (declaredJuristic ? (firmenList[i]?.firmenname || firmenList[0]?.firmenname || '') : '') ||
        ''
      ).trim();
      const isJuristicPerson = Boolean(companyName);

      if (isJuristicPerson) {
        // For juristic persons - use company name as LastName, but also send contact person details
        {
          persons.push({
            firstName: kn.vorname || '',
            lastName: companyName,
            contactLastName: kn.name || '',
            email: kn.email || kn.emailAdresse || '',
            phone: kn.phone || kn.telefon || '',
            adresse: kn.adresse || '',
            erwerbsstatus: null,
            zivilstand: null,
            geburtsdatum: null,
            isJuristic: true, // Mark as juristic person for validation
          });
        }
      } else {
        // For natural persons - existing logic
        // For partner submissions, email may be empty on kreditnehmer
        if ((kn.vorname || kn.name || kn.firstName) && ((kn.email || kn.emailAdresse) || partnerEmail)) {
          persons.push({
            firstName: kn.firstName || kn.vorname || '',
            lastName: kn.lastName || kn.nachname || kn.name || 'Unknown',
            email: kn.email || kn.emailAdresse || '',
            phone: kn.phone || kn.telefon || '',
            erwerbsstatus: kn.erwerb || kn.erwerbsstatus || null,
            zivilstand: kn.zivilstand || null,
            geburtsdatum: kn.geburtsdatum || kn.birthdate || null,
          });
        }
      }
    }
  }
  
  // Fallback to client object ONLY if kreditnehmer is empty AND it's NOT a partner submission
  if (persons.length === 0 && !partnerEmail) {
    if (stepData.client) {
      persons.push({
        firstName: stepData.client.firstName || stepData.client.vorname || '',
        lastName: stepData.client.lastName || stepData.client.nachname || stepData.client.name || 'Unknown',
        email: stepData.client.email || stepData.client.emailAdresse || '',
        phone: stepData.client.phone || stepData.client.telefon || '',
        erwerbsstatus: stepData.client.erwerb || stepData.client.erwerbsstatus || null,
        zivilstand: stepData.client.zivilstand || null,
        geburtsdatum: stepData.client.geburtsdatum || stepData.client.birthdate || null,
      });
    } else if (flatData.email) {
      // Final fallback if no client object
      persons.push({
        firstName: flatData.firstName || flatData.vorname || '',
        lastName: flatData.lastName || flatData.nachname || flatData.name || 'Unknown',
        email: flatData.email || flatData.emailAdresse || '',
        phone: flatData.phone || flatData.telefon || '',
        erwerbsstatus: flatData.erwerb || flatData.erwerbsstatus || null,
        zivilstand: flatData.zivilstand || null,
        geburtsdatum: flatData.geburtsdatum || flatData.birthdate || null,
      });
    }
  }

  // VALIDATION: Maximum 3 persons
  if (persons.length > 3) {
    throw new Error('Maximum 3 persons allowed per submission');
  }

  // A lead with no usable borrower name is still a lead. Partner Ablösung submissions can
  // legitimately arrive with every Kreditnehmer field blank, and throwing here used to
  // discard the entire enquiry — financing figures, partner consultant and all. Create the
  // Case without a linked Account instead and let a human complete it in Salesforce.
  const hasPersons = persons.length > 0;
  if (!hasPersons) {
    console.warn(
      '[Salesforce Sync] No borrower name in this submission — creating the Case without a ' +
      'linked Account so the lead is not lost. Needs manual completion in Salesforce.'
    );
  }

  // VALIDATION: Validate each person
  const validationErrors: string[] = [];
  persons.forEach((person, index) => {
    // Skip email/phone validation for juristic persons
    const isJuristicPerson = (person as any).isJuristic === true;
    const errors = validatePersonData(person, index + 1, !!partnerEmail, isJuristicPerson);
    validationErrors.push(...errors);
  });

  if (validationErrors.length > 0) {
    throw new Error('Validation failed: ' + validationErrors.join('; '));
  }

  console.log(`[Salesforce Sync] Processing ${persons.length} person(s)`);
  if (partnerEmail) {
    console.log(`[Salesforce Sync] Partner email will be stored in Case: ${partnerEmail}`);
  }

  // Store created accounts and contacts
  const accounts: any[] = [];
  const contacts: any[] = [];

  // Process each person: Create or find Account, then create Contact
  for (let i = 0; i < persons.length; i++) {
    const person = persons[i];
    const email = person.email || person.emailAdresse;
    const phone = person.phone || person.telefon;
    const firstName = person.firstName || person.vorname || '';
    const lastName = person.lastName || person.nachname || person.name || 'Unknown';
    const isJuristicPerson = (person as any).isJuristic === true;

    console.log(`[Salesforce Sync] Processing person ${i + 1}: ${email} (${isJuristicPerson ? 'Company' : 'Individual'})`);

    // STEP 1: Find or create Account. Only look up by email when we actually have one —
    // partner submissions often have no end-customer email, and querying with '' can match
    // unrelated empty-email Accounts from prior submissions.
    let account = email ? await salesforceApi.findAccountByEmail(email) : null;

    // Prepare Account data - Person Account fields for everyone (companies and individuals)
    const accountData: Record<string, any> = {
      LastName: lastName,
      FirstName: firstName,
    };
    if (email) accountData.PersonEmail = email;
    if (phone) accountData.Phone = phone;
   
    // Add address if available
    if (person.adresse) {
      accountData.PersonMailingStreet = person.adresse;
      console.log(`[Salesforce Sync] Adding address: ${person.adresse}`);
    }
    
    // Add additional person fields (only for natural persons)
    if (!isJuristicPerson) {
      if (person.erwerbsstatus) {
        accountData.Erwerbsstatus__c = transformErwerbsstatus(person.erwerbsstatus);
        console.log(`[Salesforce Sync] Erwerbsstatus: ${person.erwerbsstatus} -> ${accountData.Erwerbsstatus__c}`);
      }
      if (person.zivilstand) {
        accountData.Zivilstand__c = transformZivilstand(person.zivilstand);
        console.log(`[Salesforce Sync] Zivilstand: ${person.zivilstand} -> ${accountData.Zivilstand__c}`);
      }
      if (person.geburtsdatum) {
        const convertedDate = convertSwissDateToSalesforce(person.geburtsdatum);
        accountData.Geburtsdatum__c = convertedDate;
        console.log(`[Salesforce Sync] Geburtsdatum: ${person.geburtsdatum} -> ${convertedDate}`);
      } else {
        console.log(`[Salesforce Sync] No Geburtsdatum found for person`);
      }
    }
    
    // Sanitize all account fields (skip core identity fields)
    const skipFields = ['LastName', 'FirstName', 'PersonEmail', 'Phone', 'Geburtsdatum__c', 'Name', 'Email__c'];
    for (const [field, value] of Object.entries(accountData)) {
      if (value !== undefined && !skipFields.includes(field)) {
        accountData[field] = sanitizeSFAccountValue(field, value);
      }
    }
    
    console.log(`[Salesforce Sync] Final accountData before create/update:`, JSON.stringify(accountData, null, 2));
    
    if (account) {
      console.log(`[Salesforce Sync] Account found for ${email}: ${account.Id}`);
      
      // Check if this is a Person Account or Business Account
      const isPersonAccount = (account as any).IsPersonAccount === true;
      console.log(`[Salesforce Sync] Account type: ${isPersonAccount ? 'Person Account' : 'Business Account'}`);
      
      // Update existing account - LastName and FirstName cannot be updated on Person Accounts
      const updateData: Record<string, any> = {};
      if (phone) updateData.Phone = phone;
      
      // Add address if available - use correct field based on account type
      if (person.adresse) {
        if (isPersonAccount) {
          updateData.PersonMailingStreet = person.adresse;
        } else {
          // For Business Accounts, use BillingStreet instead
          updateData.BillingStreet = person.adresse;
        }
      }
      
      // Add optional person fields (only for natural persons AND Person Accounts)
      if (!isJuristicPerson && isPersonAccount) {
        if (person.erwerbsstatus) {
          updateData.Erwerbsstatus__c = transformErwerbsstatus(person.erwerbsstatus);
        }
        if (person.zivilstand) {
          updateData.Zivilstand__c = transformZivilstand(person.zivilstand);
        }
        if (person.geburtsdatum) {
          const convertedDate = convertSwissDateToSalesforce(person.geburtsdatum);
          if (convertedDate) {
            updateData.Geburtsdatum__c = convertedDate;
            console.log(`[Salesforce Sync] Updating Geburtsdatum: ${person.geburtsdatum} -> ${convertedDate}`);
          }
        }
      }
      
      console.log(`[Salesforce Sync] Updating Account ${account.Id} with data:`, JSON.stringify(updateData, null, 2));
      await salesforceApi.updatePersonAccount(account.Id, updateData);
    } else {
      // Create new Account
      console.log(`[Salesforce Sync] Creating new Account for ${email || lastName}`);
      account = await salesforceApi.createAccount(accountData);
      console.log(`[Salesforce Sync] Account created: ${account.id || account.Id}`);
    }

    accounts.push(account);

    // STEP 2: Find or create Contact linked to this Account
    // NOTE: Person Accounts cannot have Contacts - they contain contact info directly
    // Only create Contacts for Business Accounts (standard accounts)
    const accountId = account.id || account.Id;
    
    // Person Accounts are created with RecordTypeId for Person Account
    // We'll skip Contact creation for Person Accounts since they already contain contact data
    console.log(`[Salesforce Sync] Skipping Contact creation for Person Account ${accountId}`);
    console.log(`[Salesforce Sync] Person Account contains contact data directly`);
    
    // For compatibility with existing code, push null for person accounts
    contacts.push(null);
  }

  // STEP 3: Create ONE Case linked to the main Account (first person), if there is one
  const mainAccount = accounts[0];
  const mainAccountId = mainAccount ? (mainAccount.id || mainAccount.Id) : null;

  console.log(
    mainAccountId
      ? `[Salesforce Sync] Creating Case linked to main Account: ${mainAccountId}`
      : `[Salesforce Sync] Creating Case with no linked Account (no borrower name supplied)`
  );

  // Transform project type values
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

  // Map every locale (DE/EN/FR/IT) label to the Salesforce restricted picklist value.
  // SF picklist: Einfamilienhaus, Wohnung, Mehrfamilienhaus, Landwirschaftszone.
  // Unmapped values are sent through; the createOrUpdateCase retry helper drops them
  // if SF rejects the picklist so the Case is still created.
  const ART_LIEGENSCHAFT_MAP: Record<string, string> = {
    // DE
    "Einfamilienhaus": "Einfamilienhaus",
    "Wohnung": "Wohnung",
    "Mehrfamilienhaus": "Mehrfamilienhaus",
    "Landwirschaftszone": "Landwirschaftszone",
    "Landwirtschaftszone": "Landwirschaftszone",
    // EN
    "Single-family home": "Einfamilienhaus",
    "Apartment": "Wohnung",
    "Multi-family building": "Mehrfamilienhaus",
    "Multi-family home": "Mehrfamilienhaus",
    "Agricultural zone": "Landwirschaftszone",
    // FR
    "Maison unifamiliale": "Einfamilienhaus",
    "Appartement": "Wohnung",
    "Immeuble collectif": "Mehrfamilienhaus",
    "Zone agricole": "Landwirschaftszone",
    // IT
    "Casa unifamiliare": "Einfamilienhaus",
    "Appartamento": "Wohnung",
    "Edificio plurifamiliare": "Mehrfamilienhaus",
    "Zona agricola": "Landwirschaftszone",
  };
  if (flatData.artLiegenschaft && ART_LIEGENSCHAFT_MAP[flatData.artLiegenschaft]) {
    flatData.artLiegenschaft = ART_LIEGENSCHAFT_MAP[flatData.artLiegenschaft];
  }

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

  // SF picklist: Selbstbewohnt, Zweitwohnsitz, Vermietet & teilweise selbstbewohnt,
  // Rendite-Immobilie, Für eigenes Geschäft. Maps every locale label users see.
  const NUTZUNG_MAP: Record<string, string> = {
    // DE
    "Selbstbewohnt": "Selbstbewohnt",
    "Zweitwohnsitz": "Zweitwohnsitz",
    "Zweitwohnsitz / Ferienliegenschaft": "Zweitwohnsitz",
    "Vermietet & teilweise selbstbewohnt": "Vermietet & teilweise selbstbewohnt",
    "Rendite-Immobilie": "Rendite-Immobilie",
    "Für eigenes Geschäft": "Für eigenes Geschäft",
    // EN
    "Owner-occupied": "Selbstbewohnt",
    "Second home": "Zweitwohnsitz",
    "Second home / Vacation property": "Zweitwohnsitz",
    "Rented & partially owner-occupied": "Vermietet & teilweise selbstbewohnt",
    "Investment property": "Rendite-Immobilie",
    "For own business": "Für eigenes Geschäft",
    // FR
    "Occupé par le propriétaire": "Selbstbewohnt",
    "Résidence secondaire": "Zweitwohnsitz",
    "Résidence secondaire / Propriété de vacances": "Zweitwohnsitz",
    "Loué et partiellement occupé par le propriétaire": "Vermietet & teilweise selbstbewohnt",
    "Immeuble de rendement": "Rendite-Immobilie",
    "Pour sa propre entreprise": "Für eigenes Geschäft",
    "Pour ma propre entreprise": "Für eigenes Geschäft",
    // IT
    "Abitazione principale": "Selbstbewohnt",
    "Occupato dal proprietario": "Selbstbewohnt",
    "Seconda casa": "Zweitwohnsitz",
    "Seconda casa / Proprietà per vacanze": "Zweitwohnsitz",
    "Affittato e parzialmente occupato dal proprietario": "Vermietet & teilweise selbstbewohnt",
    "Immobile da reddito": "Rendite-Immobilie",
    "Per la propria attività": "Für eigenes Geschäft",
  };

  if (flatData.nutzung) {
    flatData.nutzung = NUTZUNG_MAP[flatData.nutzung] ?? null;
  }

  // Build Case data
  const caseData: Record<string, any> = {};
  if (mainAccountId) caseData.AccountId = mainAccountId;

  // Map all Case fields from funnelToSalesforceMap
  for (const [funnelField, mapping] of Object.entries(funnelToSalesforceMap)) {
    if (mapping.salesforceObject !== "case") continue;

    // Accept alternate key names for korrespondenzsprache and Stage__c
    let value = flatData[funnelField];
    if (funnelField === 'korrespondenzsprache' && (value === undefined || value === null)) {
      value = flatData.korrespondenzSprache || flatData.correspondenceLanguage || value;
    }
    if (funnelField === 'Stage__c' && (value === undefined || value === null)) {
      value = flatData.stage || flatData.stage__c || value;
    }
    if (Array.isArray(value)) value = value.join(", ");

    // Special handling for erhoehung_betrag: only set if erhoehung is "Ja"
    if (funnelField === 'erhoehung_betrag') {
      const erhoehungAnswer = flatData.erhoehung;
      if (erhoehungAnswer !== 'Ja' && erhoehungAnswer !== 'ja' && erhoehungAnswer !== 'yes' && erhoehungAnswer !== 'Yes') {
        console.log(`[Salesforce Sync] SKIPPED erhoehung_betrag because erhoehung is not "Ja": ${erhoehungAnswer}`);
        continue; // Skip this field if user didn't answer "Ja" to the increase question
      }
    }

    const sfField = mapping.salesforceField;
    const sanitized = sanitizeSFValue(sfField, value);

    // Skip null currency fields for Ablösung-specific fields to avoid Salesforce errors
    const isAbloesungCurrencyField = sfField === 'Hypothekarbetrag__c';
    const isNullCurrency = sanitized === null && SALESFORCE_CASE_FIELDS[sfField] === "currency";

    if (sanitized !== undefined && !(isAbloesungCurrencyField && isNullCurrency)) {
      caseData[sfField] = sanitized;
      // Log Ablösung-specific fields for debugging
      if (funnelField === 'abloesung_betrag' || funnelField === 'erhoehung' || funnelField === 'erhoehung_betrag' || funnelField === 'kaufdatum' || funnelField === 'kommentar' || funnelField === 'hypothekarbetrag' || funnelField === 'korrespondenzsprache' || funnelField === 'Stage__c') {
        console.log(`[Salesforce Sync] Mapped ${funnelField}: ${value} → ${sfField}: ${sanitized}`);
      }
    } else {
      // Log when a field is skipped
      if (funnelField === 'abloesung_betrag' || funnelField === 'erhoehung' || funnelField === 'erhoehung_betrag' || funnelField === 'kaufdatum' || funnelField === 'kommentar' || funnelField === 'hypothekarbetrag' || funnelField === 'korrespondenzsprache' || funnelField === 'Stage__c') {
        console.log(`[Salesforce Sync] SKIPPED ${funnelField} (value was undefined after sanitization): ${value}`);
      }
    }
  }

  // Calculate and add Hypothekenbedarf, Eigenmittel %, Tragbarkeit %
  const kaufpreis = Number(flatData.kaufpreis || 0);
  const eigenmittel_bar = Number(flatData.eigenmittel_bar || 0);
  const eigenmittel_saeule3 = Number(flatData.eigenmittel_saeule3 || 0);
  const eigenmittel_pk = Number(flatData.eigenmittel_pk || 0);
  const eigenmittel_schenkung = Number(flatData.eigenmittel_schenkung || 0);
  const eigenmittel = eigenmittel_bar + eigenmittel_saeule3 + eigenmittel_pk + eigenmittel_schenkung;

  // Add total Eigenmittel to Case
  if (eigenmittel > 0) {
    caseData['Eigenmittel__c'] = eigenmittel;
    console.log(`[Salesforce Sync] Total Eigenmittel: ${eigenmittel}`);
  }

  // Tragbarkeit / Eigenmittel % — MUST mirror components/funnelCalc.tsx exactly so
  // Salesforce matches the values the customer saw in the funnel calculator.
  const STRESS_RATE = 0.05;
  const MAINTENANCE_RATE = 0.008;
  const borrowerType = stepData.borrowers?.[0]?.type;
  const isJur = borrowerType === 'jur';
  const grossIncome = Number(flatData.brutto || 0) + Number(flatData.bonus || 0);
  // Primary residence unless the usage is a second / holiday home
  const nutzungLower = String(flatData.nutzung || '').toLowerCase();
  const isZweitwohnsitz =
    nutzungLower.includes('zweit') || nutzungLower.includes('ferien') || nutzungLower.includes('secondary');
  const isPrimaryResidence = !isZweitwohnsitz;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  // Affordability ratio (natural persons only): same formula as funnelCalc.tsx
  const affordabilityPct = (totalMortgage: number): number | null => {
    if (isJur || grossIncome <= 0) return null;
    const amort = isPrimaryResidence ? ((0.8 - 0.6667) / 15) : 0;
    const affordabilityCHF = totalMortgage * (STRESS_RATE + MAINTENANCE_RATE + amort);
    return round1((affordabilityCHF / grossIncome) * 100);
  };

  if (isKauf) {
    // funnelCalc: companies (juristic) count only cash (Bar) as equity
    const ownFundsForCalc = isJur ? eigenmittel_bar : eigenmittel;
    const hypothekenbedarf = Math.max(kaufpreis - ownFundsForCalc, 0);
    caseData['Gesch_tzter_Hypothekenbedarf__c'] = hypothekenbedarf;

    if (kaufpreis > 0) caseData['EigenmittelProzent__c'] = round1((ownFundsForCalc / kaufpreis) * 100);

    const tragb = affordabilityPct(hypothekenbedarf);
    if (tragb !== null) caseData['Tragbarkeit__c'] = tragb;

    console.log(`[Salesforce Sync] Kauf calc: Hypothekenbedarf=${hypothekenbedarf}, Eigenmittel%=${caseData['EigenmittelProzent__c']}, Tragbarkeit%=${caseData['Tragbarkeit__c']}`);
  } else if (isAbloesung) {
    // totalMortgage = bestehende Hypothek + Erhöhung (falls Ja)
    const betrag = Number(flatData.abloesung_betrag || 0);
    const erhoehungJa = String(flatData.erhoehung).toLowerCase() === 'ja' || String(flatData.erhoehung).toLowerCase() === 'yes';
    const erhoehung = erhoehungJa ? Number(flatData.erhoehung_betrag || 0) : 0;
    const hypothekenbedarf = betrag + erhoehung;
    caseData['Gesch_tzter_Hypothekenbedarf__c'] = hypothekenbedarf;

    const propertyValue = Number(flatData.immobilienwert || 0) || Number(flatData.kaufpreis || 0) || hypothekenbedarf;
    if (propertyValue > 0) caseData['EigenmittelProzent__c'] = round1(((propertyValue - hypothekenbedarf) / propertyValue) * 100);

    const tragb = affordabilityPct(hypothekenbedarf);
    if (tragb !== null) caseData['Tragbarkeit__c'] = tragb;

    console.log(`[Salesforce Sync] Ablösung calc: Hypothekenbedarf=${hypothekenbedarf}, Eigenmittel%=${caseData['EigenmittelProzent__c']}, Tragbarkeit%=${caseData['Tragbarkeit__c']}`);
  }

  // Add partner email AFTER mapping to prevent it from being overwritten
  // TODO: Uncomment after creating Partner_Email__c field in Salesforce
  // if (partnerEmail) {
  //   caseData['Partner_Email__c'] = partnerEmail;
  //   console.log(`[Salesforce Sync] Added partner email to Case: ${partnerEmail}`);
  // }

  // ONLY link Client 2 Account if there are actually 2 or more persons (moved to end after cleanup)

  // FINANCING LOGIC: Temporarily store bank data to apply after cleanup
  let bankData: Record<string, any> = {};
  const hasFinancingOffers = flatData.finanzierungsangebote;
  const hasFinancing = hasFinancingOffers === 'Ja' || hasFinancingOffers === true || hasFinancingOffers === 'yes' || hasFinancingOffers === 'ja';

  console.log('[Salesforce Sync] finanzierungsangebote:', flatData.finanzierungsangebote, 'hasFinancing:', hasFinancing);

  if (hasFinancing) {
    console.log('[Salesforce Sync] Financing offers exist - mapping bank fields');
    
    // Map multiple bank offers from angebote array
    const angebote = flatData.angebote || stepData.property?.angebote || [];
    console.log('[Salesforce Sync] angebote array:', JSON.stringify(angebote, null, 2));
    
    if (Array.isArray(angebote) && angebote.length > 0) {
      // First bank offer
      if (angebote[0]) {
        bankData['Bank__c'] = angebote[0].bank || null;
        bankData['Zins__c'] = parsePercent(angebote[0].zins);
        bankData['Laufzeit__c'] = angebote[0].laufzeit || null;
        console.log('[Salesforce Sync] Bank 1:', angebote[0].bank, 'Zins:', angebote[0].zins, 'Laufzeit:', angebote[0].laufzeit);
      }
      
      // Second bank offer
      if (angebote[1]) {
        bankData['Bank2__c'] = angebote[1].bank || null;
        bankData['Zins2__c'] = parsePercent(angebote[1].zins);
        bankData['Laufzeit2__c'] = angebote[1].laufzeit || null;
        console.log('[Salesforce Sync] Mapped second bank offer');
      }
      
      // Third bank offer
      if (angebote[2]) {
        bankData['Bank3__c'] = angebote[2].bank || null;
        bankData['Zins3__c'] = parsePercent(angebote[2].zins);
        bankData['Laufzeit3__c'] = angebote[2].laufzeit || null;
        console.log('[Salesforce Sync] Mapped third bank offer');
      }
    }
  }

  // Set Hypothekarvolumen__c based on project type
  if (isKauf && caseData['Gesch_tzter_Hypothekenbedarf__c']) {
    // For purchase: use calculated mortgage need
    caseData['Hypothekarvolumen__c'] = caseData['Gesch_tzter_Hypothekenbedarf__c'];
  } else if (isAbloesung) {
    // For refinancing: use total (abloesung_betrag + hypothekarbetrag + erhoehung if applicable)
    const abloesungBetrag = Number(flatData.abloesung_betrag || 0);
    const hypothekarBetrag = Number(flatData.hypothekarbetrag || 0);
    const erhoehungBetrag = flatData.erhoehung === 'Ja' ? Number(flatData.erhoehung_betrag || 0) : 0;
    const totalVolumen = abloesungBetrag + hypothekarBetrag + erhoehungBetrag;
    if (totalVolumen > 0) {
      caseData['Hypothekarvolumen__c'] = totalVolumen;
      console.log(`[Salesforce Sync] Hypothekarvolumen: ${abloesungBetrag} + ${hypothekarBetrag} + ${erhoehungBetrag} = ${totalVolumen}`);
    }
  }

  // Property location. Direct: PLZ/Ort come from the client. Partner: from the property
  // section. Both land in flatData (client spread last wins for direct; property provides
  // them for partner). PropertyStep makes both mandatory, so they are normally present.
  const plz = String(flatData.zip || flatData.liegenschaftZip || '').trim();
  const ort = String(flatData.ort || '').trim();
  // PLZ and Ort read together as one location ("8001 Zürich").
  const location = [plz, ort].filter(Boolean).join(' ');

  // Populate the Objektinformationen fields too — the funnel already asks for this, and
  // until now it was only ever used to build the Case name.
  if (location) caseData['PLZ_Ort__c'] = location;
  if (ort) caseData['City__c'] = ort;
  console.log(`[Salesforce Sync] Location → PLZ_Ort__c: "${location}", City__c: "${ort}"`);

  // Document completeness (spec: Dokumenten-Upload & Completeness-Check).
  // The verdict is computed in the funnel, because only the client knows which document
  // sections were rendered for this case type. Written into fields that already existed
  // on Case and had never been populated.
  const completeness = stepData.documentCompleteness;
  if (completeness && typeof completeness === 'object') {
    caseData['Documents_completed__c'] = completeness.complete === true;

    for (const [field, provided] of Object.entries(completeness.salesforceFlags || {})) {
      caseData[field] = provided === true;
    }

    // Human-readable state for the Dokumenten-Check tab. German on purpose: this is read
    // by HYPOTEQ staff, not by the customer, whatever locale the funnel ran in.
    // Resolve i18n keys to readable German labels. The Dokumenten-Check tab is read by
    // HYPOTEQ staff, so it stays German whatever locale the funnel ran in — and a raw
    // "funnel.salaryStatementBonus" in the CRM helps nobody.
    const missingLabels: string[] = Array.isArray(completeness.missingLabels)
      ? completeness.missingLabels
      : resolveDocLabelsDe(completeness.missing || []);
    // Dokumenten_Check_State__c is NOT free text: it is the JSON "checked map" that drives
    // the Dokumenten-Check tab. Writing German prose into it, as this once did, left the tab
    // unable to parse its own state — so that was disabled, and the tab then showed
    // "0 / 11 Dokumente" on every dossier no matter what the customer had uploaded, because
    // the tab does not read the Dok_*__c booleans below. It reads only this field.
    //
    // The schema is now known (read back off Cases staff had saved by hand) and lives in
    // dokumentenCheckState.ts. Nothing is merged here: this runs at submit time, when the
    // Case is being created and has no state to preserve.
    const { buildDokumentenCheckState, tabEntriesFor, unmappedSupplied } = await import('./dokumentenCheckState');
    const supplied: string[] = Array.isArray(completeness.supplied) ? completeness.supplied : [];
    const checkState = buildDokumentenCheckState(supplied);
    if (checkState) caseData['Dokumenten_Check_State__c'] = checkState;

    // Documents the customer supplied that the tab has no entry for. Logged rather than
    // dropped in silence: it is the only signal that the tab's checklist and the funnel's
    // document set have drifted apart, and it reads as "the sync is broken" otherwise.
    const notShown = unmappedSupplied(supplied);
    if (notShown.length) {
      console.warn(
        `[Salesforce Sync] ${notShown.length} uploaded document(s) have no Dokumenten-Check entry ` +
        `and will not appear in the tab: ${notShown.join(', ')}`
      );
    }

    console.log(
      `[Salesforce Sync] Documents complete=${completeness.complete}, ` +
      `missing=${missingLabels.length}, supplied=${supplied.length}, ` +
      `tab entries ticked=${tabEntriesFor(supplied).length}, ` +
      `flags=${JSON.stringify(completeness.salesforceFlags)}`
    );
  }

  // Set Case Name if not already set.
  // Convention: "PLZ Ort / <borrower names>" — every borrower as "Vorname Name"
  // (companies as Firmenname), multiple borrowers joined with " & ".
  if (!caseData['Case_Name__c']) {
    const { getBorrowerDisplayName } = await import('./funnelPersonNames');
    // Fall back to the normalized persons list when the raw funnel data yields nothing
    // (e.g. partner submissions where the name only exists on the Account).
    const namePart =
      getBorrowerDisplayName(stepData) ||
      persons
        .map((p: any) => `${p.firstName || ''} ${p.lastName || ''}`.trim())
        .filter(Boolean)
        .join(' & ');

    // Only the name is slash-separated from the location.
    const parts = [location, namePart].filter(Boolean);
    // Last resort: a timestamp tells a caseworker nothing. Fall back to whoever submitted
    // the lead so an incomplete Case is still identifiable and chaseable in Salesforce.
    const submitter = partnerEmail || flatData.email || '';
    caseData['Case_Name__c'] =
      parts.join(' / ') ||
      (submitter ? `Unvollständige Anfrage – ${submitter}` : `Unvollständige Anfrage ${new Date().toISOString().slice(0, 10)}`);
  }

  // Clean up: Remove non-Case fields
  for (const key of Object.keys(caseData)) {
    if (!SALESFORCE_CASE_FIELDS[key] && key !== "AccountId") {
      console.warn(`🧹 Removing non-case field from Case: ${key}`);
      delete caseData[key];
    }
  }

  // Validate field types
  for (const [field, type] of Object.entries(SALESFORCE_CASE_FIELDS)) {
    const value = caseData[field];
    if (value == null) continue;
    
    if (type === "currency" && typeof value !== "number") {
      console.error(`❌ Currency field got non-number`, field, value);
      caseData[field] = null;
    }
    if (type === "percent" && typeof value !== "number") {
      const n = Number(value);
      caseData[field] = Number.isFinite(n) ? n : null;
    }
    if (type === "boolean" && typeof value !== "boolean") {
      console.error(`❌ Boolean field got non-boolean`, field, value);
      caseData[field] = false;
    }
    if (type === "date" && typeof value !== "string") {
      caseData[field] = null;
    }
  }

  // Convert empty strings to null
  Object.keys(caseData).forEach(
    k => caseData[k] === "" && (caseData[k] = null)
  );

  // Apply bank data AFTER cleanup to prevent it being removed
  console.log('[Salesforce Sync] Applying bank data after cleanup:', JSON.stringify(bankData, null, 2));
  Object.assign(caseData, bankData);

  // Link Client lookup fields AFTER all cleanup to prevent them being overwritten
  if (mainAccountId) {
    caseData['Client__c'] = mainAccountId;
    console.log(`[Salesforce Sync] Linked Client Account: ${mainAccountId}`);
  }
  console.log(`[Salesforce Sync] Number of clients: ${persons.length}`);

  // Add Erwerbsstatus to Case (only for natural persons)
  const firstPerson = persons[0];
  const isJuristicPerson = (firstPerson as any)?.isJuristic === true;
  if (firstPerson && !isJuristicPerson && firstPerson.erwerbsstatus) {
    caseData['If_nat_rliche_person__c'] = transformErwerbsstatus(firstPerson.erwerbsstatus);
    console.log(`[Salesforce Sync] Adding Erwerbsstatus to Case: ${firstPerson.erwerbsstatus} -> ${caseData['If_nat_rliche_person__c']}`);
  }
  
  if (persons.length >= 2 && accounts[1]) {
    const account2Id = accounts[1].id || accounts[1].Id;
    caseData['Client_2__c'] = account2Id;
    console.log(`[Salesforce Sync] Linked Client 2 Account: ${account2Id}`);
  } else {
    caseData['Client_2__c'] = null;
  }

  if (persons.length >= 3 && accounts[2]) {
    const account3Id = accounts[2].id || accounts[2].Id;
    caseData['Client_3__c'] = account3Id;
    console.log(`[Salesforce Sync] Linked Client 3 Account: ${account3Id}`);
  } else {
    caseData['Client_3__c'] = null;
  }

  // Two distinct roles, two distinct Case fields — they were previously conflated:
  //   - Kundenberater / customer advisor = Partner_Consultant__c, a *Contact* lookup.
  //     Only a partner submission has one (the submitting partner's own Contact).
  //   - Sales Partner = SALES_PARTNER_FIELD, an *Account* lookup (the partner company).
  //     Direct-customer leads belong to HYPOTEQ AG itself.
  // A direct lead must NOT put HYPOTEQ into Partner_Consultant__c — HYPOTEQ AG is the
  // sales partner, not the customer's advisor.
  if (partnerEmail) {
    try {
      const partnerContact = await salesforceApi.findContactByEmail(partnerEmail);
      if (partnerContact) {
        const partnerContactId = partnerContact.Id || partnerContact.id;
        caseData['Partner_Consultant__c'] = partnerContactId;
        console.log(`[Salesforce Sync] Linked partner contact to Case: ${partnerContactId}`);
      } else {
        console.log(`[Salesforce Sync] Partner contact not found for email: ${partnerEmail}`);
      }
    } catch (err) {
      console.error(`[Salesforce Sync] Error finding partner contact:`, err);
    }
  } else {
    // Direktkundenfunnel → HYPOTEQ AG is the sales partner. Resolve its Account by name.
    // Deliberately lookup-only: silently creating a second "HYPOTEQ AG" Account would
    // split the org's own pipeline across duplicates, so a miss is logged loudly instead.
    try {
      // salesforceApi is `any` and callers pass its *default export* object, so a
      // function absent from that object is silently undefined. Assert rather than
      // let the TypeError disappear into the catch below.
      if (typeof salesforceApi.findAccountByName !== 'function') {
        throw new Error(
          'salesforceApi.findAccountByName is not a function — it is likely missing from the ' +
          'default export in components/salesforceApi.ts'
        );
      }
      const hypoteqAccount = await salesforceApi.findAccountByName(HYPOTEQ_ACCOUNT_NAME);
      const hypoteqAccountId = hypoteqAccount?.Id || hypoteqAccount?.id;
      if (hypoteqAccountId) {
        caseData[SALES_PARTNER_FIELD] = hypoteqAccountId;
        console.log(`[Salesforce Sync] Direct client → sales partner ${HYPOTEQ_ACCOUNT_NAME}: ${hypoteqAccountId}`);
      } else {
        console.error(
          `[Salesforce Sync] Sales partner Account "${HYPOTEQ_ACCOUNT_NAME}" not found — Case will have no sales partner. ` +
          `Create the Account or set HYPOTEQ_ACCOUNT_NAME to its exact name.`
        );
      }
    } catch (err) {
      console.error(`[Salesforce Sync] Error resolving HYPOTEQ sales partner Account:`, err);
    }
  }

  console.log('[Salesforce Sync] Full caseData before sending:', JSON.stringify(caseData, null, 2));

  // Create the Case
  const createdCase = await salesforceApi.createOrUpdateCase(caseData);
  console.log(`[Salesforce Sync] Case created: ${createdCase.id || createdCase.Id}`);

  console.log('[Salesforce Sync] ✅ Sync completed successfully');
  
  return {
    accounts,
    contacts,
    case: createdCase,
  };
}