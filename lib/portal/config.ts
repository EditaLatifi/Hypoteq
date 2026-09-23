/**
 * Partnerportal settings. Everything has a working default; the env vars exist so the
 * Salesforce mapping can be corrected without a code change once the org is checked.
 */

/** Idle timeout: after this long without a request the session is dead (spec: 30 min). */
export const SESSION_IDLE_MINUTES = 30;
/** Hard cap on a session, however active. */
export const SESSION_MAX_HOURS = 12;

export const INVITE_TTL_HOURS = 7 * 24;
export const RESET_TTL_MINUTES = 30;
export const MAGIC_TTL_MINUTES = 15;

/** Failed logins per e-mail within the window before further attempts are refused. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_FAILURE_WINDOW_MINUTES = 15;

export const SESSION_COOKIE = "hq_portal_session";

/** Case lookup field that points at the partner's Salesforce Contact. */
export function partnerCaseField(): string {
  return process.env.PORTAL_SF_PARTNER_FIELD || "Partner_Consultant__c";
}

/**
 * Optional Case field holding a portal-specific status (e.g. Portal_Status__c). When unset,
 * the portal status is derived from Stage__c through lib/portal/status.ts.
 */
export function portalStatusField(): string | null {
  return process.env.PORTAL_SF_STATUS_FIELD || null;
}

/** Optional checkbox on Case (e.g. Portal_Visible__c); when set, only ticked Cases are shown. */
export function portalVisibleField(): string | null {
  return process.env.PORTAL_SF_VISIBLE_FIELD || null;
}

/** E-mails that are HYPOTEQ administrators. They can log in by magic link without an invite. */
export function adminEmails(): string[] {
  return (process.env.PORTAL_ADMIN_EMAILS || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
