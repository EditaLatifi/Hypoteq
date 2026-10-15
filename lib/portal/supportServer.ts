import pkg from "@/package.json";
import { isTestMode, skipped } from "@/components/testMode";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { support, type SupportDict } from "@/lib/portal/i18n/special";
import { sendTeamMail } from "@/lib/portal/mail";
import { ticketRef, validateSupport, type SupportError, type SupportInput, type TechInfo } from "@/lib/portal/support";

/**
 * Support & Feedback on the server (DECISIONS P18 / P19). A ticket is stored, mailed to
 * the partner-support address and audited; HYPOTEQ sets its status in /portal/admin/support.
 * Nothing goes to Salesforce.
 */

/** Where tickets go, and the address the contact box shows. Never hard-coded (P4). */
export function supportEmail(): string {
  return process.env.PORTAL_SUPPORT_EMAIL || process.env.PORTAL_TEAM_EMAIL || process.env.SMTP_TO || "info@hypoteq.ch";
}

export type SupportContact = { name: string; role: string; initials: string; phone: string; email: string; hours: string };

/** «Ihr Ansprechpartner». The prototype's person is demo data; the defaults name the team. */
export function supportContact(t: SupportDict): SupportContact {
  const name = (process.env.PORTAL_SUPPORT_CONTACT_NAME || "Partner Management").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    name,
    role: process.env.PORTAL_SUPPORT_CONTACT_ROLE || t.contactRole,
    initials: ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "H",
    phone: process.env.PORTAL_SUPPORT_PHONE || "+41 44 554 41 00",
    email: supportEmail(),
    hours: process.env.PORTAL_SUPPORT_HOURS || t.hours,
  };
}

/** «App-Version» of the technical details: package version, plus the commit on Vercel. */
export function appVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return `${pkg.version}${sha ? ` · ${sha.slice(0, 7)}` : ""}`;
}

export function techLines(tech: TechInfo | null): string[] {
  if (!tech) return [];
  return [
    "Technische Angaben:",
    `Browser: ${tech.browser || "–"}`,
    `Fenster: ${tech.viewport || "–"}`,
    `Seite: ${tech.page || "–"}`,
    `App-Version: ${tech.appVersion || "–"}`,
  ];
}

export type SupportUser = { id: string; email: string; name: string | null; company: string | null };

/** The mail to partner support (German, like every team mail). */
export function supportMail(p: {
  ref: string;
  user: SupportUser;
  input: SupportInput;
  caseLine: string | null;
  tech: TechInfo | null;
}): { subject: string; lines: string[] } {
  const type = support.de.types[p.input.type];
  const who = `${p.user.name || p.user.email}${p.user.company ? ` (${p.user.company})` : ""}`;
  return {
    subject: `Partnerportal-Support: ${type} ${p.ref} – ${p.input.subject}`.slice(0, 250),
    lines: [
      `${who} hat eine Support-Meldung erfasst (${p.ref}).`,
      `Typ: ${type}`,
      ...(p.caseLine ? [p.caseLine] : []),
      `Betreff: ${p.input.subject}`,
      `Beschreibung:\n${p.input.body}`,
      ...(p.tech ? [techLines(p.tech).join("\n")] : []),
      `Antwort bitte direkt an ${p.user.email}. Den Status setzen Sie im Portal unter Administration › Support.`,
    ],
  };
}

/** Result of checking the optional Case reference against the partner's own Cases. */
export type CaseCheck = { nr: string; kunde: string } | null | "unavailable";

export async function createSupportTicket(
  user: SupportUser,
  raw: unknown,
  ctx: { origin: string; ip: string | null; verifyCase: (caseId: string) => Promise<CaseCheck> }
): Promise<{ ok: true; ref: string } | { ok: false; error: SupportError }> {
  const v = validateSupport(raw);
  if (!v.ok) return v;
  const input = v.value;

  // The Case must be one of the partner's. When Salesforce cannot say, the ticket still
  // goes out — support is needed most when something is down — but without the link.
  let caseId: string | null = null;
  let caseLine: string | null = null;
  if (input.caseId) {
    const c = await ctx.verifyCase(input.caseId);
    if (c === "unavailable") {
      caseLine = `Case: ${input.caseId} (nicht geprüft, Salesforce war nicht erreichbar)`;
    } else if (!c) {
      return { ok: false, error: "case" };
    } else {
      caseId = input.caseId;
      caseLine = `Case: ${c.nr} · ${c.kunde}`;
    }
  }
  const tech = input.tech ? { ...input.tech, appVersion: appVersion() } : null;

  let id: string;
  try {
    const row = await prisma.portalSupportTicket.create({
      data: { userId: user.id, type: input.type, caseId, subject: input.subject, body: input.body, techInfo: tech ?? undefined, status: "eingegangen" },
      select: { id: true },
    });
    id = row.id;
  } catch (err) {
    console.error("[portal] storing the support ticket failed", err);
    return { ok: false, error: "failed" };
  }
  const ref = ticketRef(id);

  const mail = supportMail({ ref, user, input, caseLine, tech });
  if (isTestMode()) {
    skipped("support mail", mail.subject);
  } else {
    try {
      await sendTeamMail({ to: supportEmail(), subject: mail.subject, lines: mail.lines, origin: ctx.origin, link: `${ctx.origin}/portal/admin/support` });
    } catch (err) {
      // Stored all the same: the ticket is in the admin list.
      console.error("[portal] support mail failed", err);
    }
  }
  await audit({ action: "support_ticket_created", actorId: user.id, actorEmail: user.email, target: `${ref} · ${support.de.types[input.type]}`, ip: ctx.ip });
  return { ok: true, ref };
}
