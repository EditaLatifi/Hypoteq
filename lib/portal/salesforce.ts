import { conn, login } from "@/components/salesforceApi";
import { prisma } from "@/lib/prisma";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";
import { DOKUMENTEN_CHECK_MAP } from "@/components/dokumentenCheckState";
import { partnerCaseField, portalVisibleField } from "@/lib/portal/config";
import type { Locale } from "@/lib/portal/i18n/dict";
import { outstandingKeys, parseChecklist } from "@/lib/portal/requiredDocs";
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
  Primary__c?: boolean | null;
};

export async function findContactByEmail(email: string): Promise<SalesforceContact | null> {
  const rows = await queryWithFields<SalesforceContact>(
    ["Id", "Name", "Email", "Phone", "MobilePhone", "AccountId", "Account.Name", "Korrespondenzsprache__c", "Primary__c"],
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
    ["Id", "Name", "Email", "Phone", "MobilePhone", "AccountId", "Account.Name", "Primary__c"],
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
  "Partner_Consultant__c",
  "Partner_Consultant__r.Name",
  // What decides which documents HYPOTEQ's specification requires (lib/portal/requiredDocs.ts).
  "Kreditnehmer__c",
  "Art_der_Immobilie__c",
  "If_Neubau__c",
  "Art_der_Liegenschaft__c",
  "Nutzung_der_Immobilie__c",
  "If_nat_rliche_person__c",
  "Ist_die_Liegenschaft_bereits_reserviert__c",
  "Gibt_es_Renovationen_oder_Zusatzkosten__c",
  "Account.Erwerbsstatus__c",
  "Account.PersonBirthdate",
  "Client_2__r.Erwerbsstatus__c",
  "Client_2__r.PersonBirthdate",
  "Client_3__r.Erwerbsstatus__c",
  "Client_3__r.PersonBirthdate",
  ...DOC_FLAGS.map((d) => d.field),
];

// Salesforce rejects a query that selects the same field twice, hence the Set.
const DETAIL_FIELDS = Array.from(
  new Set([
    ...LIST_FIELDS,
    "Owner.Name",
    "Owner.Email",
    "PLZ_Ort__c",
    "City__c",
    "Kaufpreis__c",
    "Eigenmittel__c",
    "EigenmittelProzent__c",
    "Tragbarkeit__c",
    "Hypothekarlaufzeiten__c",
    "Kaufdatum__c",
  ])
);

/**
 * Whose Cases a portal session shows.
 *
 * Every partner sees the Cases they are the consultant on (Partner_Consultant__c), plus
 * the Cases of their own company (Case.Account__c, "Sales Partner") that name no
 * consultant — otherwise those Cases reach nobody. With `companyWide` (the company's
 * primary contact, or switched on by an admin) they see all of their company's Cases.
 */
export type PartnerScope = { contactId: string; accountId: string | null; companyWide: boolean };

// HYPOTEQ AG is the Sales Partner of every direct lead; being a contact of it must never
// open up those Cases. Resolved once per server instance.
let hypoteqAccountId: Promise<string | null> | null = null;
function hypoteqAccount(): Promise<string | null> {
  if (!hypoteqAccountId) {
    const name = process.env.HYPOTEQ_ACCOUNT_NAME || "HYPOTEQ AG";
    hypoteqAccountId = queryWithFields<{ Id: string }>(["Id"], (select) =>
      `SELECT ${select} FROM Account WHERE Name = ${soqlString(name)} AND IsPersonAccount = false LIMIT 1`
    )
      .then((rows) => rows[0]?.Id ?? null)
      .catch(() => {
        hypoteqAccountId = null;
        return null;
      });
  }
  return hypoteqAccountId;
}

async function scopeClause(scope: PartnerScope): Promise<string> {
  const pc = partnerCaseField();
  const me = `${pc} = ${soqlString(scope.contactId)}`;
  let clause = me;
  if (isSalesforceId(scope.accountId)) {
    const hq = await hypoteqAccount();
    if (scope.accountId !== hq) {
      const company = `Account__c = ${soqlString(scope.accountId)}`;
      clause = scope.companyWide ? `(${me} OR ${company})` : `(${me} OR (${company} AND ${pc} = null))`;
    }
  }
  const visible = portalVisibleField();
  return visible ? `${clause} AND ${visible} = true` : clause;
}

/**
 * - fehlt: confirmed missing — the funnel's verdict, or unticked in a checklist a
 *   caseworker has saved
 * - offen: required by HYPOTEQ's document list for a new Case, not confirmed yet
 * - vorhanden: on file at HYPOTEQ
 */
export type CaseDoc = { key: string | null; name: string; state: "fehlt" | "offen" | "vorhanden" };

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
  /** Labels of documents confirmed missing — these drive the status and notifications. */
  missingDocs: string[];
  /** Labels of documents expected for a new Case but not confirmed missing yet. */
  openDocs: string[];
  /** Missing, open (uploadable against their key) and present documents. */
  documents: CaseDoc[];
  /** The partner consultant named on the Case (differs from the viewer for company Cases). */
  consultantId: string | null;
  consultantName: string | null;
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

type DocContext = {
  /** The funnel's verdict, when the funnel created the Case. */
  inquiry: { missing: string[]; complete: boolean | null } | null;
  /** Document keys the partner has uploaded through the portal. */
  uploaded: string[];
};

/** What the portal's own database knows about each Case's documents. */
async function docContextByCase(caseIds: string[]): Promise<Map<string, DocContext>> {
  const out = new Map<string, DocContext>(caseIds.map((id) => [id, { inquiry: null, uploaded: [] }]));
  if (!caseIds.length) return out;
  const [rows, uploads] = await Promise.all([
    prisma.inquiry.findMany({
      where: { salesforceCaseId: { in: caseIds } },
      select: { salesforceCaseId: true, documentsMissing: true, documentsComplete: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portalUpload.findMany({ where: { caseId: { in: caseIds }, docKey: { not: null } }, select: { caseId: true, docKey: true } }),
  ]);
  for (const r of rows) {
    const ctx = r.salesforceCaseId ? out.get(r.salesforceCaseId) : undefined;
    if (!ctx || ctx.inquiry) continue;
    const keys = Array.from(new Set((r.documentsMissing || "").split(",").map((k) => k.trim()).filter(Boolean)));
    ctx.inquiry = { missing: keys, complete: r.documentsComplete };
  }
  for (const u of uploads) out.get(u.caseId)?.uploaded.push(u.docKey!);
  return out;
}

/**
 * The Case's outstanding documents, from the most reliable source available:
 *  1. the funnel's own verdict (Cases from the website);
 *  2. a checklist a caseworker saved in the Dokumenten-Check tab: what HYPOTEQ's list
 *     requires and is not ticked is missing — as long as the tab has an entry for it; a
 *     document it cannot tick stays "offen";
 *  3. a new Case with neither: HYPOTEQ's list, shown as expected ("offen").
 * A Case past the document stage (at the lenders, or marked complete) has nothing
 * outstanding: guessing there would ask partners for paper HYPOTEQ already has.
 */
function outstandingDocs(rec: any, ctx: DocContext, preStatus: string): { missing: string[]; open: string[] } {
  if (CLOSED_STATUSES.includes(preStatus)) return { missing: [], open: [] };
  if (ctx.inquiry) return { missing: ctx.inquiry.missing.filter((k) => !ctx.uploaded.includes(k)), open: [] };
  if (rec.Documents_completed__c === true) return { missing: [], open: [] };
  if (!["Neue Anfrage", "In Prüfung", "Pausiert"].includes(preStatus)) return { missing: [], open: [] };

  const checklist = parseChecklist(rec.Dokumenten_Check_State__c);
  const outstanding = outstandingKeys(rec, checklist, ctx.uploaded);
  if (checklist?.checked && Object.keys(checklist.checked).length) {
    return {
      missing: outstanding.filter((k) => DOKUMENTEN_CHECK_MAP[k]?.length),
      open: outstanding.filter((k) => !DOKUMENTEN_CHECK_MAP[k]?.length),
    };
  }
  return preStatus === "Neue Anfrage" ? { missing: [], open: outstanding } : { missing: [], open: [] };
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

function summarize(rec: any, ctx: DocContext, locale: Locale): PortalCaseSummary {
  const statusInput = {
    stage: rec.Stage__c,
    sfStatus: rec.Status,
    isClosed: rec.IsClosed,
    banksRequested: rec.Welche_Banken_wurden_angefragt__c,
    offerDate: rec.Angebot_Datum__c,
  };
  // Where the Case stands before documents are taken into account; that decides whether
  // outstanding documents are worked out at all.
  const preStatus = portalStatus(statusInput);
  const { missing, open } = outstandingDocs(rec, ctx, preStatus);
  // The Salesforce checkbox is never unticked on purpose, so only a tick means anything.
  const docsComplete = ctx.inquiry?.complete ?? (rec.Documents_completed__c === true ? true : null);
  const status = portalStatus({ ...statusInput, docsComplete: missing.length ? false : docsComplete, missingCount: missing.length });
  const def = statusDef(status);
  const documents: CaseDoc[] = [
    ...missing.map((key) => ({ key, name: docLabel(key, locale), state: "fehlt" as const })),
    ...open.map((key) => ({ key, name: docLabel(key, locale), state: "offen" as const })),
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
    missingDocs: missing.map((key) => docLabel(key, locale)),
    openDocs: open.map((key) => docLabel(key, locale)),
    documents,
    consultantId: rec.Partner_Consultant__c || null,
    consultantName: rec.Partner_Consultant__r?.Name || null,
  };
}

export async function listPartnerCases(scope: PartnerScope, locale: Locale = "de"): Promise<PortalCaseSummary[]> {
  if (!isSalesforceId(scope.contactId)) return [];
  const where = await scopeClause(scope);
  const recs = await queryWithFields(LIST_FIELDS, (select) => `SELECT ${select} FROM Case WHERE ${where} ORDER BY CreatedDate DESC LIMIT 500`);
  const ctx = await docContextByCase(recs.map((r: any) => r.Id));
  return recs.map((r: any) => summarize(r, ctx.get(r.Id)!, locale));
}

function formatChf(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : `CHF ${Math.round(n).toLocaleString("de-CH").replace(/’/g, "'")}`;
}

/** A Case of this partner, or null when it does not exist or is not theirs. */
export async function getPartnerCase(scope: PartnerScope, caseId: string, locale: Locale = "de"): Promise<PortalCaseDetail | null> {
  if (!isSalesforceId(scope.contactId) || !isSalesforceId(caseId)) return null;
  const where = await scopeClause(scope);
  const recs = await queryWithFields(DETAIL_FIELDS, (select) => `SELECT ${select} FROM Case WHERE Id = ${soqlString(caseId)} AND ${where} LIMIT 1`);
  const rec: any = recs[0];
  if (!rec) return null;

  const ctx = (await docContextByCase([rec.Id])).get(rec.Id)!;
  const base = summarize(rec, ctx, locale);

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
    docsComplete: base.missingDocs.length ? false : ctx.inquiry?.complete ?? (rec.Documents_completed__c === true ? true : null),
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
