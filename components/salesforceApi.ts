import { Connection } from 'jsforce';
import { ALL_QUEUES_SOQL, pickQueue, queueList, type QueueRow } from './salesforceQueues';

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

/**
 * Run a Salesforce read, refreshing the session once if it has expired.
 *
 * Reads go straight through jsforce with the module-level `conn`, so a long-running job
 * outliving its token used to fail outright. Note the retry is deliberately lazy: eagerly
 * re-authenticating before every call is worse than useless, because each
 * client-credentials token opens a new session and the org invalidates older ones — which
 * kills the very session the current request is using.
 */
export async function withSessionRetry<T>(op: () => Promise<T>, context: string): Promise<T> {
  try {
    return await op();
  } catch (error: any) {
    const code: string = error?.errorCode || error?.data?.errorCode || '';
    const message: string = error?.data?.message || error?.message || '';
    if (code === 'INVALID_SESSION_ID' || /session expired or invalid/i.test(message)) {
      console.warn(`[Salesforce] ${context}: session expired, re-authenticating once and retrying`);
      await login();
      return await op();
    }
    throw error;
  }
}

/**
 * A SOQL string literal, quotes included. Every value interpolated into a query goes through
 * this: an address like o'brien@x.ch is legal, and unescaped it either breaks the query or
 * rewrites it.
 */
export function soqlString(value: string): string {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Log in once per warm instance if this one has no session yet. A read-only route (partner
 * recognition) can be the first thing a cold instance runs; after that, withSessionRetry
 * renews an expired token lazily. Logging in on every call would be wrong: each
 * client-credentials login invalidates older sessions (see withSessionRetry).
 */
export async function ensureSession(): Promise<void> {
  if (!conn.accessToken) await login();
}

/** Run a read-only SOQL query with a session and one lazy re-login; returns the rows. */
export async function sfQuery<T = any>(soql: string, context: string): Promise<T[]> {
  await ensureSession();
  const result: any = await withSessionRetry(async () => await conn.query(soql), context);
  return (result?.records || []) as T[];
}

export async function findPersonAccountByEmail(email: string) {
  return conn.sobject('Account').findOne({ PersonEmail: email });
}

// Look up a business Account by its exact name. Used to resolve the sales-partner
// Account (HYPOTEQ AG for direct clients, Betterhomes/Remax/... for partner leads).
// Person Accounts are excluded — a sales partner is always a company.
export async function findAccountByName(name: string) {
  const result = await withSessionRetry(
    async () => await conn.query(`SELECT Id, Name FROM Account WHERE Name = ${soqlString(name)} AND IsPersonAccount = false LIMIT 1`),
    'findAccountByName',
  );
  return result.records && result.records.length > 0 ? result.records[0] : null;
}

export async function findAccountByEmail(email: string) {
  // Query to get account with IsPersonAccount field to determine type
  const result = await withSessionRetry(
    async () => await conn.query(`SELECT Id, PersonEmail, IsPersonAccount FROM Account WHERE PersonEmail = ${soqlString(email)} LIMIT 1`),
    'findAccountByEmail',
  );
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
  // Oldest match first, so a later duplicate Contact never takes over the original.
  const result = await withSessionRetry(
    async () =>
      await conn.query(
        `SELECT Id, Email, AccountId FROM Contact WHERE Email = ${soqlString(email)} ORDER BY CreatedDate ASC LIMIT 1`,
      ),
    'findContactByEmail',
  );
  return result.records && result.records.length > 0 ? (result.records[0] as any) : null;
}

export async function createContact(fields: Record<string, any>) {
  // The Account fallbacks: an optional column the org lacks or forbids must not cost the Contact.
  return writeWithFieldFallback((f) => conn.sobject('Contact').create(f), fields, 'create Contact', 'Contact');
}

// ---- Owner of a funnel Case: the queue «Web-Anfragen» (HYPOTEQ 19.10. D.2, DECISIONS V64) ------

/** The queue a funnel Case belongs to, by Name or DeveloperName (configurable, defaults per D.2). */
export function funnelQueueNames(): { name: string; developerName: string } {
  return {
    name: (process.env.SF_FUNNEL_QUEUE_NAME || 'Web-Anfragen').trim(),
    developerName: (process.env.SF_FUNNEL_QUEUE_DEVELOPER_NAME || 'Web_Anfragen').trim(),
  };
}

// Only a found queue is cached (per warm instance), so a queue created later is picked up.
let funnelQueueId: string | null = null;

/** For tests. */
export function clearFunnelQueueCache(): void {
  funnelQueueId = null;
}

/**
 * The Id of the Case queue «Web-Anfragen», resolved at runtime and cached; null when the org has
 * none. First `Group WHERE Type = 'Queue' AND (Name = … OR DeveloperName = …)`; on a miss every
 * queue is read and matched by queueKey — on 19.10. the exact names missed although HYPOTEQ
 * says the queue exists (D.2) — and a miss there too logs the queues the integration user sees,
 * so the real name can be configured (SF_FUNNEL_QUEUE_NAME). Errors propagate — the sync keeps
 * the default owner then.
 */
export async function findFunnelQueueId(): Promise<string | null> {
  if (funnelQueueId) return funnelQueueId;
  const { name, developerName } = funnelQueueNames();
  const rows = await sfQuery<any>(
    `SELECT Id FROM Group WHERE Type = 'Queue' AND (Name = ${soqlString(name)} OR DeveloperName = ${soqlString(developerName)}) LIMIT 1`,
    'findFunnelQueueId',
  );
  if (rows[0]?.Id) {
    funnelQueueId = rows[0].Id;
    return funnelQueueId;
  }
  const all = await sfQuery<QueueRow>(ALL_QUEUES_SOQL, 'findFunnelQueueId:all');
  const hit = pickQueue(all, [name, developerName]);
  if (hit) {
    console.log(`[Salesforce] queue «${name}» found as «${hit.Name}» (${hit.Id})`);
    funnelQueueId = hit.Id;
    return funnelQueueId;
  }
  console.warn(`[Salesforce] no queue «${name}» / ${developerName} among the queues the integration user sees: ${queueList(all)}`);
  return null;
}

// ---- Record type of a funnel Case: «Standardfinanzierung» (HYPOTEQ 20.10.2026) ---------------

/**
 * The Case record type of a funnel request: DeveloperName «Standard», label «Standardfinanzierung».
 * Set on every create — without it the integration user's default applied, and that became
 * «Spezialfinanzierung» on 19.10. SF_FUNNEL_CASE_RECORD_TYPE overrides it.
 */
export function funnelCaseRecordTypeNames(): string[] {
  const configured = (process.env.SF_FUNNEL_CASE_RECORD_TYPE || '').trim();
  return configured ? [configured] : ['Standard', 'Standardfinanzierung'];
}

// Only a found record type is cached (per warm instance), so one created later is picked up.
let funnelCaseRecordTypeId: string | null = null;

/** For tests. */
export function clearFunnelCaseRecordTypeCache(): void {
  funnelCaseRecordTypeId = null;
}

/**
 * The Id of that record type among the active Case record types (Name or DeveloperName, matched
 * loosely); null when the org has none — the Case then takes the user's default, and the log says
 * so. Errors propagate; the sync keeps the default then.
 */
export async function findFunnelCaseRecordTypeId(): Promise<string | null> {
  if (funnelCaseRecordTypeId) return funnelCaseRecordTypeId;
  const rows = await sfQuery<QueueRow>("SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = 'Case' AND IsActive = true", 'findFunnelCaseRecordTypeId');
  const hit = pickQueue(rows, funnelCaseRecordTypeNames());
  if (!hit) {
    console.warn(`[Salesforce] no Case record type «${funnelCaseRecordTypeNames().join(' / ')}» among: ${queueList(rows)}`);
    return null;
  }
  funnelCaseRecordTypeId = hit.Id;
  return funnelCaseRecordTypeId;
}

// ---- Juristische Person: Business Account + Contact (HYPOTEQ 19.10. B16, DECISIONS V63) --------

/**
 * The Account field holding the UID (Unternehmens-Identifikationsnummer, «CHE-123.456.789»).
 * HYPOTEQ has not named it; `UID__c` until they do. An org without it: the lookup by UID is
 * skipped (the Name lookup remains) and writeWithFieldFallback drops it from the create.
 */
export function accountUidField(): string | null {
  const raw = (process.env.SF_ACCOUNT_UID_FIELD ?? 'UID__c').trim();
  // Interpolated into SOQL: only a plain API name is accepted.
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(raw) ? raw : null;
}

/** «CHE-123.456.789», «CHE123456789 MWST» → the two spellings an org may hold; null when it is no UID. */
export function uidSpellings(raw: unknown): { canonical: string; compact: string } | null {
  if (typeof raw !== 'string') return null;
  const m = raw.toUpperCase().match(/CHE[\s.-]*(\d{3})[\s.]*(\d{3})[\s.]*(\d{3})/);
  if (!m) return null;
  return { canonical: `CHE-${m[1]}.${m[2]}.${m[3]}`, compact: `CHE${m[1]}${m[2]}${m[3]}` };
}

/**
 * The record type of an end customer's company (HYPOTEQ 20.10.2026): «Firmenkunde». Set on every
 * create — the integration user's default is «Kreditgeber», and a lender Account in Case.Client__c
 * is what the lookup filter refused on 19.10. SF_COMPANY_ACCOUNT_RECORD_TYPE overrides it.
 */
export function companyAccountRecordTypeNames(): string[] {
  const configured = (process.env.SF_COMPANY_ACCOUNT_RECORD_TYPE || '').trim();
  return configured ? [configured] : ['Firmenkunde'];
}

/**
 * The non-person Account record type for a company: `RecordType WHERE SobjectType = 'Account'
 * AND IsPersonType = false`, «Firmenkunde» first (Name or DeveloperName, matched loosely), else
 * DeveloperName «Business_Account», else the running user's default among them (describe), else
 * the first one the user may use. None → null: the create then goes without RecordTypeId and
 * Salesforce takes the default. Never hardcoded; resolved once per warm instance.
 */
export function pickBusinessRecordType(
  rows: { Id: string; DeveloperName?: string | null; Name?: string | null }[],
  infos: { recordTypeId?: string; available?: boolean; defaultRecordTypeMapping?: boolean }[] = [],
  preferredNames: string[] = companyAccountRecordTypeNames(),
): string | null {
  if (!rows.length) return null;
  const same = (a?: string, b?: string) => !!a && !!b && a.slice(0, 15) === b.slice(0, 15);
  const info = (id: string) => infos.find((i) => same(i.recordTypeId, id));
  const usable = rows.filter((r) => info(r.Id)?.available !== false);
  const pool = usable.length ? usable : rows;
  const company = pickQueue(pool, preferredNames);
  if (company) return company.Id;
  console.warn(`[Salesforce] no Account record type «${preferredNames.join(' / ')}» — the company gets the next best one`);
  const preferred = pool.find((r) => r.DeveloperName === 'Business_Account');
  if (preferred) return preferred.Id;
  const byDefault = pool.find((r) => info(r.Id)?.defaultRecordTypeMapping === true);
  return (byDefault ?? pool[0]).Id;
}

let businessAccountRecordTypeId: string | null | undefined;

export async function getBusinessAccountRecordTypeId(): Promise<string | null> {
  if (businessAccountRecordTypeId !== undefined) return businessAccountRecordTypeId;
  await ensureSession();
  const result: any = await withSessionRetry(
    async () =>
      await conn.query("SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = 'Account' AND IsPersonType = false AND IsActive = true"),
    'business Account RecordType',
  );
  const rows = (result?.records || []) as { Id: string; DeveloperName?: string; Name?: string }[];
  let infos: any[] = [];
  if (rows.length > 1 || (rows.length === 1 && rows[0].DeveloperName !== 'Business_Account')) {
    try {
      infos = ((await (conn.sobject('Account') as any).describe())?.recordTypeInfos || []) as any[];
    } catch (err) {
      console.warn('[Salesforce] Account describe failed, taking the first business record type:', err);
    }
  }
  businessAccountRecordTypeId = pickBusinessRecordType(rows, infos);
  return businessAccountRecordTypeId;
}

/**
 * An existing company Account (never a Person Account): by UID first, else by exactly the same
 * Name — the oldest, so a later duplicate never takes over. Null when there is none. A lookup by
 * UID the org cannot run (no such field) falls back to the Name; any other error propagates — a
 * failed lookup must not end in a duplicate Account.
 */
export async function findBusinessAccount(opts: { uid?: string | null; name?: string | null }): Promise<{ Id: string; Name?: string; matchedBy: 'uid' | 'name' } | null> {
  await ensureSession();
  const uid = uidSpellings(opts.uid);
  const field = accountUidField();
  if (uid && field) {
    try {
      const rows = await sfQuery<any>(
        `SELECT Id, Name FROM Account WHERE IsPersonAccount = false AND ${field} IN (${soqlString(uid.canonical)}, ${soqlString(uid.compact)}) ORDER BY CreatedDate ASC LIMIT 1`,
        'findBusinessAccount:UID',
      );
      if (rows[0]?.Id) return { Id: rows[0].Id, Name: rows[0].Name, matchedBy: 'uid' };
    } catch (err: any) {
      const code = err?.errorCode || err?.data?.errorCode || '';
      if (code !== 'INVALID_FIELD') throw err;
      console.warn(`[Salesforce] Account has no field ${field} — looking the company up by Name only`);
    }
  }
  const name = String(opts.name || '').trim();
  if (!name) return null;
  const rows = await sfQuery<any>(
    `SELECT Id, Name FROM Account WHERE IsPersonAccount = false AND Name = ${soqlString(name)} ORDER BY CreatedDate ASC LIMIT 1`,
    'findBusinessAccount:Name',
  );
  return rows[0]?.Id ? { Id: rows[0].Id, Name: rows[0].Name, matchedBy: 'name' } : null;
}

/** A company Account: Name = Firma, Phone, UID and Sitz (BillingCity) where known, the old funnel's street. */
export async function createBusinessAccount(company: { name: string; phone?: string | null; uid?: string | null; sitz?: string | null; street?: string | null }) {
  const recordTypeId = await getBusinessAccountRecordTypeId();
  const fields: Record<string, any> = { Name: company.name };
  if (recordTypeId) fields.RecordTypeId = recordTypeId;
  if (company.phone) fields.Phone = company.phone;
  const uid = uidSpellings(company.uid);
  const field = accountUidField();
  if (uid && field) fields[field] = uid.canonical;
  if (company.sitz) fields.BillingCity = company.sitz;
  if (company.street) fields.BillingStreet = company.street;
  console.log('[Salesforce API] Creating Business Account:', JSON.stringify(fields, null, 2));
  return writeWithFieldFallback((f) => conn.sobject('Account').create(f), fields, 'create Business Account', 'Account');
}

/** A Contact of that Account: by e-mail, or — without one — by first and last name. */
export async function findContactOnAccount(accountId: string, person: { email?: string | null; firstName?: string | null; lastName?: string | null }): Promise<{ Id: string } | null> {
  await ensureSession();
  const email = String(person.email || '').trim();
  const last = String(person.lastName || '').trim();
  let where: string;
  if (email) where = `Email = ${soqlString(email)}`;
  else if (last) where = `LastName = ${soqlString(last)} AND FirstName = ${soqlString(String(person.firstName || '').trim())}`;
  else return null;
  const rows = await sfQuery<any>(
    `SELECT Id FROM Contact WHERE AccountId = ${soqlString(accountId)} AND ${where} ORDER BY CreatedDate ASC LIMIT 1`,
    'findContactOnAccount',
  );
  return rows[0]?.Id ? { Id: rows[0].Id } : null;
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
//   - FIELD_FILTER_VALIDATION_EXCEPTION: a lookup filter refused the linked record. Drop the
//     link and retry.
// Any other error propagates so it surfaces in logs.
/**
 * Fields writeWithFieldFallback had to drop or truncate since the last takeDroppedFields().
 * Each entry reads `Case.Partner_Consultant__c (INVALID_FIELD)`. The sync hands the list to
 * the inquiry route, which reports it — a silently dropped field used to be visible only in
 * a console line nobody reads.
 */
let droppedFields: string[] = [];

export function takeDroppedFields(): string[] {
  const out = droppedFields;
  droppedFields = [];
  return out;
}

/** The links a refused lookup filter may cost when Salesforce names no field, likeliest first. */
export const LOOKUP_FILTER_FALLBACK = ['Client__c', 'Client_2__c', 'Client_3__c', 'ContactId', 'Partner_Consultant__c', 'Account__c', 'OwnerId'];

function noteDropped(sobjectType: string, field: string, code: string, how: 'dropped' | 'truncated' = 'dropped') {
  droppedFields.push(`${sobjectType}.${field} (${code}${how === 'truncated' ? ', truncated' : ''})`);
}

async function writeWithFieldFallback(
  op: (fields: Record<string, any>) => Promise<any>,
  fields: Record<string, any>,
  context: string,
  sobjectType: string = 'Case',
): Promise<any> {
  const working = { ...fields };
  let sessionRetried = false;
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await op(working);
    } catch (error: any) {
      const code: string = error?.errorCode || error?.data?.errorCode || '';
      const message: string = error?.data?.message || error?.message || '';
      const errFields: string[] = error?.data?.fields || error?.fields || [];

      // The client-credentials token is short-lived and `conn` is module-level, so a
      // long-running job (a backlog replay) outlives it. Re-authenticate once and retry
      // rather than failing every remaining record with "Session expired or invalid".
      if (code === 'INVALID_SESSION_ID' || /session expired or invalid/i.test(message)) {
        if (!sessionRetried) {
          sessionRetried = true;
          console.warn(`[Salesforce] ${context}: session expired, re-authenticating and retrying`);
          await login();
          continue;
        }
        throw error;
      }

      if (code === 'INVALID_FIELD') {
        const match = message.match(
          new RegExp(`No such column '([^']+)' on (?:sobject|entity) of type ${sobjectType}`, 'i')
        );
        const badField = match?.[1];
        if (badField && badField in working) {
          console.warn(`[Salesforce] ${context}: dropping unknown ${sobjectType} field '${badField}' and retrying`);
          noteDropped(sobjectType, badField, code);
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
          noteDropped(sobjectType, target, code, 'truncated');
          console.warn(`[Salesforce] ${context}: truncating '${target}' from ${original.length} -> ${max} chars and retrying`);
          continue;
        }
        throw error;
      }

      // A lookup/master-detail field was given something that is not a valid record Id
      // (e.g. an email address landing in a Contact lookup). Dropping the reference costs
      // one link; keeping it costs the entire lead.
      if (code === 'MALFORMED_ID' || code === 'INVALID_CROSS_REFERENCE_KEY' || code === 'INVALID_ID_FIELD' || code === 'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY') {
        const target =
          errFields.find(f => f in working) ??
          Object.keys(working).find(f => {
            const v = working[f];
            // Salesforce Ids are 15 or 18 chars; anything else in a lookup is malformed.
            return typeof v === 'string' && f.endsWith('__c') && v !== '' && v.length !== 15 && v.length !== 18 && message.includes(v);
          }) ??
          // An owner the record cannot take (a queue not enabled for the object, a User without
          // access) and Salesforce names no field: the owner goes, the default owner stays —
          // HYPOTEQ 19.10. D.2 must never cost the lead.
          (code !== 'MALFORMED_ID' && 'OwnerId' in working ? 'OwnerId' : undefined);
        if (target) {
          console.warn(`[Salesforce] ${context}: dropping invalid lookup value for '${target}' ('${working[target]}') and retrying`);
          noteDropped(sobjectType, target, code);
          delete working[target];
          continue;
        }
        throw error;
      }

      // A lookup filter refused the record a lookup points at. On 19.10. a company Case was lost
      // whole this way (its Business Account in a lookup that admits Person Accounts only).
      // Salesforce names the field; without a name the optional links go, one per retry, in
      // LOOKUP_FILTER_FALLBACK order — AccountId stays unless named: it carries the Case.
      if (code === 'FIELD_FILTER_VALIDATION_EXCEPTION') {
        const target = errFields.find(f => f in working) ?? LOOKUP_FILTER_FALLBACK.find(f => f in working && working[f]);
        if (target) {
          console.warn(`[Salesforce] ${context}: lookup filter refused '${target}' ('${working[target]}'), dropping it and retrying`);
          noteDropped(sobjectType, target, code);
          delete working[target];
          continue;
        }
        throw error;
      }

      if (code === 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST') {
        const target = errFields.find(f => f in working);
        if (target) {
          console.warn(`[Salesforce] ${context}: dropping invalid picklist value for '${target}' ('${working[target]}') and retrying`);
          noteDropped(sobjectType, target, code);
          delete working[target];
          continue;
        }
        throw error;
      }

      // The column exists but the integration user may not write it (field-level security),
      // e.g. Account.Salutation for the Funnel v3 Anrede. Salesforce names the fields; drop
      // them and retry rather than lose the record over an optional attribute.
      if (code === 'INVALID_FIELD_FOR_INSERT_UPDATE') {
        const targets = errFields.filter(f => f in working);
        if (targets.length) {
          console.warn(`[Salesforce] ${context}: dropping unwritable ${sobjectType} field(s) ${targets.map(f => `'${f}'`).join(', ')} and retrying`);
          for (const f of targets) {
            noteDropped(sobjectType, f, code);
            delete working[f];
          }
          continue;
        }
        throw error;
      }

      throw error;
    }
  }
  throw new Error(`[Salesforce] ${context}: exceeded retry limit`);
}

/**
 * Create a Case. Always a new one: a duplicate submission never gets here — /api/inquiry stops a
 * retry by its submission id before Salesforce, and the replay only takes rows that never
 * synced. The former guard («a Case of the same Account created in the last five minutes is
 * updated instead») merged two different requests of one customer: in the retest of 20.10.2026
 * the second overwrote the first.
 */
export async function createOrUpdateCase(fields: Record<string, any>) {
  return writeWithFieldFallback(
    (f) => conn.sobject('Case').create(f),
    fields,
    'create Case',
  );
}

/**
 * Update fields of an existing Case by Id, with the same fallbacks as the funnel's Case write
 * (an org without a field, e.g. SharePoint_Doc__c, drops it instead of failing). Used by the
 * Funnel v3 Nachreichung, which revises the document fields of the Case the submit created.
 */
export async function updateCase(id: string, fields: Record<string, any>) {
  await ensureSession();
  return writeWithFieldFallback(
    (f) => (conn.sobject('Case') as any).update(f),
    { ...fields, Id: id },
    `update Case ${id}`,
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
  takeDroppedFields,
  ensureSession,
  sfQuery,
  soqlString,
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
  findFunnelQueueId,
  findFunnelCaseRecordTypeId,
  getBusinessAccountRecordTypeId,
  findBusinessAccount,
  createBusinessAccount,
  findContactOnAccount,
  createOrUpdateCase,
  updateCase,
};
