/**
 * Who is behind a Berater e-mail (spec 2.2 / 6.3, DECISIONS D13).
 *
 *   - @hypoteq.ch                 → an active Salesforce User (Case.OwnerId). Only hypoteq.ch:
 *                                   HYPOTEQ 19.10. A.2, there is no hypoteq.com address.
 *   - exact Contact e-mail match  → a sales-partner consultant (Case.Partner_Consultant__c,
 *                                   and the Contact's Account as the Sales Partner)
 *   - anything else               → unknown; the funnel offers «Als Partner erfassen» and
 *                                   HYPOTEQ creates the partner by hand later.
 *
 * Read-only by design. Unknown partners are NOT created as placeholder Contacts any more.
 *
 * Live (HYPOTEQ 19.10. B17: «live per API-Abfrage … 24h-Cache als Fallback», no daily export): a
 * Salesforce query per address, kept 15 minutes (2 for a miss). When Salesforce cannot be
 * reached, the last successful answer for that address is used if it is younger than 24 hours,
 * marked `stale` (DECISIONS V66). Both caches are in memory, per server instance: a cold
 * instance has no fallback yet, and the error goes to the caller as before.
 *
 * Which Contacts count as "active VP-Berater" is not decided yet, so the extra criterion is
 * configuration: SF_PARTNER_CONTACT_FILTER is a SOQL boolean fragment appended to the
 * Contact query (e.g. `AND Account.Type = 'Vertriebspartner'`). Empty = any Contact.
 */
import { sfQuery, soqlString } from "@/components/salesforceApi";

export type PartnerResolution = (
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
  | { status: "unknown" }
) & {
  /** From the 24-hour fallback: Salesforce was not reachable, this is the last successful answer. */
  stale?: true;
};

/** HYPOTEQ 19.10. A.2: hypoteq.ch is the only HYPOTEQ domain. */
const HYPOTEQ_DOMAINS = ["hypoteq.ch"];

/** Hits change rarely (a consultant leaves); misses must clear soon after HYPOTEQ adds someone. */
export const HIT_TTL_MS = 15 * 60 * 1000;
export const MISS_TTL_MS = 2 * 60 * 1000;
/** HYPOTEQ 19.10. B17: the last successful answer stands in for an unreachable Salesforce this long. */
export const FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { value: PartnerResolution; expiresAt: number };
const cache = new Map<string, CacheEntry>();
/** The last successful answer per address and when it came (the 24-hour fallback). */
const lastGood = new Map<string, { value: PartnerResolution; at: number }>();

/** For tests. */
export function clearPartnerCache(): void {
  cache.clear();
  lastGood.clear();
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
 * the Case is written) bypasses the cache and refreshes it. A Salesforce error is never cached;
 * it is answered from the last successful lookup of that address when that is younger than
 * FALLBACK_TTL_MS (`stale: true`, HYPOTEQ 19.10. B17), else it propagates — the caller decides
 * how to degrade.
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

  let value: PartnerResolution;
  try {
    value = await lookup(key);
  } catch (err) {
    const fallback = lastGood.get(cacheKey);
    if (fallback && now - fallback.at < FALLBACK_TTL_MS) {
      console.warn(`[Partner] Salesforce not reachable — answering ${key} from the lookup of ${new Date(fallback.at).toISOString()}:`, err);
      return { ...fallback.value, stale: true };
    }
    throw err;
  }
  cache.set(cacheKey, { value, expiresAt: now + (value.status === "unknown" ? MISS_TTL_MS : HIT_TTL_MS) });
  lastGood.set(cacheKey, { value, at: now });
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
