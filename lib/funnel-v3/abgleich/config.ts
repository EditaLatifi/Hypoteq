/**
 * The Prüfregeln HYPOTEQ keeps in Salesforce (Spezifikation Datenabgleich 4.3, answer 5 of
 * 26.10.2026): read with the integration user, kept for 15 minutes, and the built-in start
 * values (rules.ts FALLBACK_RULES) whenever Salesforce cannot be reached or holds no usable
 * row. Server only. A change of a tolerance in Salesforce needs no funnel deployment.
 */

import { FALLBACK_RULES, PRUEFREGEL_SOQL, rulesFromSalesforce, type PruefRegel } from "./rules";

export const RULES_TTL_MS = 15 * 60_000;
/** After a failed read: ask again sooner than the TTL, but not on every request. */
const RETRY_MS = 60_000;

export interface LoadedRules {
  rules: readonly PruefRegel[];
  from: "salesforce" | "fallback";
  at: number;
}

let cache: LoadedRules | null = null;

export function clearPruefregelCache(): void {
  cache = null;
}

type Query = (soql: string, context: string) => Promise<Record<string, unknown>[]>;

async function salesforceQuery(): Promise<Query> {
  const { sfQuery } = await import("@/components/salesforceApi");
  return (soql, context) => sfQuery<Record<string, unknown>>(soql, context);
}

/**
 * The active rules. Test mode (the preview without Salesforce) uses the start values.
 * `query` is injectable for tests.
 */
export async function loadPruefregeln(opts: { now?: number; query?: Query; testMode?: boolean } = {}): Promise<LoadedRules> {
  const now = opts.now ?? Date.now();
  if (cache && now - cache.at < (cache.from === "salesforce" ? RULES_TTL_MS : RETRY_MS)) return cache;
  const testMode = opts.testMode ?? (await import("@/components/testMode")).isTestMode();
  // Test mode, or no Salesforce configured (a test process): the start values, no request.
  if (!opts.query && (testMode || !process.env.SF_CLIENT_ID)) return (cache = { rules: FALLBACK_RULES, from: "fallback", at: now });
  try {
    const query = opts.query ?? (await salesforceQuery());
    const rows = await query(PRUEFREGEL_SOQL, "Pruefregel__c");
    const rules = rulesFromSalesforce(rows);
    cache = rules ? { rules, from: "salesforce", at: now } : { rules: FALLBACK_RULES, from: "fallback", at: now };
  } catch (err) {
    console.warn("[abgleich] Pruefregel__c not readable, using the built-in start values:", err instanceof Error ? err.message : err);
    cache = { rules: FALLBACK_RULES, from: "fallback", at: now };
  }
  return cache;
}
