/**
 * The Lightning link to a Case for the internal mail (Handover 7.1 «Link zum Case»), from the
 * org's instance URL (jsforce `conn.instanceUrl` after login) and the Case id.
 *
 *   https://hypoteq-ch.my.salesforce.com  →  https://hypoteq-ch.lightning.force.com/lightning/r/Case/<id>/view
 *
 * `SF_LIGHTNING_BASE_URL` overrides the base (a custom domain, a sandbox); it is used as given.
 * Null without a usable base or id — the mail then names the Case id instead of a broken link.
 */

const CASE_ID_RE = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

export function salesforceCaseUrl(instanceUrl: string | null | undefined, caseId: string | null | undefined): string | null {
  const id = (caseId || "").trim();
  if (!CASE_ID_RE.test(id)) return null;
  const override = (process.env.SF_LIGHTNING_BASE_URL || "").trim();
  let base = (override || instanceUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+/i.test(base)) return null;
  if (!override) base = base.replace(/\.my\.salesforce\.com$/i, ".lightning.force.com");
  return `${base}/lightning/r/Case/${id}/view`;
}
