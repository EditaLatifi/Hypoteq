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
 * Case field holding a portal-specific status (DECISIONS P2). It is only read when the org
 * describes it (lib/portal/salesforce.ts), so the portal runs unchanged until HYPOTEQ creates
 * it; while it is empty on a Case, the status is derived through lib/portal/status.ts.
 * PORTAL_SF_STATUS_FIELD renames it, "off" switches it off.
 */
export function portalStatusField(): string | null {
  const v = (process.env.PORTAL_SF_STATUS_FIELD || "Portal_Status__c").trim();
  return v && v.toLowerCase() !== "off" ? v : null;
}

/**
 * The Salesforce fields the handoff names for the portal (admin partner detail). None exists
 * in the org yet (checked 15.10.2026); they are described, never assumed.
 */
export const PORTAL_SF_FIELDS = {
  access: "Portal_Access__c",
  visible: "Portal_Visible__c",
  status: "Portal_Status__c",
  actionRequired: "Partner_Action_Required__c",
  notify: "Send_Notification__c",
} as const;

/**
 * Where partner messages and team notices go (DECISIONS P4). The UI names this address,
 * so it is read in one place.
 */
export function teamAddress(): string {
  return process.env.PORTAL_TEAM_EMAIL || process.env.SMTP_TO || "info@hypoteq.ch";
}

/** The mailbox portal e-mails are sent from. */
export function mailFromAddress(): string {
  return process.env.PORTAL_MAIL_FROM || process.env.SMTP_USER || "info@hypoteq.ch";
}

/** External tools of the sidebar and the dashboard; they open in a new tab. */
export const PORTAL_TOOLS = {
  valuation: "https://hypoteq-hedonic.wuestappraisal.com/",
  academy: "https://hypoteq.talentlms.com/plus/login",
} as const;

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
