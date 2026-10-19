import { conn, createOrUpdateCase, ensureSession, sfQuery, soqlString, takeDroppedFields, withSessionRetry } from "@/components/salesforceApi";
import { ALL_QUEUES_SOQL, pickQueue, queueList } from "@/components/salesforceQueues";
import { partnerCaseField } from "@/lib/portal/config";
import { special } from "@/lib/portal/i18n/special";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { parseEigenmittel, specialRef, summaryRows, type ValidSpecialAnswers } from "@/lib/portal/special";

/**
 * The Salesforce Case of a Spezialfinanzierung (handoff 4, DECISIONS P5 / P14).
 *
 * The Case belongs to the partner the way a funnel Case does: their Contact in
 * Partner_Consultant__c (what the portal's scope reads), their company in the Sales
 * Partner field. RecordType `Case.Spezialfinanzierung` and the queue «Spezialfinanzierung» as
 * owner (HYPOTEQ 19.10.2026 B21 / D.2), both resolved at runtime; without them the default
 * record type and owner — the Subject says what it is either way.
 * No customer Account is created: the wizard has too little for one (no e-mail, no birth
 * date); HYPOTEQ creates it when it takes the Case on. Texts are German, like every other
 * internal record.
 */

/** The Salesforce calls this module makes; tests pass a fake. */
export type SpecialSfApi = {
  query: (soql: string) => Promise<any[]>;
  describeCase: () => Promise<any>;
  createCase: (fields: Record<string, unknown>) => Promise<{ id: string | null }>;
  /** Fields the write had to drop or truncate (components/salesforceApi.ts). */
  dropped: () => string[];
};

export const liveSfApi: SpecialSfApi = {
  query: (soql) => sfQuery(soql, "portal special financing"),
  describeCase: async () => {
    await ensureSession();
    return withSessionRetry(async () => await (conn.sobject("Case") as any).describe(), "describe Case");
  },
  createCase: async (fields) => {
    await ensureSession();
    const res: any = await createOrUpdateCase(fields);
    return { id: res?.id || res?.Id || null };
  },
  dropped: () => takeDroppedFields(),
};

/** Sales Partner lookup on Case (the partner company); the same setting the funnel uses. */
export function salesPartnerField(): string {
  return process.env.SF_SALES_PARTNER_FIELD || "Account__c";
}

/** Name or DeveloperName of the Case record type for special financings. */
export function specialRecordTypeName(): string {
  return (process.env.PORTAL_SF_SPECIAL_RECORD_TYPE || "Spezialfinanzierung").trim();
}

// A found record type is kept for the life of the instance; a missing one is asked again
// after a while, so creating it in Setup takes effect without a deploy.
const MISS_TTL_MS = 10 * 60_000;
let recordTypeCache: { id: string | null; at: number } | null = null;

export function resetSpecialRecordTypeCache(): void {
  recordTypeCache = null;
}

/**
 * Id of the «Spezialfinanzierung» Case record type, or null (DECISIONS P5: then the
 * default). A RecordType row is readable even when the running user may not use it, so
 * availability is confirmed through describe(), as for the Person Account record type.
 */
export async function specialRecordTypeId(api: SpecialSfApi = liveSfApi, now = Date.now()): Promise<string | null> {
  if (recordTypeCache && (recordTypeCache.id || now - recordTypeCache.at < MISS_TTL_MS)) return recordTypeCache.id;
  const name = specialRecordTypeName();
  const devName = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let id: string | null = null;
  try {
    const rows = await api.query(
      `SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = 'Case' AND IsActive = true AND (DeveloperName = ${soqlString(devName)} OR Name = ${soqlString(name)}) LIMIT 1`
    );
    const rt = rows[0];
    if (rt?.Id) {
      const meta = await api.describeCase();
      const info = (meta?.recordTypeInfos || []).find((i: any) => i.recordTypeId === rt.Id);
      if (info && info.available === false) {
        console.warn(`[portal] Case record type ${rt.DeveloperName} (${rt.Id}) exists but is not assigned to the integration user; using the default`);
      } else {
        id = rt.Id;
      }
    } else {
      console.warn(`[portal] no active Case record type «${name}»; special financings use the default record type`);
    }
  } catch (err) {
    // Not cached: the next request asks again.
    console.error("[portal] record type lookup failed; using the default record type", err);
    return null;
  }
  recordTypeCache = { id, at: now };
  return id;
}

/**
 * Name or DeveloperName of the Case queue that owns special financings (HYPOTEQ 19.10.2026
 * B21 / D.2: «Spezialfinanzierung», with e-mail to its members). "off" leaves the owner to the
 * org's default. PORTAL_SF_SPECIAL_OWNER_ID (a User or queue Id) still wins over it.
 */
export function specialQueueName(): string | null {
  const v = (process.env.PORTAL_SF_SPECIAL_QUEUE || "Spezialfinanzierung").trim();
  return v && v.toLowerCase() !== "off" ? v : null;
}

let queueCache: { id: string | null; at: number } | null = null;

export function resetSpecialQueueCache(): void {
  queueCache = null;
}

/**
 * Id of the «Spezialfinanzierung» queue, or null (then the org's default owner). Looked up at
 * runtime — `Group WHERE Type = 'Queue'` by DeveloperName or Name — and cached like the record
 * type: a hit for the life of the instance, a miss for ten minutes, a failure not at all.
 */
export async function specialQueueId(api: SpecialSfApi = liveSfApi, now = Date.now()): Promise<string | null> {
  const name = specialQueueName();
  if (!name) return null;
  if (queueCache && (queueCache.id || now - queueCache.at < MISS_TTL_MS)) return queueCache.id;
  const devName = name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let id: string | null = null;
  try {
    const rows = await api.query(
      `SELECT Id, DeveloperName, Name FROM Group WHERE Type = 'Queue' AND (DeveloperName = ${soqlString(devName)} OR Name = ${soqlString(name)}) LIMIT 1`
    );
    id = isSalesforceId(rows[0]?.Id) ? rows[0].Id : null;
    if (!id) {
      // A spelling apart from the exact name («Spezial-Finanzierung», another DeveloperName):
      // every queue, matched loosely, like the funnel's «Web-Anfragen» (salesforceApi.pickQueue).
      const all = await api.query(ALL_QUEUES_SOQL);
      const hit = pickQueue(all, [name, devName]);
      id = hit && isSalesforceId(hit.Id) ? hit.Id : null;
      if (id) console.log(`[portal] Case queue «${name}» found as «${hit!.Name}»`);
      else console.warn(`[portal] no Case queue «${name}» among ${queueList(all)}; special financings keep the default owner`);
    }
  } catch (err) {
    // Not cached: the next request asks again.
    console.error("[portal] queue lookup failed; using the default owner", err);
    return null;
  }
  queueCache = { id, at: now };
  return id;
}

export type SpecialCaseInput = {
  requestId: string;
  answers: ValidSpecialAnswers;
  amount: number;
  partner: { contactId: string; accountId: string | null; name: string | null; company: string | null; email: string };
  fileNames: string[];
  folderUrl: string | null;
};

/**
 * Case_Name__c, required on every Case (D.4): «{Kunde} – {PLZ/Ort}» from the wizard's
 * Wohnort/Sitz, or «{Kunde}» alone when the partner left it empty (DECISIONS P33).
 */
export function specialCaseName(a: Pick<ValidSpecialAnswers, "kunde" | "ort">): string {
  const kunde = a.kunde.replace(/\s+/g, " ").trim();
  const ort = (a.ort || "").replace(/\s+/g, " ").trim();
  return (ort ? `${kunde} – ${ort}` : kunde).slice(0, 255);
}

export function specialSubject(a: ValidSpecialAnswers): string {
  return `Spezialfinanzierung · ${special.de.types[a.type].short} – ${a.kunde}`.slice(0, 255);
}

export function partnerLabel(p: { name: string | null; company: string | null; email: string }): string {
  return `${p.name || p.email}${p.company ? ` (${p.company})` : ""}`;
}

/** Every wizard answer, in the order of the review step. */
export function specialDescription(p: SpecialCaseInput): string {
  const t = special.de;
  const lines = [
    `Spezialfinanzierung aus dem Partnerportal (Referenz ${specialRef(p.requestId)})`,
    "",
    ...summaryRows(t, p.answers, p.fileNames.length).map((r) => `${r.k}: ${r.v}`),
    "",
    "Beschreibung:",
    p.answers.beschreibung,
    "",
    `Dokumente: ${p.fileNames.length ? p.fileNames.join(", ") : "keine"}`,
    `Eingereicht von: ${partnerLabel(p.partner)}, ${p.partner.email}`,
    "Der Partner hat bestätigt, dass Spezialfinanzierungen individuell geprüft werden und nicht unter die bestehende Partnervereinbarung fallen.",
  ];
  return lines.join("\n").slice(0, 32000);
}

/** The Case fields, before the record type. Field names follow the funnel's Case write. */
export function specialCaseFields(p: SpecialCaseInput): Record<string, unknown> {
  const a = p.answers;
  const fields: Record<string, unknown> = {
    Subject: specialSubject(a),
    Description: specialDescription(p),
    // Required (D.4); shown as the customer in the portal while the Case has no customer Account.
    Case_Name__c: specialCaseName(a),
    Status: "New",
    Stage__c: "Needs Analysis",
    Gesch_tzter_Hypothekenbedarf__c: p.amount,
    [partnerCaseField()]: p.partner.contactId,
  };
  if (isSalesforceId(p.partner.accountId)) fields[salesPartnerField()] = p.partner.accountId;
  const eigen = parseEigenmittel(a.eigenmittel);
  if (eigen != null) fields.Eigenmittel__c = eigen;
  if (p.folderUrl) fields.SharePoint_Doc__c = p.folderUrl;
  const owner = process.env.PORTAL_SF_SPECIAL_OWNER_ID;
  if (isSalesforceId(owner)) fields.OwnerId = owner;
  return fields;
}

export type SpecialCaseResult = {
  caseId: string;
  caseNr: string | null;
  recordType: "special" | "default";
  /** Who owns the Case: the «Spezialfinanzierung» queue, PORTAL_SF_SPECIAL_OWNER_ID, or the org's default. */
  owner: "queue" | "configured" | "default";
  /** Fields Salesforce did not take (dropped or truncated). */
  dropped: string[];
  /** False when the partner lookup did not make it onto the Case: the partner cannot see it. */
  linked: boolean;
};

/**
 * Create the Case: with the «Spezialfinanzierung» record type and the queue of the same name
 * as owner (B21 / D.2), both found at runtime. A record type or queue the org refuses must not
 * cost the Case (DECISIONS P5): the create is retried without the queue, then without the
 * record type. Throws only when Salesforce refuses the Case itself; the caller keeps the request.
 */
export async function createSpecialCase(fields: Record<string, unknown>, api: SpecialSfApi = liveSfApi): Promise<SpecialCaseResult> {
  const configuredOwner = isSalesforceId(fields.OwnerId as string | undefined);
  const [rt, queue] = await Promise.all([specialRecordTypeId(api), configuredOwner ? Promise.resolve(null) : specialQueueId(api)]);

  const attempts: { record: Record<string, unknown>; rt: boolean; queue: boolean }[] = [];
  if (rt && queue) attempts.push({ record: { ...fields, RecordTypeId: rt, OwnerId: queue }, rt: true, queue: true });
  if (rt) attempts.push({ record: { ...fields, RecordTypeId: rt }, rt: true, queue: false });
  if (!rt && queue) attempts.push({ record: { ...fields, OwnerId: queue }, rt: false, queue: true });
  attempts.push({ record: { ...fields }, rt: false, queue: false });

  let res: { id: string | null } | null = null;
  let used = attempts[attempts.length - 1];
  for (let i = 0; i < attempts.length; i++) {
    try {
      res = await api.createCase(attempts[i].record);
      used = attempts[i];
      break;
    } catch (err) {
      if (i === attempts.length - 1) throw err;
      console.warn(`[portal] Case create ${attempts[i].queue ? "with the queue as owner" : "with the special record type"} failed; retrying without it`, err);
      api.dropped();
    }
  }
  const dropped = api.dropped();
  const caseId = res?.id;
  if (!isSalesforceId(caseId)) throw new Error("Salesforce returned no Case Id");
  const lost = (field: string) => dropped.some((d) => d.startsWith(`Case.${field} `));
  const recordType = used.rt && !lost("RecordTypeId") ? "special" : "default";
  const owner = lost("OwnerId") ? "default" : used.queue ? "queue" : configuredOwner ? "configured" : "default";
  const linked = !lost(partnerCaseField());

  let caseNr: string | null = null;
  try {
    const rows = await api.query(`SELECT CaseNumber FROM Case WHERE Id = ${soqlString(caseId)} LIMIT 1`);
    caseNr = rows[0]?.CaseNumber ?? null;
  } catch (err) {
    console.error("[portal] reading the new CaseNumber failed", err);
  }
  return { caseId, caseNr, recordType, owner, dropped, linked };
}
