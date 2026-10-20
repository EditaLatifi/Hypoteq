import { conn, login, withSessionRetry } from "@/components/salesforceApi";
import { isPlausibleEmail } from "@/lib/portal/config";
import type { MeldungInput } from "@/lib/portal/meldung";
import { isSalesforceId } from "@/lib/portal/salesforce";
import type { Tone } from "@/lib/portal/status";

/**
 * Partner data and «Änderung beantragen» (handoff 4 «Profil»).
 *
 * Salesforce is the master of the partner's data, so the profile only reads it. A partner
 * who wants something changed files a request: it is stored (PortalChangeRequest), becomes
 * a Task on their Contact in Salesforce, and is mailed to the HYPOTEQ team, who apply it
 * in Salesforce and set the status in the portal (/portal/admin/aenderungen).
 *
 * The Salesforce connection is a parameter so the logic runs against a fake in tests.
 */

// ---------------------------------------------------------------------------
// Fields and statuses
// ---------------------------------------------------------------------------

export const CHANGE_FIELDS = ["name", "company", "address", "email", "phone", "iban", "other"] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export function isChangeField(v: unknown): v is ChangeField {
  return typeof v === "string" && (CHANGE_FIELDS as readonly string[]).includes(v);
}

/** German labels, for Salesforce, the team mail and the audit log. The portal words them per language. */
export const CHANGE_FIELD_DE: Record<ChangeField, string> = {
  name: "Name",
  company: "Firma",
  address: "Adresse",
  email: "E-Mail (Login)",
  phone: "Telefon",
  iban: "Bankverbindung (IBAN)",
  other: "Sonstiges",
};

export const CHANGE_STATUSES = ["in_pruefung", "uebernommen", "abgelehnt"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export function isChangeStatus(v: unknown): v is ChangeStatus {
  return typeof v === "string" && (CHANGE_STATUSES as readonly string[]).includes(v);
}

export const CHANGE_STATUS_TONE: Record<ChangeStatus, Tone> = { in_pruefung: "info", uebernommen: "success", abgelehnt: "danger" };

export const CHANGE_STATUS_DE: Record<ChangeStatus, string> = { in_pruefung: "In Prüfung", uebernommen: "Übernommen", abgelehnt: "Abgelehnt" };

/** Requests one partner may file per 24 hours: each one is a Salesforce Task and a mail. */
export const MAX_CHANGE_REQUESTS_PER_DAY = 10;

/** Short reference shown to the partner and in Salesforce, e.g. «AA-3F9C2A». */
export function changeRequestNr(id: string): string {
  return `AA-${id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Partner data from Salesforce
// ---------------------------------------------------------------------------

export type PartnerData = {
  name: string | null;
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  partnerNr: string | null;
};

const BASE_FIELDS = [
  "Id",
  "Name",
  "Email",
  "Phone",
  "MobilePhone",
  "MailingStreet",
  "MailingPostalCode",
  "MailingCity",
  "AccountId",
  "Account.Name",
  "Account.BillingStreet",
  "Account.BillingPostalCode",
  "Account.BillingCity",
];

const FIELD_NAME = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/;

function fieldList(env: string | undefined, fallback: string[]): string[] {
  const list = (env || "").split(/[,;\s]+/).map((f) => f.trim()).filter((f) => FIELD_NAME.test(f));
  return list.length ? list : fallback;
}

/**
 * Where the IBAN and the partner number live (HYPOTEQ 19.10.2026 B26): `Account.IBAN_Nr__c`
 * (Text 50, not IBAN__c) and `Account.AccountNumber`. Candidates are queried in order and the
 * first filled one wins; a field the org does not have is dropped (see queryTolerant).
 * PORTAL_SF_IBAN_FIELDS / PORTAL_SF_PARTNER_NR_FIELDS correct the mapping without a code
 * change (Contact fields, or «Account.<Field>»).
 */
export function ibanFields(): string[] {
  return fieldList(process.env.PORTAL_SF_IBAN_FIELDS, ["Account.IBAN_Nr__c"]);
}

export function partnerNrFields(): string[] {
  return fieldList(process.env.PORTAL_SF_PARTNER_NR_FIELDS, ["Account.AccountNumber"]);
}

function pick(rec: any, path: string): string | null {
  const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), rec);
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}

function joinAddress(street: string | null, zip: string | null, city: string | null): string | null {
  const place = [zip, city].filter(Boolean).join(" ");
  const parts = [street?.replace(/\s*\r?\n\s*/g, ", ") || null, place || null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** The profile's view of a Contact record: the company address first, the contact's own otherwise. */
export function partnerDataFromContact(rec: any, opts: { iban?: string[]; partnerNr?: string[] } = {}): PartnerData {
  const company = joinAddress(pick(rec, "Account.BillingStreet"), pick(rec, "Account.BillingPostalCode"), pick(rec, "Account.BillingCity"));
  const own = joinAddress(pick(rec, "MailingStreet"), pick(rec, "MailingPostalCode"), pick(rec, "MailingCity"));
  const first = (paths: string[]) => paths.map((p) => pick(rec, p)).find(Boolean) ?? null;
  const iban = first(opts.iban ?? ibanFields());
  return {
    name: pick(rec, "Name"),
    company: pick(rec, "Account.Name"),
    address: company || own,
    email: pick(rec, "Email"),
    phone: pick(rec, "Phone") || pick(rec, "MobilePhone"),
    iban: iban ? formatIban(iban) : null,
    partnerNr: first(opts.partnerNr ?? partnerNrFields()),
  };
}

/** What the portal itself holds (copied from Salesforce at the invite), filling gaps in `sf`. */
export function mergePartnerData(
  sf: PartnerData | null,
  local: { name: string | null; company: string | null; phone: string | null; email: string }
): PartnerData {
  return {
    name: sf?.name || local.name || null,
    company: sf?.company || local.company || null,
    address: sf?.address ?? null,
    // The login is what the partner signs in with; that is the address that matters here.
    email: local.email,
    phone: sf?.phone || local.phone || null,
    iban: sf?.iban ?? null,
    partnerNr: sf?.partnerNr ?? null,
  };
}

/** The bit of a jsforce connection this module needs. */
export type SfConnection = {
  query(soql: string): Promise<{ records?: any[] }>;
  sobject(name: string): { create(record: Record<string, unknown>): Promise<any>; describe?(): Promise<any> };
};

/** The site's Salesforce connection: logged in on first use, once more if the session died. */
export function defaultConnection(): SfConnection {
  const run = async <T>(op: () => Promise<T>, context: string): Promise<T> => {
    if (!conn.accessToken) await login();
    return withSessionRetry(op, context);
  };
  return {
    query: (soql) => run(async () => (await conn.query(soql)) as any, "portal profile query"),
    sobject: (name) => ({
      create: (record) => run(async () => await (conn.sobject(name) as any).create(record), `portal ${name} create`),
      describe: () => run(async () => await (conn.sobject(name) as any).describe(), `portal ${name} describe`),
    }),
  };
}

// Fields the org turned out not to have, remembered per server instance.
const missingFields = new Set<string>();

/**
 * The selected field an INVALID_FIELD error is about. Salesforce names only the column and
 * the object it looked on («No such column 'IBAN__c' on entity 'Account'»), so with both
 * IBAN__c and Account.IBAN__c selected, the object decides; fields already dropped are
 * never the answer.
 */
function unknownField(fields: string[], missing: Set<string>, message: string): string | null {
  const col = message.match(/No such column '([^']+)'/)?.[1]?.toLowerCase();
  if (!col) return null;
  const entity = message.match(/on entity '([^']+)'/)?.[1]?.toLowerCase();
  const candidates = fields.filter((f) => !missing.has(f) && (f.toLowerCase() === col || f.toLowerCase().endsWith("." + col)));
  return (
    (entity && candidates.find((f) => f.toLowerCase().startsWith(entity + "."))) ||
    candidates.find((f) => !f.includes(".")) ||
    candidates[0] ||
    null
  );
}

/**
 * A SOQL query that survives unknown fields: Salesforce refuses the whole query when one
 * field does not exist, so that field is dropped and the query retried (the approach of
 * lib/portal/salesforce.ts).
 */
export async function queryTolerant<T = any>(
  sf: SfConnection,
  fields: string[],
  build: (select: string) => string,
  missing: Set<string> = missingFields
): Promise<T[]> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const select = fields.filter((f) => !missing.has(f)).join(", ");
    try {
      const res = await sf.query(build(select));
      return (res?.records || []) as T[];
    } catch (err: any) {
      const code: string = err?.errorCode || err?.data?.errorCode || "";
      const hit = code === "INVALID_FIELD" ? unknownField(fields, missing, err?.data?.message || err?.message || "") : null;
      if (!hit) throw err;
      console.warn(`[portal] Salesforce has no field ${hit}; querying without it`);
      missing.add(hit);
    }
  }
  throw new Error("Salesforce query kept failing on unknown fields");
}

export async function loadPartnerData(contactId: string, sf: SfConnection = defaultConnection(), missing?: Set<string>): Promise<PartnerData | null> {
  if (!isSalesforceId(contactId)) return null;
  const iban = ibanFields();
  const partnerNr = partnerNrFields();
  const fields = Array.from(new Set([...BASE_FIELDS, ...iban, ...partnerNr]));
  const rows = await queryTolerant(sf, fields, (select) => `SELECT ${select} FROM Contact WHERE Id = '${contactId}' LIMIT 1`, missing);
  return rows[0] ? partnerDataFromContact(rows[0], { iban, partnerNr }) : null;
}

// ---------------------------------------------------------------------------
// Validating a request
// ---------------------------------------------------------------------------

export const MAX_CHANGE_VALUE = 500;
export const MAX_CHANGE_NOTE = 1000;

export function normalizeIban(raw: string): string {
  return raw.replace(/[\s.-]/g, "").toUpperCase();
}

/** ISO 13616: country, check digits, and the mod-97 check over the whole number. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("CH") && iban.length !== 21) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

export function formatIban(raw: string): string {
  const iban = normalizeIban(raw);
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

export type ChangeProblem = "field" | "empty" | "tooLong" | "unchanged" | "email" | "iban";

export type ChangeRequestInput = { field: ChangeField; oldValue: string | null; newValue: string; note: string | null };

function currentValue(field: ChangeField, data: PartnerData | null): string | null {
  if (!data || field === "other") return null;
  return data[field] ?? null;
}

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A request as it will be stored, or why not. The current value comes from the server's
 * own read of Salesforce, never from the form.
 */
export function buildChangeRequest(
  input: { field: unknown; newValue: unknown; note: unknown },
  current: PartnerData | null
): { ok: true; value: ChangeRequestInput } | { ok: false; problem: ChangeProblem } {
  if (!isChangeField(input.field)) return { ok: false, problem: "field" };
  const field = input.field;
  let newValue = typeof input.newValue === "string" ? input.newValue.replace(/\s+/g, " ").trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!newValue) return { ok: false, problem: "empty" };
  if (newValue.length > MAX_CHANGE_VALUE || note.length > MAX_CHANGE_NOTE) return { ok: false, problem: "tooLong" };

  if (field === "email") {
    newValue = newValue.toLowerCase();
    if (!isPlausibleEmail(newValue)) return { ok: false, problem: "email" };
  }
  if (field === "iban") {
    if (!isValidIban(newValue)) return { ok: false, problem: "iban" };
    newValue = formatIban(newValue);
  }

  const oldValue = currentValue(field, current);
  if (oldValue && (field === "iban" ? normalizeIban(oldValue) === normalizeIban(newValue) : same(oldValue, newValue))) {
    return { ok: false, problem: "unchanged" };
  }
  return { ok: true, value: { field, oldValue, newValue, note: note || null } };
}

// ---------------------------------------------------------------------------
// The Portal_Meldung__c (HYPOTEQ's Flow makes the Task)
// ---------------------------------------------------------------------------

/** Calendar date in Zurich, as Salesforce date fields want it (YYYY-MM-DD). */
export function zurichDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
}

/** `days` working days (Monday to Friday) after `from`, by the Zurich calendar. */
export function addBusinessDays(from: Date, days: number): Date {
  const [y, m, d] = zurichDate(from).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12));
  let left = days;
  while (left > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    const wd = day.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return day;
}

export type ChangeRequestContext = {
  nr: string;
  request: ChangeRequestInput;
  partner: { name: string | null; email: string; company: string | null };
  /** Where HYPOTEQ sets the status, e.g. https://hypoteq.com/portal/admin/aenderungen */
  adminUrl: string;
};

/** What the request says, in German: the Task description and the body of the team mail. */
export function changeRequestLines(c: ChangeRequestContext): string[] {
  const who = `${c.partner.name || c.partner.email}${c.partner.company ? ` (${c.partner.company})` : ""} · ${c.partner.email}`;
  return [
    `Änderungsantrag ${c.nr} aus dem Partnerportal`,
    `Partner: ${who}`,
    `Feld: ${CHANGE_FIELD_DE[c.request.field]}`,
    `Aktueller Wert: ${c.request.oldValue || "–"}`,
    `Neuer Wert: ${c.request.newValue}`,
    `Bemerkung: ${c.request.note || "–"}`,
    ...(c.request.field === "email"
      ? ["Hinweis: Die E-Mail-Adresse ist das Login im Partnerportal. Das Login ändert sich dadurch nicht automatisch."]
      : []),
    `Bitte in Salesforce übernehmen und danach den Status im Portal setzen: ${c.adminUrl}`,
  ];
}

/**
 * The Portal_Meldung__c of type Änderungsantrag (HYPOTEQ 20.10.2026; lib/portal/meldung.ts):
 * HYPOTEQ's Flow turns it into an open Task for Fisnik. The description carries the old and the
 * new value and the partner's Contact, which a Meldung has no field for.
 */
export function changeMeldung(c: ChangeRequestContext & { contactId: string; accountId: string | null }): MeldungInput {
  return {
    typ: "aenderungsantrag",
    betreff: `Änderungsantrag Partnerportal: ${CHANGE_FIELD_DE[c.request.field]}`,
    beschreibung: [...changeRequestLines(c), `Salesforce-Kontakt: ${c.contactId}`].join("\n"),
    partnerEmail: c.partner.email,
    partnerAccountId: c.accountId,
  };
}
