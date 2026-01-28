import { Connection } from 'jsforce';

const SF_USERNAME = process.env.SF_USERNAME || '';
const SF_PASSWORD = process.env.SF_PASSWORD || '';
const SF_TOKEN = process.env.SF_TOKEN || '';
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

const conn = new Connection({ loginUrl: SF_LOGIN_URL });

export async function login() {
  await conn.login(SF_USERNAME, SF_PASSWORD + SF_TOKEN);
}

export async function findPersonAccountByEmail(email: string) {
  return conn.sobject('Account').findOne({ PersonEmail: email });
}

export async function findAccountByEmail(email: string) {
  return conn.sobject('Account').findOne({ PersonEmail: email });
}

export async function createPersonAccount(fields: Record<string, any>) {
  return conn.sobject('Account').create({ ...fields, RecordTypeId: await getPersonAccountRecordTypeId() });
}

export async function createAccount(fields: Record<string, any>) {
  const recordTypeId = await getPersonAccountRecordTypeId();
  return conn.sobject('Account').create({ ...fields, RecordTypeId: recordTypeId });
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
  return conn.sobject('Account').update({ Id: id, ...fields });
}

export async function createOrUpdateCase(fields: Record<string, any>) {
  // Always create a new case linked to the AccountId
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
