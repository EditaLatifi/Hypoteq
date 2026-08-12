import { Connection } from 'jsforce';

const SF_CLIENT_ID = process.env.SF_CLIENT_ID || '';
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET || '';
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

const conn = new Connection({ instanceUrl: SF_LOGIN_URL });

export { conn }; // Export connection for direct queries

export async function login() {
  try {
    const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: SF_CLIENT_ID,
        client_secret: SF_CLIENT_SECRET,
      }).toString(),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`OAuth token request failed: ${res.status} ${errorData}`);
    }

    const { access_token, instance_url } = await res.json();

    conn.accessToken = access_token;
    conn.instanceUrl = instance_url;
  } catch (error) {
    console.error('[Salesforce OAuth] Login failed:', error);
    throw error;
  }
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
    // Same defensive retries as the Case path. Orgs differ in which optional columns exist
    // — this one has no standard address fields on Account at all — and a single unknown
    // field must not cost the whole lead, since the Account is created before the Case.
    const result = await writeWithFieldFallback(
      (f) => conn.sobject('Account').create(f),
      accountData,
      'create Account',
      'Account',
    );
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
    const result = await writeWithFieldFallback(
      (f) => (conn.sobject('Account') as any).update(f),
      { Id: id, ...fields },
      `update Account ${id}`,
      'Account',
    );
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
async function writeWithFieldFallback(
  op: (fields: Record<string, any>) => Promise<any>,
  fields: Record<string, any>,
  context: string,
  sobjectType: string = 'Case',
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
        const match = message.match(
          new RegExp(`No such column '([^']+)' on (?:sobject|entity) of type ${sobjectType}`, 'i')
        );
        const badField = match?.[1];
        if (badField && badField in working) {
          console.warn(`[Salesforce] ${context}: dropping unknown ${sobjectType} field '${badField}' and retrying`);
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
        return writeWithFieldFallback(
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
  return writeWithFieldFallback(
    (f) => conn.sobject('Case').create(f),
    fields,
    'create Case',
  );
}

// Cached per warm instance — the Id is fixed for the org. Only the success path is
// cached, so granting the record type takes effect without a redeploy.
let personAccountRecordTypeId: string | null = null;

export async function getPersonAccountRecordTypeId(): Promise<string> {
  if (personAccountRecordTypeId) return personAccountRecordTypeId;

  const result = await conn.query(
    "SELECT Id, DeveloperName FROM RecordType WHERE SObjectType = 'Account' AND IsPersonType = true AND IsActive = true LIMIT 1"
  );
  const recordType = result.records?.[0] as any;
  if (!recordType?.Id) {
    throw new Error(
      '[Salesforce] No active Person Account record type in this org — every funnel Account write will fail.'
    );
  }

  // A RecordType row stays *readable* even when the running user may not USE it, so the
  // query above proves nothing on its own. describe() reports availability for the running
  // user, and skipping that check is exactly how an integration-user change broke every
  // sync silently: the Id resolved fine and Salesforce rejected the insert downstream with
  // an error nobody was watching for.
  const meta = await (conn.sobject('Account') as any).describe();
  const info = (meta?.recordTypeInfos || []).find((rt: any) => rt.recordTypeId === recordType.Id);
  if (info && info.available === false) {
    throw new Error(
      `[Salesforce] The Person Account record type (${recordType.DeveloperName} / ${recordType.Id}) is not ` +
      `assigned to the integration user this connected app runs as. No Account — and therefore no Case — ` +
      `can be created until it is granted: Setup → Users → (integration user) → Profile or Permission Set ` +
      `→ Record Type Settings → Account → add "Person Account".`
    );
  }

  personAccountRecordTypeId = recordType.Id;
  return recordType.Id;
}

// NOTE: consumers import this default object (app/api/inquiry/route.ts), and
// syncFunnelStepsToSalesforce types it as `any` — so a function missing from this
// list is `undefined` at runtime with no compile error. Keep it in sync with the
// named exports above when adding a function.
export default {
  login,
  getPersonAccountRecordTypeId,
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
