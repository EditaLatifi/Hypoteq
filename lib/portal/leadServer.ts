import { isTestMode, skipped } from "@/components/testMode";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { teamAddress } from "@/lib/portal/config";
import { newToken } from "@/lib/portal/crypto";
import {
  LEAD_MAX_PER_DAY,
  LEAD_REMINDER_DAYS,
  LEAD_TTL_DAYS,
  canResend,
  customerLabel,
  initialsOf,
  isLeadToken,
  leadExpiry,
  leadFunnelPath,
  leadStatus,
  leadTeamMail,
  partnerLabel,
  reminderDue,
  swissDate,
  validateLead,
  type LeadAnrede,
  type LeadInput,
  type LeadInputError,
  type LeadLocale,
  type LeadStatus,
} from "@/lib/portal/lead";
import { maskEmail, sendLeadInviteMail, sendLeadReminderMail, sendTeamMail } from "@/lib/portal/mail";

/**
 * Partner Fast Lead on the server (DECISIONS P39, P40). The portal side — invite (with the
 * Salesforce Case at once), send again, list, the reminders after 3 and 7 days — and the funnel
 * side: the lead endpoint (`leadForLink`, app/api/funnel/lead/[token]) and the submit
 * (`leadPartnerForSubmit` / `leadPartnerForEmail`, `claimLead`, `recordLeadCase` in
 * app/api/inquiry), which credits the partner and updates the invitation's Case.
 *
 * The partner always comes from this table, never from the browser: the funnel only carries the
 * token, and the submit looks the invitation up again.
 *
 * Test mode: the database is shared, so a deployment only credits, updates and reminds the
 * invitations of its own kind (`testDeployment`) — a tester's real address never pulls a
 * production invitation, and production never reminds a Preview test.
 */

export type LeadPartner = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  sfContactId: string | null;
  sfAccountId: string | null;
};

export type LeadCtx = { origin: string; ip: string | null; now?: Date };

export type CreateLeadError = LeadInputError | "self" | "duplicate" | "limit" | "mail" | "failed";

export type CreateLeadResult = { ok: true; id: string; name: string; email: string } | { ok: false; error: CreateLeadError };

const OPEN_STATUSES = ["invited", "opened"];

type MailRow = { email: string; firstName: string; token: string; locale: string; partnerName: string | null; partnerCompany: string | null; partnerEmail: string };

/** «Antworten» on a mail to the customer reaches the partner and HYPOTEQ (HYPOTEQ 23.11.2026). */
function customerReplyTo(row: Pick<MailRow, "partnerEmail">): string[] {
  return [row.partnerEmail, teamAddress()];
}

/** The invitation mail for a stored row: the customer's language, the partner as the customer reads them. */
async function mailInvitation(row: MailRow, origin: string): Promise<boolean> {
  return sendLeadInviteMail({
    to: row.email,
    firstName: row.firstName,
    partner: partnerLabel(row),
    origin,
    url: `${origin}${leadFunnelPath(row.locale, row.token)}`,
    locale: row.locale,
    days: LEAD_TTL_DAYS,
    replyTo: customerReplyTo(row),
  });
}

type InvitationCase = { caseId: string | null; caseUrl: string | null; failed: boolean };

/**
 * The Case of the invitation (HYPOTEQ 23.11.2026, DECISIONS P40: «as soon as the partner sends the
 * invitation, so your team can call the client right away»). Non-fatal: a refusal keeps the
 * invitation, the team mail says so, and the customer's submit creates the Case as for any request.
 * The Preview creates it too (V115: every Preview submission creates its Case).
 */
async function invitationCase(row: LeadRow): Promise<InvitationCase> {
  try {
    const sf = await import("@/components/salesforceApi");
    const { createLeadCase } = await import("@/components/fastLeadSalesforce");
    await sf.default.login();
    const res = await createLeadCase(
      {
        customer: { anrede: row.anrede, firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone, locale: row.locale },
        partner: {
          contactId: row.sfContactId,
          accountId: row.sfAccountId,
          name: row.partnerName,
          company: row.partnerCompany,
          email: row.partnerEmail,
          invitedAt: row.createdAt.toISOString(),
        },
        expiresAt: row.expiresAt,
      },
      sf.default,
    );
    await prisma.portalLead.update({ where: { id: row.id }, data: { salesforceCaseId: res.caseId } });
    if (res.dropped.length) console.warn(`[portal] lead ${row.id}: Salesforce dropped ${res.dropped.join(", ")}`);
    let caseUrl: string | null = null;
    try {
      const { salesforceCaseUrl } = await import("@/lib/funnel-v3/mail/caseLink");
      caseUrl = salesforceCaseUrl((sf as any).conn?.instanceUrl ?? null, res.caseId);
    } catch {
      /* the team mail goes without the link */
    }
    return { caseId: res.caseId, caseUrl, failed: false };
  } catch (err) {
    console.error(`[portal] lead ${row.id}: the invitation's Salesforce Case failed (the submit will create one)`, err);
    return { caseId: null, caseUrl: null, failed: true };
  }
}

/**
 * «Einladung senden». Stores the invitation, mails the customer, tells HYPOTEQ. A mail that
 * fails keeps the invitation (the list offers «Erneut senden») and answers `mail`.
 */
export async function createLead(user: LeadPartner, input: LeadInput, ctx: LeadCtx): Promise<CreateLeadResult> {
  const now = ctx.now ?? new Date();
  const checked = validateLead(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const v = checked.value;
  if (!user.sfContactId) return { ok: false, error: "failed" };
  if (v.email === user.email.trim().toLowerCase()) return { ok: false, error: "self" };

  const since = new Date(now.getTime() - 24 * 3600_000);
  const recent = await prisma.portalLead.count({ where: { sfContactId: user.sfContactId, createdAt: { gte: since } } });
  if (recent >= LEAD_MAX_PER_DAY) {
    console.warn(`[portal] lead: ${maskEmail(user.email)} reached ${LEAD_MAX_PER_DAY} invitations in 24 h`);
    return { ok: false, error: "limit" };
  }
  const open = await prisma.portalLead.findFirst({
    where: { sfContactId: user.sfContactId, email: v.email, status: { in: OPEN_STATUSES }, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (open) return { ok: false, error: "duplicate" };

  const row = await prisma.portalLead.create({
    data: {
      partnerUserId: user.id,
      partnerEmail: user.email,
      partnerName: user.name,
      partnerCompany: user.company,
      partnerPhone: user.phone,
      sfContactId: user.sfContactId,
      sfAccountId: user.sfAccountId,
      anrede: v.anrede,
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phone: v.phone,
      locale: v.locale,
      consentAt: now,
      token: newToken(),
      expiresAt: leadExpiry(now),
      mailsSent: 0,
      testDeployment: isTestMode(),
    },
  });
  const name = customerLabel(row);
  await audit({ action: "lead_invited", actorId: user.id, actorEmail: user.email, target: `${name} · ${maskEmail(row.email)}`, ip: ctx.ip });

  let mailed = false;
  try {
    mailed = await mailInvitation(row, ctx.origin);
    if (mailed) await prisma.portalLead.update({ where: { id: row.id }, data: { mailsSent: 1, lastMailAt: new Date() } });
  } catch (err) {
    console.error(`[portal] lead ${row.id}: invitation mail to ${maskEmail(row.email)} failed`, err);
  }

  // The Case at once, then HYPOTEQ learns of the lead with its link.
  const sfCase = await invitationCase(row);
  const team = leadTeamMail(row, { caseUrl: sfCase.caseUrl, failed: sfCase.failed });
  if (isTestMode()) {
    skipped("Fast Lead team mail", team.subject);
  } else {
    try {
      await sendTeamMail({ to: null, replyTo: user.email, subject: team.subject, lines: team.lines, origin: ctx.origin });
    } catch (err) {
      console.error(`[portal] lead ${row.id}: team mail failed`, err);
    }
  }

  return mailed ? { ok: true, id: row.id, name, email: row.email } : { ok: false, error: "mail" };
}

export type ResendLeadError = "notFound" | "submitted" | "resendLimit" | "tooSoon" | "mail" | "failed";

/**
 * «Erneut senden»: the same link again (a customer who already opened it keeps their funnel),
 * valid LEAD_TTL_DAYS days from now. Only the partner's own invitations (their Contact).
 */
export async function resendLead(user: LeadPartner, leadId: string, ctx: LeadCtx): Promise<{ ok: true; email: string } | { ok: false; error: ResendLeadError }> {
  const now = ctx.now ?? new Date();
  if (!user.sfContactId || !leadId) return { ok: false, error: "notFound" };
  const row = await prisma.portalLead.findFirst({ where: { id: leadId, sfContactId: user.sfContactId } });
  if (!row) return { ok: false, error: "notFound" };
  const check = canResend(row, now);
  if (check === "submitted") return { ok: false, error: "submitted" };
  if (check === "limit") return { ok: false, error: "resendLimit" };
  if (check === "tooSoon") return { ok: false, error: "tooSoon" };

  try {
    if (!(await mailInvitation(row, ctx.origin))) return { ok: false, error: "mail" };
  } catch (err) {
    console.error(`[portal] lead ${row.id}: invitation mail (again) to ${maskEmail(row.email)} failed`, err);
    return { ok: false, error: "mail" };
  }
  await prisma.portalLead.update({
    where: { id: row.id },
    data: { mailsSent: { increment: 1 }, lastMailAt: now, expiresAt: leadExpiry(now) },
  });
  await audit({ action: "lead_resent", actorId: user.id, actorEmail: user.email, target: `${customerLabel(row)} · ${maskEmail(row.email)}`, ip: ctx.ip });
  return { ok: true, email: row.email };
}

export type LeadView = {
  id: string;
  kunde: string;
  email: string;
  status: LeadStatus;
  createdAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  caseNumber: string | null;
  salesforceCaseId: string | null;
  canResend: boolean;
};

/** The invitations of the Contact the session shows (an admin viewing as a partner sees theirs). */
export async function listLeads(contactId: string, now: Date = new Date()): Promise<LeadView[]> {
  const rows = await prisma.portalLead.findMany({ where: { sfContactId: contactId }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({
    id: r.id,
    kunde: customerLabel(r),
    email: r.email,
    status: leadStatus(r, now),
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    submittedAt: r.submittedAt,
    caseNumber: r.caseNumber,
    salesforceCaseId: r.salesforceCaseId,
    canResend: canResend(r, now) === "ok",
  }));
}

// ---- The funnel ------------------------------------------------------------------------------

export type LeadForLink =
  | {
      status: "ok";
      locale: LeadLocale;
      customer: { anrede: LeadAnrede | null; firstName: string; lastName: string; email: string; phone: string | null };
      partner: { name: string; company: string | null; initials: string };
    }
  | { status: "invalid" | "used" | "expired" };

/**
 * What the customer's link opens (GET /api/funnel/lead/[token]): their contact details to prefill
 * and who invited them — never a Salesforce id or the partner's address. The first open marks the
 * invitation «Link geöffnet» for the partner's list.
 */
export async function leadForLink(token: unknown, now: Date = new Date()): Promise<LeadForLink> {
  if (!isLeadToken(token)) return { status: "invalid" };
  const row = await prisma.portalLead.findUnique({ where: { token } });
  if (!row) return { status: "invalid" };
  const status = leadStatus(row, now);
  if (status === "submitted") return { status: "used" };
  if (status === "expired") return { status: "expired" };
  if (row.status === "invited") {
    await prisma.portalLead.updateMany({ where: { id: row.id, status: "invited" }, data: { status: "opened", openedAt: now } });
  }
  const name = (row.partnerName || "").trim() || (row.partnerCompany || "").trim() || "HYPOTEQ Partner";
  const company = (row.partnerCompany || "").trim();
  return {
    status: "ok",
    locale: (["de", "en", "fr", "it"] as const).find((l) => l === row.locale) ?? "de",
    customer: {
      anrede: row.anrede === "Herr" || row.anrede === "Frau" ? row.anrede : null,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
    },
    partner: { name, company: company && company.toLowerCase() !== name.toLowerCase() ? company : null, initials: initialsOf(name) },
  };
}

/**
 * The partner a submit is credited to (components/syncFunnelStepsToSalesforce applyLeadPartnerToCase,
 * the closing mails). Set on the request body by the server only (`partnerLead`).
 */
export type SubmitLeadPartner = {
  leadId: string;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  contactId: string;
  accountId: string | null;
  invitedAt: string;
  /** The Case the invitation created (DECISIONS P40): the submit updates it instead of making one. */
  caseId: string | null;
  /** How the submit found the invitation: its link, or the customer's address without it. */
  via: "link" | "email";
};

/**
 * The invitation behind a submitted token, while it is not used: the partner as they are now
 * (the login's current Contact / Account, else the ones stored at the invitation). The link's
 * expiry does not count here — it only stops the link from opening the funnel; a customer who
 * started in time may finish later.
 */
export async function leadPartnerForSubmit(token: unknown): Promise<SubmitLeadPartner | null> {
  if (!isLeadToken(token)) return null;
  const row = await prisma.portalLead.findUnique({ where: { token } });
  if (!row || !OPEN_STATUSES.includes(row.status) || row.testDeployment !== isTestMode()) return null;
  return submitPartnerOf(row, "link");
}

/**
 * A customer's own request without the link, from an address a partner invited (HYPOTEQ
 * 23.11.2026: «If the client submits through hypoteq.ch with the same email address, should the
 * Case still go to the partner? YES»): the newest open invitation of that address. Like the link,
 * the expiry does not count — the invitation's Case is there either way.
 */
export async function leadPartnerForEmail(email: unknown): Promise<SubmitLeadPartner | null> {
  const address = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!address || !address.includes("@")) return null;
  const row = await prisma.portalLead.findFirst({
    where: { email: address, status: { in: OPEN_STATUSES }, testDeployment: isTestMode() },
    orderBy: { createdAt: "desc" },
  });
  return row ? submitPartnerOf(row, "email") : null;
}

type LeadRow = NonNullable<Awaited<ReturnType<typeof prisma.portalLead.findUnique>>>;

/** The partner as they are now: the login's current Contact / Account, else the invitation's. */
async function submitPartnerOf(row: LeadRow, via: SubmitLeadPartner["via"]): Promise<SubmitLeadPartner> {
  const user = await prisma.portalUser.findUnique({
    where: { id: row.partnerUserId },
    select: { email: true, name: true, company: true, phone: true, sfContactId: true, sfAccountId: true },
  });
  return {
    leadId: row.id,
    email: user?.email || row.partnerEmail,
    name: user?.name ?? row.partnerName,
    company: user?.company ?? row.partnerCompany,
    phone: user?.phone ?? row.partnerPhone,
    contactId: user?.sfContactId || row.sfContactId,
    // The Account belongs to the Contact: a Contact that changed brings its own Account.
    accountId: user?.sfContactId ? user.sfAccountId : row.sfAccountId,
    invitedAt: row.createdAt.toISOString(),
    caseId: row.salesforceCaseId,
    via,
  };
}

/**
 * The partner of an inquiry that came through an invitation, for the Salesforce replay
 * (app/api/admin/replay-salesforce): a sync that failed at the submit keeps its partner.
 */
export async function leadPartnerForInquiry(inquiryId: string): Promise<SubmitLeadPartner | null> {
  const row = await prisma.portalLead.findFirst({ where: { inquiryId, status: "submitted" } });
  return row ? submitPartnerOf(row, "link") : null;
}

/**
 * The invitation is used by this inquiry. The conditional update is the lock: of two submits
 * with the same token, only one gets the partner.
 */
export async function claimLead(leadId: string, inquiryId: string, now: Date = new Date()): Promise<boolean> {
  const { count } = await prisma.portalLead.updateMany({
    where: { id: leadId, status: { in: OPEN_STATUSES } },
    data: { status: "submitted", submittedAt: now, inquiryId },
  });
  return count === 1;
}

/** The case number and the Salesforce Case, for the partner's list. Non-fatal. */
export async function recordLeadCase(leadId: string, data: { caseNumber: string | null; salesforceCaseId: string | null }): Promise<void> {
  try {
    await prisma.portalLead.update({ where: { id: leadId }, data });
  } catch (err) {
    console.error(`[portal] lead ${leadId}: recording the Case failed`, err);
  }
}

/**
 * The reminders after 3 and 7 days (HYPOTEQ 23.11.2026), from the portal's daily cron: an open
 * invitation whose link still works gets the due one (lib/portal/lead.ts reminderDue), counted
 * so it never goes twice. Never throws — the cron's other jobs must run.
 */
export async function sendLeadReminders(origin: string, now: Date = new Date()): Promise<{ checked: number; sent: number }> {
  let checked = 0;
  let sent = 0;
  try {
    const rows = await prisma.portalLead.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        remindersSent: { lt: LEAD_REMINDER_DAYS.length },
        expiresAt: { gt: now },
        createdAt: { lte: new Date(now.getTime() - LEAD_REMINDER_DAYS[0] * 24 * 3600_000) },
        testDeployment: isTestMode(),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    for (const row of rows) {
      checked++;
      const n = reminderDue(row, now);
      if (!n) continue;
      try {
        const mailed = await sendLeadReminderMail({
          to: row.email,
          firstName: row.firstName,
          partner: partnerLabel(row),
          origin,
          url: `${origin}${leadFunnelPath(row.locale, row.token)}`,
          locale: row.locale,
          validUntil: swissDate(row.expiresAt),
          n,
          replyTo: customerReplyTo(row),
        });
        // Counted also when test mode withheld it (an example.com address): it is not retried daily.
        await prisma.portalLead.update({ where: { id: row.id }, data: { remindersSent: { increment: 1 }, lastReminderAt: now } });
        if (mailed) sent++;
      } catch (err) {
        console.error(`[portal] lead ${row.id}: reminder ${n} to ${maskEmail(row.email)} failed`, err);
      }
    }
  } catch (err) {
    console.error("[portal] lead reminders failed", err);
  }
  return { checked, sent };
}
