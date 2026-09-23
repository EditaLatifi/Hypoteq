import { conn, login } from "@/components/salesforceApi";
import { prisma } from "@/lib/prisma";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";
import { partnerCaseField, portalVisibleField } from "@/lib/portal/config";
import type { Locale } from "@/lib/portal/i18n/dict";
import { CLOSED_STATUSES, portalStatus, statusDef, type Tone } from "@/lib/portal/status";

/**
 * Salesforce access for the Partnerportal.
 *
 * Every partner-facing Case query is scoped to the logged-in partner's Contact on the
 * server; a Case Id from the URL is only ever used together with that scope, so a partner
 * cannot read a Case by guessing its Id. The only writes are a CaseComment when a partner
 * sends a message, the document flags after an upload (via updateCaseCompleteness), and
 * the partner assignment an admin makes.
 */

const SF_ID = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

export function isSalesforceId(id: string | null | undefined): id is string {
  return !!id && SF_ID.test(id);
}

function soqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function isSessionError(err: any): boolean {
  const code: string = err?.errorCode || err?.data?.errorCode || "";
  const message: string = err?.data?.message || err?.message || "";
  return code === "INVALID_SESSION_ID" || /session expired or invalid/i.test(message);
}

/** Run a Salesforce call, logging in first if needed and once more if the session died. */
async function withSession<T>(op: () => Promise<T>): Promise<T> {
  if (!conn.accessToken) await login();
  try {
    return await op();
  } catch (err) {
    if (!isSessionError(err)) throw err;
    await login();
    return await op();
  }
}

// Fields the org turned out not to have. Remembered per server instance so the failing
// query is not repeated on every request.
const missingFields = new Set<string>();

/**
 * Run a SOQL query built from a field list. Salesforce refuses the whole query when one
 * field does not exist, and field names in this org have drifted before — so an unknown
 * field is dropped and the query retried rather than taking the portal down.
 */
async function queryWithFields<T = any>(fields: string[], build: (select: string) => string): Promise<T[]> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const select = fields.filter((f) => !missingFields.has(f)).join(", ");
    try {
      const res: any = await withSession(async () => await conn.query(build(select)));
      return (res?.records || []) as T[];
    } catch (err: any) {
      const code: string = err?.errorCode || err?.data?.errorCode || "";
      const message: string = err?.data?.message || err?.message || "";
      const col = message.match(/No such column '([^']+)'/)?.[1];
      if (code === "INVALID_FIELD" && col) {
        const hit = fields.find((f) => f.toLowerCase() === col.toLowerCase() || f.toLowerCase().endsWith("." + col.toLowerCase()));
        if (hit && !missingFields.has(hit)) {
          console.warn(`[portal] Salesforce has no field ${hit}; querying without it`);
          missingFields.add(hit);
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error("Salesforce query kept failing on unknown fields");
}

// ---------------------------------------------------------------------------
// Contacts (partners)
// ---------------------------------------------------------------------------

export type SalesforceContact = {
  Id: string;
  Name: string | null;
  Email: string | null;
  Phone: string | null;
  MobilePhone: string | null;
  AccountId: string | null;
  Account?: { Name?: string | null } | null;
  Korrespondenzsprache__c?: string | null;
};

export async function findContactByEmail(email: string): Promise<SalesforceContact | null> {
  const rows = await queryWithFields<SalesforceContact>(
    ["Id", "Name", "Email", "Phone", "MobilePhone", "AccountId", "Account.Name", "Korrespondenzsprache__c"],
    (select) => `SELECT ${select} FROM Contact WHERE Email = ${soqlString(email)} ORDER BY CreatedDate ASC LIMIT 1`
  );
  return rows[0] || null;
}

export type PartnerContact = { id: string; name: string; email: string | null; company: string | null; caseCount: number };

/** Every Contact that has at least one Case assigned as partner — for "Als Partner ansehen". */
export async function listPartnerContacts(): Promise<PartnerContact[]> {
  const field = partnerCaseField();
  const agg: any = await withSession(async () =>
    await conn.query(`SELECT ${field} cid, COUNT(Id) n FROM Case WHERE ${field} != null GROUP BY ${field}`)
  );
  const counts = new Map<string, number>((agg?.records || []).map((r: any) => [r.cid as string, Number(r.n) || 0]));
  const ids = Array.from(counts.keys()).filter(isSalesforceId);
  const out: PartnerContact[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).map(soqlString).join(",");
    const rows = await queryWithFields<SalesforceContact>(["Id", "Name", "Email", "Account.Name"], (select) =>
      `SELECT ${select} FROM Contact WHERE Id IN (${chunk})`
    );
    for (const c of rows) {
      out.push({ id: c.Id, name: c.Name || c.Email || c.Id, email: c.Email, company: c.Account?.Name ?? null, caseCount: counts.get(c.Id) || 0 });
    }
  }
  return out.sort((a, b) => b.caseCount - a.caseCount || a.name.localeCompare(b.name));
}

export async function getContact(contactId: string): Promise<SalesforceContact | null> {
  if (!isSalesforceId(contactId)) return null;
  const rows = await queryWithFields<SalesforceContact>(
    ["Id", "Name", "Email", "Phone", "MobilePhone", "AccountId", "Account.Name"],
    (select) => `SELECT ${select} FROM Contact WHERE Id = ${soqlString(contactId)} LIMIT 1`
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

type L10n = Record<Locale, string>;

export const DOC_FLAGS: { field: string; label: L10n }[] = [
  { field: "Dok_Identitaetsdokument__c", label: { de: "Ausweiskopie", en: "Copy of ID", fr: "Copie de la pièce d'identité", it: "Copia del documento d'identità" } },
  { field: "Dok_Lohnausweis__c", label: { de: "Lohnausweis", en: "Salary statement", fr: "Certificat de salaire", it: "Certificato di salario" } },
  { field: "Dok_Steuererklaerung__c", label: { de: "Steuererklärung", en: "Tax return", fr: "Déclaration d'impôt", it: "Dichiarazione d'imposta" } },
  { field: "Dok_Pensionskassenausweis__c", label: { de: "Pensionskassenausweis", en: "Pension fund certificate", fr: "Certificat de caisse de pension", it: "Certificato della cassa pensione" } },
  { field: "Dok_Betreibungsregisterauszug__c", label: { de: "Betreibungsregisterauszug", en: "Debt collection register extract", fr: "Extrait du registre des poursuites", it: "Estratto del registro esecuzioni" } },
  { field: "Dok_Kaufvertrag__c", label: { de: "Kaufvertrag", en: "Purchase contract", fr: "Contrat de vente", it: "Contratto di compravendita" } },
  { field: "Dok_Grundbuchauszug__c", label: { de: "Grundbuchauszug", en: "Land register extract", fr: "Extrait du registre foncier", it: "Estratto del registro fondiario" } },
  { field: "Dok_Gebaeudeversicherungsausweis__c", label: { de: "Gebäudeversicherung", en: "Building insurance", fr: "Assurance bâtiment", it: "Assicurazione stabili" } },
  { field: "Dok_Fotos_der_Immobilie__c", label: { de: "Fotos der Immobilie", en: "Photos of the property", fr: "Photos du bien", it: "Foto dell'immobile" } },
  { field: "Dok_Grundrissplaene__c", label: { de: "Grundrisspläne", en: "Floor plans", fr: "Plans", it: "Planimetrie" } },
];

// Case.Reason picklist values (read from the org).
const ART: Record<string, L10n> = {
  "Neue Hypothek": { de: "Neue Hypothek", en: "New mortgage", fr: "Nouvelle hypothèque", it: "Nuova ipoteca" },
  Ablösung: { de: "Ablösung", en: "Refinancing", fr: "Refinancement", it: "Rifinanziamento" },
};
const ART_FALLBACK: L10n = { de: "Finanzierung", en: "Financing", fr: "Financement", it: "Finanziamento" };
const UNNAMED: L10n = { de: "Unbenannter Case", en: "Unnamed case", fr: "Dossier sans nom", it: "Pratica senza nome" };

const LIST_FIELDS = [
  "Id",
  "CaseNumber",
  "CreatedDate",
  "LastModifiedDate",
  "Status",
  "IsClosed",
  "Stage__c",
  "Reason",
  "Case_Name__c",
  "Account.Name",
  "Client_2__r.Name",
  "Client_3__r.Name",
  "Dokumenten_Check_State__c",
  "Gesch_tzter_Hypothekenbedarf__c",
  "Hypothekarvolumen__c",
  "Betrag__c",
  "Documents_completed__c",
  "Welche_Banken_wurden_angefragt__c",
  "Angebot_Datum__c",
  ...DOC_FLAGS.map((d) => d.field),
];

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "Owner.Name",
  "Owner.Email",
  "Kreditnehmer__c",
  "Art_der_Immobilie__c",
  "Art_der_Liegenschaft__c",
  "Nutzung_der_Immobilie__c",
  "PLZ_Ort__c",
  "City__c",
  "Kaufpreis__c",
  "Eigenmittel__c",
  "EigenmittelProzent__c",
  "Tragbarkeit__c",
  "Hypothekarlaufzeiten__c",
  "Kaufdatum__c",
];

function scopeClause(contactId: string): string {
  const visible = portalVisibleField();
  return `${partnerCaseField()} = ${soqlString(contactId)}${visible ? ` AND ${visible} = true` : ""}`;
}

export type CaseDoc = { key: string | null; name: string; state: "fehlt" | "vorhanden" };

export type PortalCaseSummary = {
  id: string;
  nr: string;
  kunde: string;
  art: string;
  betrag: number | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  tone: Tone;
  step: number;
  rank: number;
  /** Labels of documents still missing. */
  missingDocs: string[];
  /** Missing (with funnel key, uploadable against it) and present documents. */
  documents: CaseDoc[];
};

export type PortalCaseDetail = PortalCaseSummary & {
  facts: { k: string; v: string }[];
  docsComplete: boolean | null;
  ownerName: string | null;
  ownerEmail: string | null;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

const MESSAGES = { de, en, fr, it } as unknown as Record<Locale, Record<string, Record<string, string> | undefined>>;

/** A funnel document key ("funnel.taxReturnLatest") in the website's own wording. */
export function docLabel(key: string, locale: Locale = "de"): string {
  const [ns, name] = key.split(".");
  return MESSAGES[locale]?.[ns]?.[name] || MESSAGES.de?.[ns]?.[name] || key;
}

type InquiryInfo = { missing: { key: string; label: string }[]; complete: boolean | null };

/** The funnel's verdict on missing documents, keyed by Salesforce Case Id. */
async function inquiryInfoByCase(caseIds: string[], locale: Locale): Promise<Map<string, InquiryInfo>> {
  const out = new Map<string, InquiryInfo>();
  if (!caseIds.length) return out;
  const rows = await prisma.inquiry.findMany({
    where: { salesforceCaseId: { in: caseIds } },
    select: { salesforceCaseId: true, documentsMissing: true, documentsComplete: true },
    orderBy: { createdAt: "desc" },
  });
  for (const r of rows) {
    if (!r.salesforceCaseId || out.has(r.salesforceCaseId)) continue;
    const keys = Array.from(new Set((r.documentsMissing || "").split(",").map((k) => k.trim()).filter(Boolean)));
    out.set(r.salesforceCaseId, { missing: keys.map((key) => ({ key, label: docLabel(key, locale) })), complete: r.documentsComplete });
  }
  return out;
}

/**
 * All borrowers of the Case: the customer Account plus Kunde 2 / Kunde 3. Two people with
 * the same surname read the way the design shows them: "Sarah & Marco Brunner".
 */
function customerName(rec: any): string | null {
  const names = [rec.Account?.Name, rec.Client_2__r?.Name, rec.Client_3__r?.Name]
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter(Boolean)
    .filter((n, i, all) => all.indexOf(n) === i);
  if (!names.length) return null;
  if (names.length === 2) {
    const [a, b] = names.map((n) => n.split(/\s+/));
    const lastA = a[a.length - 1];
    if (a.length > 1 && b.length > 1 && lastA === b[b.length - 1]) {
      return `${a.slice(0, -1).join(" ")} & ${b.slice(0, -1).join(" ")} ${lastA}`;
    }
  }
  return names.join(" & ");
}

/**
 * Documents HYPOTEQ has on file for the Case. Caseworkers tick them in the
 * "Dokumenten-Check" tab (stored as JSON in Dokumenten_Check_State__c, keys
 * "<Section>|<Label>"); the older Dok_*__c checkboxes are read as well. The tab's labels
 * are German and are shown as they are.
 */
function presentDocs(rec: any, locale: Locale): string[] {
  const names: string[] = DOC_FLAGS.filter((d) => rec[d.field] === true).map((d) => d.label[locale]);
  const raw = rec.Dokumenten_Check_State__c;
  if (typeof raw === "string" && raw) {
    try {
      const checked = JSON.parse(raw)?.checked || {};
      for (const [key, on] of Object.entries(checked)) {
        if (on !== true) continue;
        const label = key.includes("|") ? key.slice(key.indexOf("|") + 1) : key;
        if (label) names.push(label);
      }
    } catch {
      // A checklist that is not JSON is ignored; the Dok_*__c flags still count.
    }
  }
  return Array.from(new Set(names));
}

function summarize(rec: any, info: InquiryInfo | undefined, locale: Locale): PortalCaseSummary {
  const missing = info?.missing || [];
  // The Salesforce checkbox is never unticked on purpose, so only a tick means anything;
  // "incomplete" comes from the funnel's own verdict.
  const docsComplete = info?.complete ?? (rec.Documents_completed__c === true ? true : null);
  const status = portalStatus({
    stage: rec.Stage__c,
    sfStatus: rec.Status,
    isClosed: rec.IsClosed,
    banksRequested: rec.Welche_Banken_wurden_angefragt__c,
    offerDate: rec.Angebot_Datum__c,
    docsComplete,
    missingCount: missing.length,
  });
  const def = statusDef(status);
  const closed = CLOSED_STATUSES.includes(status);
  const documents: CaseDoc[] = [
    ...(closed ? [] : missing.map((m) => ({ key: m.key, name: m.label, state: "fehlt" as const }))),
    ...presentDocs(rec, locale).map((name) => ({ key: null, name, state: "vorhanden" as const })),
  ];
  return {
    id: rec.Id,
    nr: rec.CaseNumber || rec.Id,
    kunde: customerName(rec) || rec.Case_Name__c || UNNAMED[locale],
    art: rec.Reason ? ART[rec.Reason]?.[locale] || rec.Reason : ART_FALLBACK[locale],
    betrag: num(rec.Gesch_tzter_Hypothekenbedarf__c) ?? num(rec.Hypothekarvolumen__c) ?? num(rec.Betrag__c),
    createdAt: rec.CreatedDate,
    updatedAt: rec.LastModifiedDate,
    status,
    tone: def.tone,
    step: def.step,
    rank: def.rank,
    missingDocs: closed ? [] : missing.map((m) => m.label),
    documents,
  };
}

export async function listPartnerCases(contactId: string, locale: Locale = "de"): Promise<PortalCaseSummary[]> {
  if (!isSalesforceId(contactId)) return [];
  const recs = await queryWithFields(LIST_FIELDS, (select) =>
    `SELECT ${select} FROM Case WHERE ${scopeClause(contactId)} ORDER BY CreatedDate DESC LIMIT 500`
  );
  const info = await inquiryInfoByCase(recs.map((r: any) => r.Id), locale);
  return recs.map((r: any) => summarize(r, info.get(r.Id), locale));
}

function formatChf(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : `CHF ${Math.round(n).toLocaleString("de-CH").replace(/’/g, "'")}`;
}

/** A Case of this partner, or null when it does not exist or is not theirs. */
export async function getPartnerCase(contactId: string, caseId: string, locale: Locale = "de"): Promise<PortalCaseDetail | null> {
  if (!isSalesforceId(contactId) || !isSalesforceId(caseId)) return null;
  const recs = await queryWithFields(DETAIL_FIELDS, (select) =>
    `SELECT ${select} FROM Case WHERE Id = ${soqlString(caseId)} AND ${scopeClause(contactId)} LIMIT 1`
  );
  const rec: any = recs[0];
  if (!rec) return null;

  const info = (await inquiryInfoByCase([rec.Id], locale)).get(rec.Id);
  const base = summarize(rec, info, locale);

  const ort = [rec.PLZ_Ort__c, rec.City__c].filter(Boolean).join(" ");
  const objekt = [rec.Art_der_Immobilie__c, rec.Art_der_Liegenschaft__c].filter(Boolean).join(" · ");
  const eigenmittel = formatChf(rec.Eigenmittel__c);
  const eigenmittelPct = num(rec.EigenmittelProzent__c);
  const tragbarkeit = num(rec.Tragbarkeit__c);
  const banks = (rec.Welche_Banken_wurden_angefragt__c || "").split(";").map((s: string) => s.trim()).filter(Boolean);
  // Keys of the `caseDetail.facts` dictionary; the page words them.
  const facts: [string, string | null][] = [
    ["nr", base.nr],
    ["art", base.art],
    ["borrower", rec.Kreditnehmer__c || null],
    ["object", objekt || null],
    ["place", ort || null],
    ["use", rec.Nutzung_der_Immobilie__c || null],
    ["price", formatChf(rec.Kaufpreis__c)],
    ["mortgage", base.betrag != null ? formatChf(base.betrag) : null],
    ["equity", eigenmittel ? (eigenmittelPct ? `${eigenmittel} (${eigenmittelPct.toFixed(0)} %)` : eigenmittel) : null],
    ["affordability", tragbarkeit != null ? `${tragbarkeit.toFixed(1)} %` : null],
    ["term", rec.Hypothekarlaufzeiten__c || null],
    ["date", rec.Kaufdatum__c || null],
    ["lenders", banks.length ? `${banks.length}` : null],
    ["offer", rec.Angebot_Datum__c ? new Date(rec.Angebot_Datum__c).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" }) : null],
    ["owner", rec.Owner?.Name || null],
  ];

  return {
    ...base,
    facts: facts.filter(([, v]) => v).map(([k, v]) => ({ k, v: v! })),
    docsComplete: info?.complete ?? (rec.Documents_completed__c === true ? true : null),
    ownerName: rec.Owner?.Name || null,
    ownerEmail: rec.Owner?.Email || null,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Post a partner's message to the Case as an internal CaseComment. */
export async function addCaseComment(caseId: string, body: string): Promise<void> {
  if (!isSalesforceId(caseId)) return;
  await withSession(() => (conn.sobject("CaseComment") as any).create({ ParentId: caseId, CommentBody: body.slice(0, 4000), IsPublished: false }));
}

export type UnassignedCase = { id: string; nr: string; kunde: string; betrag: number | null; createdAt: string };

/** Open Cases without a partner, newest first — candidates for an admin to assign. */
export async function listUnassignedCases(): Promise<UnassignedCase[]> {
  const recs = await queryWithFields(
    ["Id", "CaseNumber", "CreatedDate", "Account.Name", "Client_2__r.Name", "Client_3__r.Name", "Case_Name__c", "Gesch_tzter_Hypothekenbedarf__c", "Hypothekarvolumen__c"],
    (select) =>
      `SELECT ${select} FROM Case WHERE ${partnerCaseField()} = null AND IsClosed = false AND Stage__c != 'Verloren' ORDER BY CreatedDate DESC LIMIT 100`
  );
  return recs.map((r: any) => ({
    id: r.Id,
    nr: r.CaseNumber,
    kunde: customerName(r) || r.Case_Name__c || "Unbenannter Case",
    betrag: num(r.Gesch_tzter_Hypothekenbedarf__c) ?? num(r.Hypothekarvolumen__c),
    createdAt: r.CreatedDate,
  }));
}

/** Point a Case at a partner's Contact, or clear it (contactId = null). */
export async function setCasePartner(caseId: string, contactId: string | null): Promise<void> {
  if (!isSalesforceId(caseId) || (contactId !== null && !isSalesforceId(contactId))) {
    throw new Error("Invalid Salesforce Id");
  }
  await withSession(() => (conn.sobject("Case") as any).update({ Id: caseId, [partnerCaseField()]: contactId }));
}
