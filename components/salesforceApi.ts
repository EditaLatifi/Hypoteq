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
        return conn.sobject('Case').update(updateFields);
      }
    } catch (err) {
      console.log('[Salesforce] No recent case found, creating new one');
    }
  }
  
  // Create new case if no recent one exists
  return conn.sobject('Case').create(fields);
}

async function getPersonAccountRecordTypeId() {
  const result = await conn.query(
    "SELECT Id FROM RecordType WHERE SObjectType = 'Account' AND IsPersonType = true LIMIT 1"
  );
  return result.records[0]?.Id;
}

export default {
  login,
  findPersonAccountByEmail,
  findAccountByEmail,
  createPersonAccount,
  createAccount,
  findContactByEmail,
  createContact,
  updateContact,
  updatePersonAccount,
  createOrUpdateCase,
};
