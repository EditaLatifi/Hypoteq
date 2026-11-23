import type { Tone } from "@/lib/portal/status";

/**
 * Partner Fast Lead (HYPOTEQ request 23.11.2026, DECISIONS P39): «Kunde einladen». The partner
 * enters the customer's contact details only; HYPOTEQ mails the customer a personal link to the
 * funnel (`/{lang}/funnel?lead=<token>`), the customer completes it, and the Case is linked to
 * the partner who invited. Rules, checks and labels shared by the form, the server action, the
 * funnel's lead endpoint and the submit. Pure and client-safe.
 *
 * HYPOTEQ's answers of 23.11.2026 (DECISIONS P40):
 *  - the Salesforce Case is created with the invitation, so the team can call the customer at
 *    once; the customer's submit updates that Case (components/fastLeadSalesforce.ts);
 *  - the Case says so in Comments (no new Origin value);
 *  - a customer who submits without the link, with the invited address, still goes to the partner;
 *  - the link is valid LEAD_TTL_DAYS days, reminders after 3 and 7 days (LEAD_REMINDER_DAYS);
 *    «Erneut senden» sends the same link again and extends it;
 *  - replies to the customer's mails go to the partner and HYPOTEQ;
 *  - the consent checkbox is enough, ticked by default.
 */

/** How long the link opens the funnel prefilled (HYPOTEQ 23.11.2026). */
export const LEAD_TTL_DAYS = 30;
/** Reminders to the customer, days after the invitation (HYPOTEQ 23.11.2026). */
export const LEAD_REMINDER_DAYS = [3, 7] as const;
/** Invitations per partner (Salesforce Contact) within 24 hours: a mailbox is not to be flooded. */
export const LEAD_MAX_PER_DAY = 20;
/** Mails per invitation: the first one and three «Erneut senden». */
export const LEAD_MAX_MAILS = 4;
/** «Erneut senden» not sooner than this after the last mail. */
export const LEAD_RESEND_MIN_MINUTES = 15;

export const NAME_MAX = 80;
export const PHONE_MAX = 40;

export const LEAD_LOCALES = ["de", "en", "fr", "it"] as const;
export type LeadLocale = (typeof LEAD_LOCALES)[number];

/** The funnel's own Anrede values (lib/funnel-v3/types.ts Anrede). */
export const LEAD_ANREDEN = ["Herr", "Frau"] as const;
export type LeadAnrede = (typeof LEAD_ANREDEN)[number];

export type LeadInput = {
  anrede?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  locale?: unknown;
  consent?: unknown;
};

export type CleanLead = {
  anrede: LeadAnrede | null;
  firstName: string;
  lastName: string;
  /** Lower case: the duplicate check and the funnel compare it. */
  email: string;
  phone: string | null;
  locale: LeadLocale;
};

export type LeadInputError = "firstName" | "lastName" | "email" | "phone" | "consent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function isLeadLocale(v: unknown): v is LeadLocale {
  return typeof v === "string" && (LEAD_LOCALES as readonly string[]).includes(v);
}

/** A phone number as people type it: digits, «+», spaces, brackets, «-», «/», «.»; at least 6 digits. */
export function isPlausiblePhone(v: string): boolean {
  return /^\+?[\d\s()./-]+$/.test(v) && (v.match(/\d/g) || []).length >= 6;
}

/**
 * The form, checked (again on the server). Name and e-mail are required — the mail greets the
 * customer and the funnel shows who invited whom; the phone is optional.
 */
export function validateLead(raw: LeadInput): { ok: true; value: CleanLead } | { ok: false; error: LeadInputError } {
  const firstName = clip(raw.firstName, NAME_MAX);
  const lastName = clip(raw.lastName, NAME_MAX);
  const email = clip(raw.email, 254).toLowerCase();
  const phone = clip(raw.phone, PHONE_MAX);
  if (!firstName) return { ok: false, error: "firstName" };
  if (!lastName) return { ok: false, error: "lastName" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email" };
  if (phone && !isPlausiblePhone(phone)) return { ok: false, error: "phone" };
  if (raw.consent !== true) return { ok: false, error: "consent" };
  const anrede = (LEAD_ANREDEN as readonly unknown[]).includes(raw.anrede) ? (raw.anrede as LeadAnrede) : null;
  return {
    ok: true,
    value: { anrede, firstName, lastName, email, phone: phone || null, locale: isLeadLocale(raw.locale) ? raw.locale : "de" },
  };
}

// ---- Status --------------------------------------------------------------------------------

/** What the partner's list shows. `expired` is derived; a submitted invitation never expires. */
export type LeadStatus = "invited" | "opened" | "submitted" | "expired";

export const LEAD_TONE: Record<LeadStatus, Tone> = {
  invited: "neutral",
  opened: "info",
  submitted: "success",
  expired: "warning",
};

export type LeadRowState = { status: string; expiresAt: Date | string };

export function leadStatus(row: LeadRowState, now: Date = new Date()): LeadStatus {
  if (row.status === "submitted") return "submitted";
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  return row.status === "opened" ? "opened" : "invited";
}

export function leadExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + LEAD_TTL_DAYS * 24 * 3600_000);
}

export type ResendCheck = "ok" | "submitted" | "limit" | "tooSoon";

/**
 * Whether «Erneut senden» may mail again: not after the submit, at most LEAD_MAX_MAILS mails,
 * and not within LEAD_RESEND_MIN_MINUTES of the last one. An expired invitation may be sent
 * again — the resend extends it.
 */
export function canResend(
  row: LeadRowState & { mailsSent: number; lastMailAt: Date | string | null; createdAt: Date | string },
  now: Date = new Date(),
): ResendCheck {
  if (row.status === "submitted") return "submitted";
  if (row.mailsSent >= LEAD_MAX_MAILS) return "limit";
  // A first mail that failed (mailsSent 0) may be retried at once.
  const last = new Date(row.lastMailAt ?? row.createdAt).getTime();
  if (row.mailsSent > 0 && now.getTime() - last < LEAD_RESEND_MIN_MINUTES * 60_000) return "tooSoon";
  return "ok";
}

// ---- Link ----------------------------------------------------------------------------------

/** lib/portal/crypto.ts newToken: 32 random bytes, base64url (43 characters). */
const TOKEN_RE = /^[A-Za-z0-9_-]{32,100}$/;

export function isLeadToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

/** The funnel the customer's link opens, in the language of the invitation. */
export function leadFunnelPath(locale: string, token: string): string {
  const lang = isLeadLocale(locale) ? locale : "de";
  return `/${lang}/funnel?lead=${encodeURIComponent(token)}`;
}

/** «Anna Muster (Muster Immobilien AG)», as the customer and HYPOTEQ read who invited. */
export function partnerLabel(p: { partnerName?: string | null; partnerCompany?: string | null; partnerEmail?: string | null }): string {
  const name = (p.partnerName || "").trim() || (p.partnerEmail || "").trim() || "HYPOTEQ Partner";
  const company = (p.partnerCompany || "").trim();
  return company && company.toLowerCase() !== name.toLowerCase() ? `${name} (${company})` : name;
}

export function customerLabel(p: { firstName: string; lastName: string }): string {
  return [p.firstName, p.lastName].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}

/** Initials for the funnel's partner chip: «AM». */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "H";
}

/** dd.mm.yyyy, Swiss time — the team mail and the Case note. */
export function swissDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" });
}

export type LeadMailParty = {
  partnerName: string | null;
  partnerCompany: string | null;
  partnerEmail: string;
  anrede: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  locale: string;
  expiresAt: Date | string;
};

/**
 * The mail to HYPOTEQ when a partner invites a customer: who invited whom, the Case the
 * invitation made (HYPOTEQ 23.11.2026: «so your team can call the client right away») or that
 * Salesforce refused it. German, like every team mail; «Antworten» goes to the partner.
 */
export function leadTeamMail(
  p: LeadMailParty,
  sf: { caseUrl: string | null; failed: boolean; partnerMissing?: boolean } = { caseUrl: null, failed: false },
): { subject: string; lines: string[] } {
  const partner = partnerLabel(p);
  const kunde = customerLabel(p);
  const contact = [[p.anrede, kunde].filter(Boolean).join(" "), p.email, p.phone].filter(Boolean).join(" · ");
  const caseLine = sf.failed
    ? "Der Case konnte in Salesforce nicht angelegt werden – bitte von Hand anlegen und dem Partner zuordnen. Schliesst der Kunde die Anfrage ab, entsteht er automatisch."
    : sf.partnerMissing
      ? `Der Case ist in Salesforce angelegt${sf.caseUrl ? `: ${sf.caseUrl}` : ""}, aber ohne Partner: Salesforce kennt den Kontakt oder die Firma des Partners nicht (mehr) oder gibt sie nicht frei – bitte den Partner von Hand zuordnen. Der Case wird mit den Angaben des Kunden aktualisiert, sobald dieser die Anfrage abschliesst.`
      : `Der Case ist in Salesforce angelegt und dem Partner zugeordnet (Kundenberater und Sales Partner)${sf.caseUrl ? `: ${sf.caseUrl}` : ""}. Er wird mit den Angaben des Kunden aktualisiert, sobald dieser die Anfrage abschliesst.`;
  return {
    subject: `Partner Fast Lead · ${kunde} · eingeladen von ${partner}`.slice(0, 250),
    lines: [
      `${partner} hat über das Partnerportal einen Kunden eingeladen, seine Finanzierungsanfrage selbst zu vervollständigen.`,
      `Kunde: ${contact} · Sprache ${p.locale.toUpperCase()}`,
      "Der Partner hat bestätigt, dass der Kunde einverstanden ist, von HYPOTEQ per E-Mail und Telefon kontaktiert zu werden.",
      caseLine,
      `Der Link des Kunden ist bis ${swissDate(p.expiresAt)} gültig; nach ${LEAD_REMINDER_DAYS.join(" und ")} Tagen erinnern wir ihn, falls er noch nicht abgeschlossen hat.`,
      `«Antworten» geht direkt an ${p.partnerEmail}.`,
    ],
  };
}

/**
 * Which reminder is due (1 after 3 days, 2 after 7), or none: only for an open invitation whose
 * link still works, one at a time (a missed day sends the first, the next day the second), and
 * not within a day of another mail to the customer («Erneut senden», the previous reminder).
 */
export function reminderDue(
  row: LeadRowState & { createdAt: Date | string; remindersSent: number; lastMailAt: Date | string | null; lastReminderAt: Date | string | null },
  now: Date = new Date(),
): 1 | 2 | null {
  const status = leadStatus(row, now);
  if (status !== "invited" && status !== "opened") return null;
  const n = row.remindersSent;
  if (n >= LEAD_REMINDER_DAYS.length) return null;
  const day = 24 * 3600_000;
  const age = now.getTime() - new Date(row.createdAt).getTime();
  if (age < LEAD_REMINDER_DAYS[n] * day) return null;
  const last = Math.max(row.lastMailAt ? new Date(row.lastMailAt).getTime() : 0, row.lastReminderAt ? new Date(row.lastReminderAt).getTime() : 0);
  if (last && now.getTime() - last < day) return null;
  return (n + 1) as 1 | 2;
}
