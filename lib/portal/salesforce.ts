import { conn, login } from "@/components/salesforceApi";
import { prisma } from "@/lib/prisma";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";
import { DOKUMENTEN_CHECK_MAP } from "@/components/dokumentenCheckState";
import { translate } from "@/lib/funnel-v3/i18n";
import { baseId, getRequirement } from "@/lib/funnel-v3/requirements";
import { buildCaseDocs, type CaseDoc, type PresentDoc } from "@/lib/portal/caseDocs";
import { special as SPECIAL_TEXTS } from "@/lib/portal/i18n/special";
import { isSpecialType, specialArt, type SpecialType } from "@/lib/portal/special";
import { ACCOUNT_PORTAL_FIELDS, enforceAccountFlags, partnerActionField, partnerCaseField, portalStatusField } from "@/lib/portal/config";
import type { Locale } from "@/lib/portal/i18n/dict";
import { keysForSfFlag, keysForTabEntry, outstandingKeys, parseChecklist, personsByKey, reworkDocs } from "@/lib/portal/requiredDocs";
import {
  PORTAL_STATUSES,
  actionRequired,
  hasPortalStatus,
  isClosedStatus,
  needsDocument,
  portalStatus,
  statusDef,
  type CaseStatus,
  type Tone,
} from "@/lib/portal/status";

/**
 * Salesforce access for the Partnerportal.
 *
 * Every partner-facing Case query is scoped to the logged-in partner's Contact on the
 * server; a Case Id from the URL is only ever used together with that scope, so a partner
 * cannot read a Case by guessing its Id. The writes are the Tasks of a partner's message
 * and support report (lib/portal/caseMessage.ts, supportServer.ts; a CaseComment only when a
 * Task is refused), the document flags after an upload (via updateCaseCompleteness), and the
 * partner assignment an admin makes.
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
        // Salesforce names the column without its relationship, so `Erwerbsstatus__c` can be
        // `Account.Erwerbsstatus__c` or `Client_2__r.Erwerbsstatus__c`: drop the first one not
        // dropped yet, and the next attempt drops the other if it is missing too.
        const hit = fields.find(
          (f) => !missingFields.has(f) && (f.toLowerCase() === col.toLowerCase() || f.toLowerCase().endsWith("." + col.toLowerCase()))
        );
        if (hit) {
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

// Field names per object as the org describes them (lower case): one describe per object
// and server instance. A failed describe is not remembered, so the next request retries.
const described = new Map<string, Promise<Set<string>>>();

function describeFields(object: string): Promise<Set<string>> {
  let fields = described.get(object);
  if (!fields) {
    fields = withSession(async () => (await (conn.sobject(object) as any).describe()) as any)
      .then((d: any) => new Set<string>((d?.fields || []).map((f: any) => String(f?.name || "").toLowerCase())))
      .catch((err) => {
        described.delete(object);
        throw err;
      });
    described.set(object, fields);
  }
  return fields;
}

/**
 * Whether the org has a field. False when Salesforce cannot say: the portal then works
 * without it rather than failing — which is how every optional Portal_* field is read.
 */
export async function hasField(object: string, field: string): Promise<boolean> {
  try {
    return (await describeFields(object)).has(field.toLowerCase());
  } catch (err) {
    console.warn(`[portal] could not describe ${object}; treating ${field} as absent`, (err as any)?.message || err);
    return false;
  }
}

/** Case.Portal_Status__c (DECISIONS P2) when the org has it, else null. */
async function caseStatusField(): Promise<string | null> {
  const field = portalStatusField();
  return field && (await hasField("Case", field)) ? field : null;
}

/** Case.Partner_Action_Required__c (B25) when the org has it, else null. */
async function caseActionField(): Promise<string | null> {
  const field = partnerActionField();
  return field && (await hasField("Case", field)) ? field : null;
}

/** The optional Case fields this org has: Portal_Status__c and Partner_Action_Required__c. */
type OptionalCaseFields = { status: string | null; action: string | null };

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
const OTHER_DOC: L10n = { de: "Weiteres Dokument", en: "Other document", fr: "Autre document", it: "Altro documento" };

const LIST_FIELDS = [
  "Id",
  "CaseNumber",
  "CreatedDate",
  "LastModifiedDate",
  "ClosedDate",
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
    "Partner_Consultant__r.Account.Name",
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
  return clause;
}

// ---------------------------------------------------------------------------
// Partner control on the Account (HYPOTEQ 19.10.2026 B25 / D.1)
// ---------------------------------------------------------------------------

/** Each checkbox of the partner's Account; null = the org has no such field, or it could not be read. */
export type AccountPortalFlags = { access: boolean | null; visible: boolean | null; notify: boolean | null };

const NO_FLAGS: AccountPortalFlags = { access: null, visible: null, notify: null };
const FLAG_TTL_MS = 60_000;
const flagCache = new Map<string, { at: number; flags: AccountPortalFlags }>();

/** Forget what this instance learnt about the org (describes, Account flags). For tests. */
export function resetSalesforceCaches(): void {
  flagCache.clear();
  described.clear();
}

/**
 * Account.Portal_Access__c, Portal_Visible__c and Send_Notification__c of a partner company.
 * Every field is described first and only read where the org has it. Never throws: when
 * Salesforce cannot say, every flag is null, and nothing is blocked or withheld for it.
 * Kept a minute per Account, since enforcement asks on every page.
 */
export async function accountPortalFlags(accountId: string | null | undefined, now = Date.now()): Promise<AccountPortalFlags> {
  if (!isSalesforceId(accountId)) return NO_FLAGS;
  const hit = flagCache.get(accountId);
  if (hit && now - hit.at < FLAG_TTL_MS) return hit.flags;
  const F = ACCOUNT_PORTAL_FIELDS;
  const keys = ["access", "visible", "notify"] as const;
  try {
    const has = await Promise.all(keys.map((k) => hasField("Account", F[k])));
    const present = keys.filter((_, i) => has[i]).map((k) => F[k]);
    let flags = NO_FLAGS;
    if (present.length) {
      const rows = await queryWithFields<any>(present, (s) => `SELECT ${s} FROM Account WHERE Id = ${soqlString(accountId)} LIMIT 1`);
      const r = rows[0];
      const val = (i: number) => (has[i] && r && typeof r[F[keys[i]]] === "boolean" ? (r[F[keys[i]]] as boolean) : null);
      flags = { access: val(0), visible: val(1), notify: val(2) };
    }
    flagCache.set(accountId, { at: now, flags });
    return flags;
  } catch (err) {
    console.warn(`[portal] could not read the portal flags of Account ${accountId}; not enforcing them`, (err as any)?.message || err);
    return NO_FLAGS;
  }
}

/**
 * Whether the partner's Cases stay hidden: only with PORTAL_ENFORCE_ACCOUNT_FLAGS=on and an
 * unticked Account.Portal_Visible__c. A fresh checkbox is unticked for every partner, so
 * this is off until HYPOTEQ has set them (DECISIONS P26).
 */
async function casesHidden(scope: PartnerScope): Promise<boolean> {
  if (!enforceAccountFlags()) return false;
  return (await accountPortalFlags(scope.accountId)).visible === false;
}

/**
 * Whether the partner company's portal access is switched off: only with
 * PORTAL_ENFORCE_ACCOUNT_FLAGS=on and an unticked Account.Portal_Access__c. Admins are never
 * refused, and neither is anyone when Salesforce cannot say.
 */
export async function portalAccessRefused(user: { role: string; sfAccountId: string | null }): Promise<boolean> {
  if (!enforceAccountFlags() || user.role === "admin") return false;
  return (await accountPortalFlags(user.sfAccountId)).access === false;
}

export type { CaseDoc } from "@/lib/portal/caseDocs";

export type PortalCaseSummary = {
  id: string;
  nr: string;
  kunde: string;
  art: string;
  betrag: number | null;
  createdAt: string;
  updatedAt: string;
  /** Case.ClosedDate, or the last change for a Case Portal_Status__c calls Abgeschlossen. */
  closedAt: string | null;
  status: string;
  tone: Tone;
  step: number;
  rank: number;
  /** Labels of documents confirmed missing — these drive the status and notifications. */
  missingDocs: string[];
  /** Labels of documents expected for a new Case but not confirmed missing yet. */
  openDocs: string[];
  /** Labels of the documents that are Fehlt, Ungültig or Neu erforderlich, most pressing first. */
  needDocs: string[];
  /** «Aktion erforderlich» (lib/portal/status.ts). */
  actionRequired: boolean;
  /** Missing, open (uploadable against their key), uploaded and present documents. */
  documents: CaseDoc[];
  /** Salesforce Status «On Hold»: the Case page says the Case is paused. */
  onHold: boolean;
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

/**
 * A document key in the website's own wording: a funnel key ("funnel.taxReturnLatest"), or a
 * Funnel v3 requirement instance id ("grundbuch", "lohn#b1") as v3 Cases store them.
 */
export function docLabel(key: string, locale: Locale = "de"): string {
  if (!key.includes(".")) {
    const id = baseId(key);
    const label = translate(locale, `doc.${id}`);
    return label && label !== `doc.${id}` ? label : getRequirement(id)?.labelDe || key;
  }
  const [ns, name] = key.split(".");
  return MESSAGES[locale]?.[ns]?.[name] || MESSAGES.de?.[ns]?.[name] || key;
}

export type DocContext = {
  /** The funnel's verdict, when the funnel created the Case. */
  inquiry: { missing: string[]; complete: boolean | null } | null;
  /** Document keys the partner has uploaded through the portal. */
  uploaded: string[];
  /** Every portal upload of the Case, newest first. */
  uploads: { docKey: string | null; fileName: string; at: Date }[];
  /** A Spezialfinanzierung from the portal wizard: its Art, and no standard document list. */
  special: SpecialType | null;
};

/** What the portal's own database knows about each Case's documents. */
async function docContextByCase(caseIds: string[]): Promise<Map<string, DocContext>> {
  const out = new Map<string, DocContext>(caseIds.map((id) => [id, { inquiry: null, uploaded: [], uploads: [], special: null }]));
  if (!caseIds.length) return out;
  const [rows, uploads, specials] = await Promise.all([
    prisma.inquiry.findMany({
      where: { salesforceCaseId: { in: caseIds } },
      select: { salesforceCaseId: true, documentsMissing: true, documentsComplete: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portalUpload.findMany({
      where: { caseId: { in: caseIds } },
      select: { caseId: true, docKey: true, fileName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // Before prisma/sql/2026-10-15-v5-and-portal.sql has run the table does not exist; the
    // Cases must still load, just without telling special financings apart.
    prisma.portalSpecialRequest
      .findMany({ where: { sfCaseId: { in: caseIds } }, select: { sfCaseId: true, type: true } })
      .catch((err: unknown) => {
        console.warn("[portal] special requests not readable", err);
        return [] as { sfCaseId: string | null; type: string }[];
      }),
  ]);
  for (const r of rows) {
    const ctx = r.salesforceCaseId ? out.get(r.salesforceCaseId) : undefined;
    if (!ctx || ctx.inquiry) continue;
    const keys = Array.from(new Set((r.documentsMissing || "").split(",").map((k) => k.trim()).filter(Boolean)));
    ctx.inquiry = { missing: keys, complete: r.documentsComplete };
  }
  for (const u of uploads) {
    const ctx = out.get(u.caseId);
    if (!ctx) continue;
    if (u.docKey) ctx.uploaded.push(u.docKey);
    ctx.uploads.push({ docKey: u.docKey, fileName: u.fileName, at: u.createdAt });
  }
  for (const r of specials) {
    const ctx = r.sfCaseId ? out.get(r.sfCaseId) : undefined;
    if (ctx && isSpecialType(r.type)) ctx.special = r.type;
  }
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
 * outstanding: guessing there would ask partners for paper HYPOTEQ already has. Neither has
 * a Spezialfinanzierung: HYPOTEQ assesses it individually, so the mortgage list does not apply.
 */
// A Case at the document stage: Anfrage eingegangen, Unterlagen fehlen noch (only Salesforce
// says that before documents are counted) or Wir prüfen die Unterlagen (On Hold included).
const DOC_STAGE: CaseStatus[] = ["Anfrage eingegangen", "Unterlagen fehlen noch", "Wir prüfen die Unterlagen"];
// Of those, where HYPOTEQ's list is shown as expected when no checklist says more.
const EXPECT_LIST: CaseStatus[] = ["Anfrage eingegangen", "Unterlagen fehlen noch"];

function outstandingDocs(rec: any, ctx: DocContext, preStatus: CaseStatus): { missing: string[]; open: string[] } {
  if (isClosedStatus(preStatus) || ctx.special) return { missing: [], open: [] };
  if (ctx.inquiry) return { missing: ctx.inquiry.missing.filter((k) => !ctx.uploaded.includes(k)), open: [] };
  if (rec.Documents_completed__c === true) return { missing: [], open: [] };
  // Anything past the document stage has its paper.
  if (!DOC_STAGE.includes(preStatus)) return { missing: [], open: [] };

  const checklist = parseChecklist(rec.Dokumenten_Check_State__c);
  const outstanding = outstandingKeys(rec, checklist, ctx.uploaded);
  if (checklist?.checked && Object.keys(checklist.checked).length) {
    return {
      missing: outstanding.filter((k) => DOKUMENTEN_CHECK_MAP[k]?.length),
      open: outstanding.filter((k) => !DOKUMENTEN_CHECK_MAP[k]?.length),
    };
  }
  return EXPECT_LIST.includes(preStatus) ? { missing: [], open: outstanding } : { missing: [], open: [] };
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
function presentDocs(rec: any, locale: Locale): PresentDoc[] {
  const out: PresentDoc[] = DOC_FLAGS.filter((d) => rec[d.field] === true).map((d) => ({ name: d.label[locale], keys: keysForSfFlag(d.field) }));
  const raw = rec.Dokumenten_Check_State__c;
  if (typeof raw === "string" && raw) {
    try {
      const checked = JSON.parse(raw)?.checked || {};
      for (const [entry, on] of Object.entries(checked)) {
        if (on !== true) continue;
        const label = entry.includes("|") ? entry.slice(entry.indexOf("|") + 1) : entry;
        if (label) out.push({ name: label, keys: keysForTabEntry(entry) });
      }
    } catch {
      // A checklist that is not JSON is ignored; the Dok_*__c flags still count.
    }
  }
  return out;
}

export function summarize(rec: any, ctx: DocContext, locale: Locale, optional: OptionalCaseFields): PortalCaseSummary {
  const checklist = parseChecklist(rec.Dokumenten_Check_State__c);
  const sfPortalStatus = optional.status ? rec[optional.status] : null;
  const statusInput = {
    stage: rec.Stage__c,
    sfStatus: rec.Status,
    isClosed: rec.IsClosed,
    banksRequested: rec.Welche_Banken_wurden_angefragt__c,
    offerDate: rec.Angebot_Datum__c,
    portalStatus: sfPortalStatus,
  };
  // Where the Case stands before documents are taken into account; that decides whether
  // outstanding documents are worked out at all.
  const preStatus = portalStatus(statusInput);
  const closed = isClosedStatus(preStatus);
  const outstanding = outstandingDocs(rec, ctx, preStatus);
  // Asked for again: more specific than «missing», so such a key is listed once, as rework.
  const rework = closed ? [] : reworkDocs(checklist, ctx.uploaded);
  const reworkKeys = new Set(rework.map((r) => r.key));
  const missing = outstanding.missing.filter((k) => !reworkKeys.has(k));
  const missingCount = missing.length + rework.length;
  // The Salesforce checkbox is never unticked on purpose, so only a tick means anything.
  const docsComplete = ctx.inquiry?.complete ?? (rec.Documents_completed__c === true ? true : null);
  const status = portalStatus({ ...statusInput, docsComplete: missingCount ? false : docsComplete, missingCount, reworkCount: rework.length });
  const def = statusDef(status);

  // Uploads count as checked once the Case is past HYPOTEQ's review (DECISIONS P24).
  const documents = buildCaseDocs({
    missing,
    open: outstanding.open,
    rework,
    uploads: ctx.uploads,
    present: presentDocs(rec, locale),
    persons: personsByKey(checklist),
    label: (key) => docLabel(key, locale),
    otherLabel: OTHER_DOC[locale],
    pastReview: def.rank >= PORTAL_STATUSES["Anfrage wird für die Bank vorbereitet"].rank,
    lastChange: rec.LastModifiedDate,
  });

  // Partner_Action_Required__c decides «Aktion erforderlich» where the flows manage the Case.
  const flagValue = optional.action ? rec[optional.action] : undefined;
  const flag = optional.action ? { value: typeof flagValue === "boolean" ? flagValue : null, managed: hasPortalStatus(sfPortalStatus) } : null;

  const closedAt = rec.ClosedDate || (status === "Abgeschlossen" ? rec.LastModifiedDate : null) || null;
  return {
    id: rec.Id,
    nr: rec.CaseNumber || rec.Id,
    kunde: customerName(rec) || rec.Case_Name__c || UNNAMED[locale],
    art: ctx.special
      ? specialArt(SPECIAL_TEXTS[locale], ctx.special)
      : rec.Reason
        ? ART[rec.Reason]?.[locale] || rec.Reason
        : ART_FALLBACK[locale],
    betrag: num(rec.Gesch_tzter_Hypothekenbedarf__c) ?? num(rec.Hypothekarvolumen__c) ?? num(rec.Betrag__c),
    createdAt: rec.CreatedDate,
    updatedAt: rec.LastModifiedDate,
    closedAt,
    status,
    tone: def.tone,
    step: def.step,
    rank: def.rank,
    missingDocs: [...rework.map((r) => docLabel(r.key, locale)), ...missing.map((key) => docLabel(key, locale))],
    openDocs: outstanding.open.map((key) => docLabel(key, locale)),
    needDocs: documents.filter((d) => needsDocument(d.status)).map((d) => d.name),
    actionRequired: actionRequired(status, documents, flag),
    documents,
    onHold: (rec.Status || "").trim().toLowerCase() === "on hold",
    consultantId: rec.Partner_Consultant__c || null,
    consultantName: rec.Partner_Consultant__r?.Name || null,
  };
}

/** The list fields plus the optional ones this org has. */
async function caseFields(base: string[]): Promise<{ fields: string[]; optional: OptionalCaseFields }> {
  const [status, action] = await Promise.all([caseStatusField(), caseActionField()]);
  const extra = [status, action].filter((f): f is string => !!f && !base.includes(f));
  return { fields: [...base, ...extra], optional: { status, action } };
}

export async function listPartnerCases(scope: PartnerScope, locale: Locale = "de"): Promise<PortalCaseSummary[]> {
  if (!isSalesforceId(scope.contactId)) return [];
  if (await casesHidden(scope)) return [];
  const where = await scopeClause(scope);
  const { fields, optional } = await caseFields(LIST_FIELDS);
  const recs = await queryWithFields(fields, (select) => `SELECT ${select} FROM Case WHERE ${where} ORDER BY CreatedDate DESC LIMIT 500`);
  const ctx = await docContextByCase(recs.map((r: any) => r.Id));
  return recs.map((r: any) => summarize(r, ctx.get(r.Id)!, locale, optional));
}

function formatChf(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : `CHF ${Math.round(n).toLocaleString("de-CH").replace(/’/g, "'")}`;
}

/** TT.MM.JJJJ in Zurich time, or null for a missing or unreadable date. */
function swissDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" });
}

/** A Case of this partner, or null when it does not exist or is not theirs. */
export async function getPartnerCase(scope: PartnerScope, caseId: string, locale: Locale = "de"): Promise<PortalCaseDetail | null> {
  if (!isSalesforceId(scope.contactId) || !isSalesforceId(caseId)) return null;
  if (await casesHidden(scope)) return null;
  const where = await scopeClause(scope);
  const { fields, optional } = await caseFields(DETAIL_FIELDS);
  const recs = await queryWithFields(fields, (select) => `SELECT ${select} FROM Case WHERE Id = ${soqlString(caseId)} AND ${where} LIMIT 1`);
  const rec: any = recs[0];
  if (!rec) return null;

  const ctx = (await docContextByCase([rec.Id])).get(rec.Id)!;
  const base = summarize(rec, ctx, locale, optional);

  const ort = [rec.PLZ_Ort__c, rec.City__c].filter(Boolean).join(" ");
  const objekt = [rec.Art_der_Immobilie__c, rec.Art_der_Liegenschaft__c].filter(Boolean).join(" · ");
  const eigenmittel = formatChf(rec.Eigenmittel__c);
  const eigenmittelPct = num(rec.EigenmittelProzent__c);
  const tragbarkeit = num(rec.Tragbarkeit__c);
  const banks = (rec.Welche_Banken_wurden_angefragt__c || "").split(";").map((s: string) => s.trim()).filter(Boolean);
  const partner = [base.consultantName, rec.Partner_Consultant__r?.Account?.Name].filter(Boolean).join(" · ");
  // Keys of the `caseDetail.facts` dictionary; the page words them. The handoff's eight
  // facts first, in its order, then what else the Case knows.
  const facts: [string, string | null][] = [
    ["nr", base.nr],
    ["kunde", base.kunde],
    ["created", swissDate(base.createdAt)],
    ["art", base.art],
    ["mortgage", base.betrag != null ? formatChf(base.betrag) : null],
    ["object", [objekt, ort].filter(Boolean).join(", ") || null],
    ["partner", partner || null],
    ["updated", swissDate(base.updatedAt)],
    ["borrower", rec.Kreditnehmer__c || null],
    ["use", rec.Nutzung_der_Immobilie__c || null],
    ["price", formatChf(rec.Kaufpreis__c)],
    ["equity", eigenmittel ? (eigenmittelPct ? `${eigenmittel} (${eigenmittelPct.toFixed(0)} %)` : eigenmittel) : null],
    ["affordability", tragbarkeit != null ? `${tragbarkeit.toFixed(1)} %` : null],
    ["term", rec.Hypothekarlaufzeiten__c || null],
    ["date", swissDate(rec.Kaufdatum__c) || rec.Kaufdatum__c || null],
    ["lenders", banks.length ? `${banks.length}` : null],
    ["offer", swissDate(rec.Angebot_Datum__c)],
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

export type PortalFieldRow = {
  field: string;
  /** Where the org has the field; null = «Feld nicht vorhanden». */
  object: "Case" | "Account" | null;
  /** Account fields: the value on the partner's Account (null = empty or no Account). */
  value?: string | null;
  /** Case fields: on how many of the partner's Cases the field is ticked or filled. */
  counts?: { hit: number; total: number; values: string[] };
};

/**
 * The Salesforce portal fields for one partner (admin partner detail, HYPOTEQ 19.10.2026
 * B25 / D.1): Portal_Access__c, Portal_Visible__c and Send_Notification__c on the partner's
 * Account, Portal_Status__c and Partner_Action_Required__c counted over the partner's Cases.
 * Each is described first and read only where the org has it; nothing is assumed to exist.
 */
export async function portalFieldReport(scope: PartnerScope): Promise<PortalFieldRow[]> {
  const A = ACCOUNT_PORTAL_FIELDS;
  const onAccount = [A.access, A.visible, A.notify];
  const onCase = [portalStatusField() || "Portal_Status__c", partnerActionField() || "Partner_Action_Required__c"];
  const [accountHas, caseHas] = await Promise.all([
    Promise.all(onAccount.map((f) => hasField("Account", f))),
    Promise.all(onCase.map((f) => hasField("Case", f))),
  ]);

  const presentOnAccount = onAccount.filter((_, i) => accountHas[i]);
  let account: any = null;
  if (presentOnAccount.length && isSalesforceId(scope.accountId)) {
    const rows = await queryWithFields<any>(presentOnAccount, (s) => `SELECT ${s} FROM Account WHERE Id = ${soqlString(scope.accountId!)} LIMIT 1`);
    account = rows[0] ?? null;
  }
  const accountRows: PortalFieldRow[] = onAccount.map((field, i) => {
    if (!accountHas[i]) return { field, object: null };
    const v = account?.[field];
    return { field, object: "Account", value: v == null || v === "" ? null : String(v) };
  });

  const presentOnCase = onCase.filter((_, i) => caseHas[i]);
  let recs: any[] = [];
  if (presentOnCase.length && isSalesforceId(scope.contactId)) {
    const where = await scopeClause(scope);
    recs = await queryWithFields<any>(["Id", ...presentOnCase], (s) => `SELECT ${s} FROM Case WHERE ${where} LIMIT 500`);
  }
  const caseRows: PortalFieldRow[] = onCase.map((field, i) => {
    if (!caseHas[i]) return { field, object: null };
    const set = recs.map((r) => r[field]).filter((v) => v === true || (typeof v === "string" && v.trim()));
    const values = Array.from(new Set(set.filter((v) => typeof v === "string").map((v) => String(v).trim()))).slice(0, 4);
    return { field, object: "Case", counts: { hit: set.length, total: recs.length, values } };
  });
  return [...accountRows, ...caseRows];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Post a partner's message to the Case as an internal CaseComment (fallback when its Task is refused). */
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
