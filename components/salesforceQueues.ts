/**
 * Finding a Case queue by its name (HYPOTEQ 19.10. D.2 «Web-Anfragen», B21 «Spezialfinanzierung»).
 * Pure: the queries run in components/salesforceApi.ts and lib/portal/specialSalesforce.ts.
 */

/**
 * A queue name in one comparable form. «Web-Anfragen», «Web Anfragen», «Web–Anfragen»,
 * «Web_Anfragen» and «WebAnfragen» are one queue to a person, so they are one to the lookup.
 */
export function queueKey(name: unknown): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Every queue the integration user sees: the second look when the exact names missed. */
export const ALL_QUEUES_SOQL = "SELECT Id, Name, DeveloperName FROM Group WHERE Type = 'Queue' ORDER BY Name LIMIT 500";

export type QueueRow = { Id?: string | null; Name?: string | null; DeveloperName?: string | null };

/** The queue among `rows` whose Name or DeveloperName means one of `wanted` (queueKey), or null. */
export function pickQueue(rows: QueueRow[], wanted: string[]): { Id: string; Name: string } | null {
  const keys = new Set(wanted.map(queueKey).filter(Boolean));
  const hit = rows.find((r) => r.Id && (keys.has(queueKey(r.Name)) || keys.has(queueKey(r.DeveloperName))));
  return hit ? { Id: String(hit.Id), Name: String(hit.Name || hit.DeveloperName || "") } : null;
}

/** «Spezialfinanzierung (Spezialfinanzierung), Support (Support_Q)» — the names for a log line. */
export function queueList(rows: QueueRow[]): string {
  if (!rows.length) return "none";
  const shown = rows.slice(0, 30).map((r) => `${r.Name ?? "?"} (${r.DeveloperName ?? "?"})`);
  return shown.join(", ") + (rows.length > 30 ? `, … ${rows.length - 30} more` : "");
}
