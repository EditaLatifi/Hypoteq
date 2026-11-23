/**
 * Small Case-field helpers of the funnel's Salesforce sync, in a module of their own so a caller
 * that only needs them (components/fastLeadSalesforce.ts: the Partner Fast Lead's Case at the
 * invitation, from a portal server action) does not pull in the whole sync — whose dynamic import
 * of the closing (Fall-Dossier, pdf-lib) broke the webpack build of that server action («Cannot get
 * final name for export 'FontNames'», 23.11.2026). components/syncFunnelStepsToSalesforce.ts
 * imports and re-exports them, so existing imports keep working.
 */

// Sales Partner = the partner *company* Account on the Case (HYPOTEQ AG for direct
// leads; Betterhomes / Remax / ... for partner leads). Verified against production:
// the API name is the unhelpfully generic `Account__c` (label "Sales Partner"), which
// is NOT the standard `AccountId` — that one holds the customer. Overridable per-org.
export const SALES_PARTNER_FIELD = process.env.SF_SALES_PARTNER_FIELD || 'Account__c';

/** Put a note at the top of Case.Comments (above what is there). */
export function prependComment(caseData: Record<string, any>, note: string) {
  const existing = typeof caseData['Comments'] === 'string' ? caseData['Comments'].trim() : '';
  caseData['Comments'] = existing ? `${note}\n\n${existing}` : note;
}

/** The partner of a Partner Fast Lead, as /api/inquiry put it on the body (lib/portal/leadServer.ts SubmitLeadPartner). */
export type LeadPartnerOnCase = {
  contactId?: string | null;
  accountId?: string | null;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  invitedAt?: string | null;
  /** The Case created with the invitation (DECISIONS P40): the submit updates it. */
  caseId?: string | null;
};

/**
 * The Comments line of a Partner Fast Lead (HYPOTEQ 23.11.2026: a note, no new Origin value).
 * At the invitation: «Partner Fast Lead – eingeladen von Anna Muster (Muster AG) am 23.11.2026.
 * Der Kunde hat seine Angaben noch nicht erfasst …». At the customer's submit: «…; die Angaben
 * hat der Kunde selbst erfasst.»
 */
export function fastLeadNote(lead: LeadPartnerOnCase, stage: 'invited' | 'completed' = 'completed'): string {
  const name = (lead.name || '').trim() || (lead.email || '').trim() || 'Partner';
  const company = (lead.company || '').trim();
  const who = company && company.toLowerCase() !== name.toLowerCase() ? `${name} (${company})` : name;
  const date = lead.invitedAt && !Number.isNaN(new Date(lead.invitedAt).getTime())
    ? ` am ${new Date(lead.invitedAt).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })}`
    : '';
  return stage === 'invited'
    ? `Partner Fast Lead – eingeladen von ${who}${date}. Der Kunde hat seine Angaben noch nicht erfasst; der Case wird aktualisiert, sobald er die Anfrage über seinen Link abschliesst.`
    : `Partner Fast Lead – eingeladen von ${who}${date}; die Angaben hat der Kunde selbst erfasst.`;
}

/**
 * Put the inviting partner on a Partner Fast Lead's Case (DECISIONS P39): the customer submitted
 * through the partner's invitation, so the Case is the partner's like a Berater submission —
 * Partner_Consultant__c = their Contact, Sales Partner = its Account — and Comments says how it
 * came in. The Contact comes from the portal login (the invitation), so no lookup is needed; one
 * Salesforce refuses (deleted, lookup filter) is dropped by the field fallback, never the Case.
 */
export function applyLeadPartnerToCase(caseData: Record<string, any>, lead: LeadPartnerOnCase, stage: 'invited' | 'completed' = 'completed'): void {
  if (lead.contactId) caseData['Partner_Consultant__c'] = lead.contactId;
  if (lead.accountId) caseData[SALES_PARTNER_FIELD] = lead.accountId;
  prependComment(caseData, fastLeadNote(lead, stage));
  console.log(`[Salesforce Sync] Partner Fast Lead: Contact ${lead.contactId ?? '–'}, Account ${lead.accountId ?? '–'}`);
}

/**
 * Case_Name__c of a funnel Case (HYPOTEQ 19.10. D.4, mapping «Case Name (generiert)»; DECISIONS
 * V65): «{Nachname} {Vorname} – {PLZ} {Ort}», a company «{Firma} – {PLZ} {Ort}». A part that is
 * missing is left out; without a name the Case still says what it is — «Unvollständige Anfrage –
 * {PLZ} {Ort}», else «Unvollständige Anfrage – {who submitted}», else with the date — so it is never
 * empty (the field is required) and stays chaseable.
 */
export function funnelCaseName(p: { firma?: string | null; nachname?: string | null; vorname?: string | null; plz?: string | null; ort?: string | null; submitter?: string | null }, today: Date = new Date()): string {
  const s = (v: string | null | undefined) => String(v || '').trim();
  const who = s(p.firma) || [s(p.nachname), s(p.vorname)].filter(Boolean).join(' ');
  const place = [s(p.plz), s(p.ort)].filter(Boolean).join(' ');
  if (who) return place ? `${who} – ${place}` : who;
  const tail = place || s(p.submitter);
  return tail ? `Unvollständige Anfrage – ${tail}` : `Unvollständige Anfrage ${today.toISOString().slice(0, 10)}`;
}

/**
 * Case.OwnerId of a funnel Case (HYPOTEQ 19.10. D.2, mapping «Owner»: «Queue Web-Anfragen oder
 * HYPOTEQ-User»; DECISIONS V64). A HYPOTEQ user as Berater is already the owner
 * (applyPartnerToCase, by the User's e-mail); every other Case goes to the queue «Web-Anfragen»
 * (salesforceApi.findFunnelQueueId, resolved at runtime, cached). Fails soft: no queue, a failed
 * lookup or an API without the function leave the default owner.
 */
export async function applyFunnelOwner(caseData: Record<string, any>, salesforceApi: any): Promise<void> {
  if (caseData['OwnerId']) return;
  if (typeof salesforceApi?.findFunnelQueueId !== 'function') return;
  try {
    const queueId = await salesforceApi.findFunnelQueueId();
    if (queueId) {
      caseData['OwnerId'] = queueId;
      console.log(`[Salesforce Sync] Owner: queue Web-Anfragen ${queueId}`);
    } else {
      console.warn('[Salesforce Sync] Queue «Web-Anfragen» not found — the Case keeps the default owner');
    }
  } catch (err) {
    console.error('[Salesforce Sync] Queue «Web-Anfragen» could not be resolved — the Case keeps the default owner:', err);
  }
}

/**
 * Case.RecordTypeId of a funnel Case: «Standardfinanzierung» (HYPOTEQ 20.10.2026), set
 * explicitly — without it the integration user's default applied («Spezialfinanzierung» on
 * 19.10.). Resolved at runtime (salesforceApi.findFunnelCaseRecordTypeId, cached once found).
 * Fails soft like the owner: no record type, a failed lookup or an API without the function
 * leave the default.
 */
export async function applyFunnelRecordType(caseData: Record<string, any>, salesforceApi: any): Promise<void> {
  if (caseData['RecordTypeId']) return;
  if (typeof salesforceApi?.findFunnelCaseRecordTypeId !== 'function') return;
  try {
    const recordTypeId = await salesforceApi.findFunnelCaseRecordTypeId();
    if (recordTypeId) {
      caseData['RecordTypeId'] = recordTypeId;
      console.log(`[Salesforce Sync] Record type: Standardfinanzierung ${recordTypeId}`);
    } else {
      console.warn('[Salesforce Sync] Record type «Standardfinanzierung» not found — the Case takes the default record type');
    }
  } catch (err) {
    console.error('[Salesforce Sync] Record type «Standardfinanzierung» could not be resolved — the Case takes the default:', err);
  }
}

/**
 * Funnel v3 Anrede → PersonAccount.Salutation (spec 6.4): Herr → Mr., Frau → Mrs. Anything
 * else (the legacy funnel sends nothing) → null, so no Salutation is written.
 */
export function toSalesforceSalutation(value: unknown): 'Mr.' | 'Mrs.' | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'herr' || v === 'mr.' || v === 'mr') return 'Mr.';
  if (v === 'frau' || v === 'mrs.' || v === 'mrs') return 'Mrs.';
  return null;
}
