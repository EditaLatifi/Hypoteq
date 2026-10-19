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

/** Link mails (magic link, reset, invite) per account and purpose within the window. */
export const LINK_MAX_PER_WINDOW = 5;
export const LINK_WINDOW_MINUTES = 15;

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
 * Case checkbox HYPOTEQ's status flow ticks while documents are missing (B25 / D.3); it
 * drives «Aktion erforderlich» (lib/portal/status.ts actionRequired). Read only when the org
 * describes it. PORTAL_SF_ACTION_FIELD renames it, "off" switches it off.
 */
export function partnerActionField(): string | null {
  const v = (process.env.PORTAL_SF_ACTION_FIELD || "Partner_Action_Required__c").trim();
  return v && v.toLowerCase() !== "off" ? v : null;
}

/**
 * The partner-control checkboxes on the partner's Account (HYPOTEQ 19.10.2026 B25 / D.1):
 * portal access, Cases visible in the portal, status e-mails. A new checkbox is false for
 * every partner until HYPOTEQ ticks it, so they are always described before they are read
 * and only enforced when PORTAL_ENFORCE_ACCOUNT_FLAGS is on (DECISIONS P26).
 */
export const ACCOUNT_PORTAL_FIELDS = {
  access: "Portal_Access__c",
  visible: "Portal_Visible__c",
  notify: "Send_Notification__c",
} as const;

/**
 * PORTAL_ENFORCE_ACCOUNT_FLAGS=on: an unticked Portal_Access__c refuses the login and an
 * unticked Portal_Visible__c hides the partner's Cases. Anything else (the default): the
 * admin partner page only shows them.
 */
export function enforceAccountFlags(): boolean {
  return (process.env.PORTAL_ENFORCE_ACCOUNT_FLAGS || "").trim().toLowerCase() === "on";
}

/**
 * PORTAL_STATUS_MAILS=on: the portal mails partners about Case changes itself (and respects
 * Account.Send_Notification__c). Default off: HYPOTEQ's Salesforce flows will send those
 * mails once the texts are released (B24 / F.1), and a partner must not get both. The
 * in-portal «Meldungen» are kept either way (DECISIONS P32).
 */
export function statusMailsOn(): boolean {
  return (process.env.PORTAL_STATUS_MAILS || "").trim().toLowerCase() === "on";
}

/** HYPOTEQ's one address (19.10.2026 A.2 / B20): «info@hypoteq.ch ist die einzig korrekte Adresse – überall». */
export const HYPOTEQ_ADDRESS = "info@hypoteq.ch";

/**
 * Where partner messages, support reports and team notices go (DECISIONS P4). The UI names
 * this address, so it is read in one place. PORTAL_TEAM_EMAIL overrides it (e.g. for a test
 * deployment); SMTP_TO, the website's contact-form address, no longer does.
 */
export function teamAddress(): string {
  return (process.env.PORTAL_TEAM_EMAIL || "").trim() || HYPOTEQ_ADDRESS;
}

/** The mailbox portal e-mails are sent from. */
export function mailFromAddress(): string {
  return process.env.PORTAL_MAIL_FROM || process.env.SMTP_USER || HYPOTEQ_ADDRESS;
}

/** External tools of the sidebar and the dashboard; they open in a new tab. */
export const PORTAL_TOOLS = {
  valuation: "https://hypoteq-hedonic.wuestappraisal.com/",
  academy: "https://hypoteq.talentlms.com/plus/login",
} as const;

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
