import { Connection } from 'jsforce';

const SF_USERNAME = process.env.SF_USERNAME || '';
const SF_PASSWORD = process.env.SF_PASSWORD || '';
const SF_TOKEN = process.env.SF_TOKEN || '';
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

const conn = new Connection({ loginUrl: SF_LOGIN_URL });

export { conn }; // Export connection for direct queries

export async function login() {
  await conn.login(SF_USERNAME, SF_PASSWORD + SF_TOKEN);
}

export async function findPersonAccountByEmail(email: string) {
  return conn.sobject('Account').findOne({ PersonEmail: email });
}

// Look up a business Account by its exact name. Used to resolve the sales-partner
// Account (HYPOTEQ AG for direct clients, Betterhomes/Remax/... for partner leads).
// Person Accounts are excluded — a sales partner is always a company.
export async function findAccountByName(name: string) {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const result = await conn.query(
    `SELECT Id, Name FROM Account WHERE Name = '${escaped}' AND IsPersonAccount = false LIMIT 1`
  );
  return result.records && result.records.length > 0 ? result.records[0] : null;
}

export async function findAccountByEmail(email: string) {
  // Query to get account with IsPersonAccount field to determine type
  const result = await conn.query(`SELECT Id, PersonEmail, IsPersonAccount FROM Account WHERE PersonEmail = '${email}' LIMIT 1`);
  return result.records && result.records.length > 0 ? result.records[0] : null;
}

export async function createPersonAccount(fields: Record<string, any>) {
  return conn.sobject('Account').create({ ...fields, RecordTypeId: await getPersonAccountRecordTypeId() });
}

export async function createAccount(fields: Record<string, any>) {
  const recordTypeId = await getPersonAccountRecordTypeId();
  const accountData = { ...fields, RecordTypeId: recordTypeId };
  console.log('[Salesforce API] Creating Account with data:', JSON.stringify(accountData, null, 2));
  try {
    const result = await conn.sobject('Account').create(accountData);
    console.log('[Salesforce API] Account created:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Salesforce API] Create Account failed:', error);
    throw error;
  }
}

export async function findContactByEmail(email: string) {
  return conn.sobject('Contact').findOne({ Email: email });
}

export async function createContact(fields: Record<string, any>) {
  return conn.sobject('Contact').create(fields);
}

export async function updateContact(id: string, fields: Record<string, any>) {
  return conn.sobject('Contact').update({ Id: id, ...fields });
}

export async function updatePersonAccount(id: string, fields: Record<string, any>) {
  console.log('[Salesforce API] Updating Person Account:', id, JSON.stringify(fields, null, 2));
  try {
    const result = await conn.sobject('Account').update({ Id: id, ...fields });
    console.log('[Salesforce API] Update result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Salesforce API] Update Person Account failed:', error);
    throw error;
  }
}

// Execute a Case write (create or update) with defensive retries. Three classes of error
// were silently killing Cases in production before this helper was hardened:
//   - INVALID_FIELD: the __c column doesn't exist in this org. Drop and retry.
//   - STRING_TOO_LONG: value exceeds the SF field's max length. Truncate and retry.
//   - INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: value isn't a valid picklist option
//     (e.g. a French label not yet mapped to the German SF value). Drop and retry.
// Any other error propagates so it surfaces in logs.
async function writeCaseWithFieldFallback(
  op: (fields: Record<string, any>) => Promise<any>,
  fields: Record<string, any>,
  context: string,
): Promise<any> {
  const working = { ...fields };
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await op(working);
    } catch (error: any) {
      const code: string = error?.errorCode || error?.data?.errorCode || '';
      const message: string = error?.data?.message || error?.message || '';
      const errFields: string[] = error?.data?.fields || error?.fields || [];

      if (code === 'INVALID_FIELD') {
        const match = message.match(/No such column '([^']+)' on (?:sobject|entity) of type Case/i);
        const badField = match?.[1];
        if (badField && badField in working) {
          console.warn(`[Salesforce] ${context}: dropping unknown Case field '${badField}' and retrying`);
          delete working[badField];
          continue;
        }
        throw error;
      }

      if (code === 'STRING_TOO_LONG') {
        const lenMatch = message.match(/max length\s*=\s*(\d+)/i);
        const max = lenMatch ? parseInt(lenMatch[1], 10) : null;
        const target = errFields.find(f => f in working);
        if (target && max && max > 3 && typeof working[target] === 'string') {
          const original = working[target] as string;
          working[target] = original.slice(0, max - 3) + '...';
          console.warn(`[Salesforce] ${context}: truncating '${target}' from ${original.length} -> ${max} chars and retrying`);
          continue;
        }
        throw error;
      }

      if (code === 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST') {
        const target = errFields.find(f => f in working);
        if (target) {
          console.warn(`[Salesforce] ${context}: dropping invalid picklist value for '${target}' ('${working[target]}') and retrying`);
          delete working[target];
          continue;
        }
        throw error;
      }

      throw error;
    }
  }
  throw new Error(`[Salesforce] ${context}: exceeded retry limit`);
}

export async function createOrUpdateCase(fields: Record<string, any>) {
  // Check if a case already exists for this account to prevent duplicates
  // Look for recent cases (created in last 5 minutes) with same AccountId
  const accountId = fields.AccountId;
  if (accountId) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const query = `SELECT Id FROM Case WHERE AccountId = '${accountId}' AND CreatedDate >= ${fiveMinutesAgo} ORDER BY CreatedDate DESC LIMIT 1`;

    try {
      const result = await conn.query(query);
      if (result.records && result.records.length > 0) {
        const existingCaseId = result.records[0].Id as string;
        console.log(`[Salesforce] Found recent case ${existingCaseId}, updating instead of creating duplicate`);
        const updateFields = { ...fields, Id: existingCaseId };
        return writeCaseWithFieldFallback(
          (f) => (conn.sobject('Case') as any).update(f),
          updateFields,
          `update ${existingCaseId}`,
        );
      }
    } catch (err) {
      console.log('[Salesforce] No recent case found, creating new one');
    }
  }

  // Create new case if no recent one exists
  return writeCaseWithFieldFallback(
    (f) => conn.sobject('Case').create(f),
    fields,
    'create Case',
  );
}

async function getPersonAccountRecordTypeId() {
  const result = await conn.query(
    "SELECT Id FROM RecordType WHERE SObjectType = 'Account' AND IsPersonType = true LIMIT 1"
  );
  return result.records[0]?.Id;
}

// NOTE: consumers import this default object (app/api/inquiry/route.ts), and
// syncFunnelStepsToSalesforce types it as `any` — so a function missing from this
// list is `undefined` at runtime with no compile error. Keep it in sync with the
// named exports above when adding a function.
export default {
  login,
  findPersonAccountByEmail,
  findAccountByEmail,
  findAccountByName,
  createPersonAccount,
  createAccount,
  findContactByEmail,
  createContact,
  updateContact,
  updatePersonAccount,
  createOrUpdateCase,
};
