/**
 * Who is behind a Berater e-mail (spec 2.2 / 6.3, DECISIONS D13).
 *
 *   - @hypoteq.ch / @hypoteq.com  → an active Salesforce User (Case.OwnerId)
 *   - exact Contact e-mail match  → a sales-partner consultant (Case.Partner_Consultant__c,
 *                                   and the Contact's Account as the Sales Partner)
 *   - anything else               → unknown; the funnel offers «Als Partner erfassen» and
 *                                   HYPOTEQ creates the partner by hand later.
 *
 * Read-only by design. Unknown partners are NOT created as placeholder Contacts any more.
 *
 * Which Contacts count as "active VP-Berater" is not decided yet, so the extra criterion is
 * configuration: SF_PARTNER_CONTACT_FILTER is a SOQL boolean fragment appended to the
 * Contact query (e.g. `AND Account.Type = 'Vertriebspartner'`). Empty = any Contact.
 */
import { sfQuery, soqlString } from "@/components/salesforceApi";

export type PartnerResolution =
  | { status: "hypoteq"; userId: string; name: string }
  | {
      status: "partner";
      contactId: string;
      accountId: string | null;
      name: string;
      firstName: string | null;
      lastName: string | null;
      company: string | null;
    }
  | { status: "unknown" };

const HYPOTEQ_DOMAINS = ["hypoteq.ch", "hypoteq.com"];

/** Hits change rarely (a consultant leaves); misses must clear soon after HYPOTEQ adds someone. */
export const HIT_TTL_MS = 15 * 60 * 1000;
export const MISS_TTL_MS = 2 * 60 * 1000;

type CacheEntry = { value: PartnerResolution; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** For tests. */
export function clearPartnerCache(): void {
  cache.clear();
}

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function isHypoteqEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1] || "";
  return HYPOTEQ_DOMAINS.includes(domain);
}

/** The configured extra Contact criterion, always starting with AND (or empty). */
export function partnerContactFilter(): string {
  const raw = (process.env.SF_PARTNER_CONTACT_FILTER ?? "").trim();
  if (!raw) return "";
  return /^and\s/i.test(raw) ? raw : `AND ${raw}`;
}

export function buildUserQuery(email: string): string {
  const e = soqlString(normalizeEmail(email));
  return `SELECT Id, Name FROM User WHERE IsActive = true AND (Email = ${e} OR Username = ${e}) LIMIT 1`;
}

export function buildContactQuery(email: string): string {
  const e = soqlString(normalizeEmail(email));
  const filter = partnerContactFilter();
  return (
    `SELECT Id, FirstName, LastName, Name, Email, AccountId, Account.Name FROM Contact ` +
    `WHERE Email = ${e}${filter ? ` ${filter}` : ""} ORDER BY CreatedDate ASC LIMIT 1`
  );
}

async function lookup(email: string): Promise<PartnerResolution> {
  if (isHypoteqEmail(email)) {
    const [user] = await sfQuery<any>(buildUserQuery(email), "resolvePartner:User");
    return user?.Id ? { status: "hypoteq", userId: user.Id, name: user.Name || "" } : { status: "unknown" };
  }
  const [contact] = await sfQuery<any>(buildContactQuery(email), "resolvePartner:Contact");
  if (!contact?.Id) return { status: "unknown" };
  return {
    status: "partner",
    contactId: contact.Id,
    accountId: contact.AccountId || null,
    name: contact.Name || [contact.FirstName, contact.LastName].filter(Boolean).join(" "),
    firstName: contact.FirstName || null,
    lastName: contact.LastName || null,
    company: contact.Account?.Name || null,
  };
}

/**
 * Resolve a Berater e-mail. Cached per warm instance; `fresh: true` (used at submit, where
 * the Case is written) bypasses the cache and refreshes it. Salesforce errors propagate —
 * the caller decides how to degrade — and are never cached.
 */
export async function resolvePartner(
  email: string,
  opts: { fresh?: boolean; now?: number } = {}
): Promise<PartnerResolution> {
  const key = normalizeEmail(email);
  if (!key || !key.includes("@")) return { status: "unknown" };
  const cacheKey = `${key}|${partnerContactFilter()}`;
  const now = opts.now ?? Date.now();

  if (!opts.fresh) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now) return hit.value;
  }

  const value = await lookup(key);
  cache.set(cacheKey, { value, expiresAt: now + (value.status === "unknown" ? MISS_TTL_MS : HIT_TTL_MS) });
  return value;
}

/** «Max Muster» → «MM». */
export function initialsOf(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}
