import { SALESFORCE_ACCOUNT_FIELDS } from "./salesforceAccountFieldConfig";
import { funnelToSalesforceMap } from './funnelToSalesforceMap';
import { SALESFORCE_CASE_FIELDS, SFFieldType } from "./salesforceFieldConfig";

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
  if (!person.email || person.email.trim() === '') {
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

  // For Ablösung, use abloesedatum as kaufdatum and Abl_sung__c in Salesforce
  if ((flatData.projektArt === 'abloesung' || flatData.projektArt === 'Ablösung') && flatData.abloesedatum) {
    flatData.kaufdatum = flatData.abloesedatum;
    flatData.abloesung_betrag = flatData.abloesedatum; // This will be mapped to Abl_sung__c
  }

  // Extract partner email if customerType is "partner" (doesn't create Account, just stored in Case)
  let partnerEmail: string | null = null;
  if (stepData.customerType === 'partner' && stepData.client?.email) {
    partnerEmail = stepData.client.email;
    console.log(`[Salesforce Sync] Partner email detected: ${partnerEmail}`);
  }

  // Extract persons from kreditnehmer array (end-customers who will get Accounts)
  const persons: any[] = [];
  
  // Use kreditnehmer array as primary source (end-customer data)
  if (Array.isArray(stepData.property?.kreditnehmer) && stepData.property.kreditnehmer.length > 0) {
    for (let i = 0; i < stepData.property.kreditnehmer.length; i++) {
      const kn = stepData.property.kreditnehmer[i];
      
      // Check if it's a juristic person (company) by checking for firmenname
      const isJuristicPerson = kn.firmenname || stepData.borrowers?.[0]?.type === 'jur';
      
      if (isJuristicPerson) {
        // For juristic persons - use company name as LastName, but also send contact person details
        if (kn.firmenname) {
          persons.push({
            firstName: kn.vorname || '',
            lastName: kn.firmenname,
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
        if ((kn.email || kn.emailAdresse) && (kn.vorname || kn.name || kn.firstName)) {
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

  // VALIDATION: At least 1 person required
  if (persons.length === 0) {
    throw new Error('At least one person is required');
  }

  // VALIDATION: Validate each person
  const validationErrors: string[] = [];
  persons.forEach((person, index) => {
    // Skip email/phone validation for juristic persons
    const isJuristicPerson = (person as any).isJuristic === true;
    const errors = validatePersonData(person, index + 1, false, isJuristicPerson);
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

    // STEP 1: Find or create Account using email as unique key (same for everyone)
    let account = await salesforceApi.findAccountByEmail(email);
    
    // Prepare Account data - Person Account fields for everyone (companies and individuals)
    const accountData: Record<string, any> = {
      LastName: lastName,
      FirstName: isJuristicPerson ? firstName : firstName, // Use contact person first name for companies
      PersonEmail: email,
      Phone: phone,
    };
    // Optionally, add contactLastName as a custom field if needed in Salesforce
    if (isJuristicPerson && person.contactLastName) {
      accountData.Contact_LastName__c = person.contactLastName;
    }
    
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
      const updateData: Record<string, any> = {
        Phone: phone,
      };
      
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

  // STEP 3: Create ONE Case linked to the main Account (first person)
  const mainAccount = accounts[0];
  const mainAccountId = mainAccount.id || mainAccount.Id;

  console.log(`[Salesforce Sync] Creating Case linked to main Account: ${mainAccountId}`);

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

  flatData.artLiegenschaft =
    flatData.artLiegenschaft === "Single-family home" ? "Einfamilienhaus" :
    flatData.artLiegenschaft === "Multi-family home" ? "Mehrfamilienhaus" :
    flatData.artLiegenschaft === "Apartment" ? "Wohnung" :
    flatData.artLiegenschaft === "Wohnung" ? "Wohnung" :
    flatData.artLiegenschaft === "Commercial property" ? "Gewerbeimmobilie" :
    flatData.artLiegenschaft === "Mixed-use property" ? "Gemischte Nutzung" :
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
    // German keys
    "Selbstbewohnt": "Selbstbewohnt",
    "Zweitwohnsitz / Ferienliegenschaft": "Zweitwohnsitz",
    "Vermietet & teilweise selbstbewohnt": "Vermietet & teilweise selbstbewohnt",
    "Rendite-Immobilie": "Rendite-Immobilie",
    "Für eigenes Geschäft": "Für eigenes Geschäft",
    // English keys
    "Owner-occupied": "Selbstbewohnt",
    "Second home / Vacation property": "Zweitwohnsitz",
    "Rented & partially owner-occupied": "Vermietet & teilweise selbstbewohnt",
    "Investment property": "Rendite-Immobilie",
    "For own business": "Für eigenes Geschäft",
  };

  if (flatData.nutzung) {
    flatData.nutzung = NUTZUNG_MAP[flatData.nutzung] ?? null;
  }

  // Build Case data
  const caseData: Record<string, any> = {
    AccountId: mainAccountId,
  };

  // Map all Case fields from funnelToSalesforceMap
  for (const [funnelField, mapping] of Object.entries(funnelToSalesforceMap)) {
    if (mapping.salesforceObject !== "case") continue;
    
    let value = flatData[funnelField];
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
    const isAbloesungCurrencyField = ['Abl_sung__c', 'Hypothekarbetrag__c'].includes(sfField);
    const isNullCurrency = sanitized === null && SALESFORCE_CASE_FIELDS[sfField] === "currency";
    
    if (sanitized !== undefined && !(isAbloesungCurrencyField && isNullCurrency)) {
      caseData[sfField] = sanitized;
      // Log Ablösung-specific fields for debugging
      if (funnelField === 'abloesung_betrag' || funnelField === 'erhoehung' || funnelField === 'erhoehung_betrag' || funnelField === 'kaufdatum' || funnelField === 'kommentar' || funnelField === 'hypothekarbetrag') {
        console.log(`[Salesforce Sync] Mapped ${funnelField}: ${value} → ${sfField}: ${sanitized}`);
      }
    } else {
      // Log when a field is skipped
      if (funnelField === 'abloesung_betrag' || funnelField === 'erhoehung' || funnelField === 'erhoehung_betrag' || funnelField === 'kaufdatum' || funnelField === 'kommentar' || funnelField === 'hypothekarbetrag') {
        console.log(`[Salesforce Sync] SKIPPED ${funnelField} (value was undefined after sanitization): ${value}`);
      }
    }
  }

  // Calculate and add Hypothekenbedarf, Eigenmittel %, Tragbarkeit %
  const projektArt = flatData.projektArt?.toLowerCase();
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

  if (projektArt === 'kauf') {
    // Calculate mortgage need for purchase
    const hypothekenbedarf = Math.max(kaufpreis - eigenmittel, 0);
    caseData['Hypothekenbedarf__c'] = hypothekenbedarf;

    // Calculate Eigenmittel percentage
    const eigenmittelPct = kaufpreis > 0 ? Math.round((eigenmittel / kaufpreis) * 100) : 0;
    caseData['Eigenmittel_Prozent__c'] = eigenmittelPct.toString();

    // Calculate Tragbarkeit percentage (only for natural persons)
    const borrowerType = stepData.borrowers?.[0]?.type;
    const isJur = borrowerType === 'jur';
    
    if (!isJur) {
      const einkommen = Number(flatData.brutto || 0) + Number(flatData.bonus || 0);
      const STRESS_RATE = 0.05;
      const tragbarkeitPct = einkommen > 0
        ? (((hypothekenbedarf * STRESS_RATE + kaufpreis * 0.008) / einkommen) * 100).toFixed(0)
        : '0';
      caseData['Tragbarkeit_Prozent__c'] = tragbarkeitPct;
    }

    console.log(`[Salesforce Sync] Calculated: Hypothekenbedarf=${hypothekenbedarf}, Eigenmittel=${eigenmittelPct}%`);
  } else if (projektArt === 'abloesung') {
    // Calculate mortgage need for refinancing
    const betrag = Number(flatData.abloesung_betrag || 0);
    const erhoehung = flatData.erhoehung === 'Ja' ? Number(flatData.erhoehung_betrag || 0) : 0;
    const hypothekenbedarf = betrag + erhoehung;
    caseData['Hypothekenbedarf__c'] = hypothekenbedarf;
    
    // Note: Erh_hung__c (Ja/Nein checkbox) is already set from the mapping loop
    // Don't overwrite it with the total amount
    console.log(`[Salesforce Sync] Hypothekenbedarf for Ablösung: ${hypothekenbedarf}`);

    const propertyValue = Number(flatData.immobilienwert || 0) || hypothekenbedarf;
    const eigenmittelPct = propertyValue > 0 ? Math.round(((propertyValue - hypothekenbedarf) / propertyValue) * 100) : 0;
    caseData['Eigenmittel_Prozent__c'] = eigenmittelPct.toString();

    // Calculate Tragbarkeit for refinancing (natural persons only)
    const borrowerType = stepData.borrowers?.[0]?.type;
    const isJur = borrowerType === 'jur';
    
    if (!isJur) {
      const einkommen = Number(flatData.brutto || 0);
      const STRESS_RATE = 0.05;
      const tragbarkeitPct = einkommen > 0
        ? (((hypothekenbedarf * STRESS_RATE + propertyValue * 0.008) / einkommen) * 100).toFixed(0)
        : '0';
      caseData['Tragbarkeit_Prozent__c'] = tragbarkeitPct;
    }

    console.log(`[Salesforce Sync] Calculated: Hypothekenbedarf=${hypothekenbedarf}, Eigenmittel=${eigenmittelPct}%`);
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
        bankData['Zins__c'] = angebote[0].zins || null;
        bankData['Laufzeit__c'] = angebote[0].laufzeit || null;
        console.log('[Salesforce Sync] Bank 1:', angebote[0].bank, 'Zins:', angebote[0].zins, 'Laufzeit:', angebote[0].laufzeit);
      }
      
      // Second bank offer
      if (angebote[1]) {
        bankData['Bank2__c'] = angebote[1].bank || null;
        bankData['Zins2__c'] = angebote[1].zins || null;
        bankData['Laufzeit2__c'] = angebote[1].laufzeit || null;
        console.log('[Salesforce Sync] Mapped second bank offer');
      }
      
      // Third bank offer
      if (angebote[2]) {
        bankData['Bank3__c'] = angebote[2].bank || null;
        bankData['Zins3__c'] = angebote[2].zins || null;
        bankData['Laufzeit3__c'] = angebote[2].laufzeit || null;
        console.log('[Salesforce Sync] Mapped third bank offer');
      }
    }
  }

  // Set Hypothekarvolumen__c based on project type
  if (projektArt === 'kauf' && caseData['Hypothekenbedarf__c']) {
    // For purchase: use calculated Hypothekenbedarf
    caseData['Hypothekarvolumen__c'] = caseData['Hypothekenbedarf__c'];
  } else if (projektArt === 'abloesung') {
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

  // Set Case Name if not already set
  if (!caseData['Case_Name__c']) {
    const person1 = persons[0];
    const defaultName = `${person1.firstName || person1.vorname || ''} ${person1.lastName || person1.nachname || person1.name || ''} ${flatData.projektArt || ''}`.trim() || `Case ${Date.now()}`;
    caseData['Case_Name__c'] = defaultName;
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
  caseData['Client__c'] = mainAccountId;
  console.log(`[Salesforce Sync] Linked Client Account: ${mainAccountId}`);
  console.log(`[Salesforce Sync] Number of clients: ${persons.length}`);
  
  // Add Erwerbsstatus to Case (only for natural persons)
  const firstPerson = persons[0];
  const isJuristicPerson = (firstPerson as any).isJuristic === true;
  if (!isJuristicPerson && firstPerson.erwerbsstatus) {
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