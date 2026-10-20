import pkg from "@/package.json";
import { isTestMode, skipped } from "@/components/testMode";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { support, type SupportDict } from "@/lib/portal/i18n/special";
import { teamAddress } from "@/lib/portal/config";
import { defaultConnection, type SfConnection } from "@/lib/portal/changeRequests";
import { sendTeamMail } from "@/lib/portal/mail";
import { createPortalMeldung, type MeldungInput } from "@/lib/portal/meldung";
import { ticketRef, validateSupport, type SupportError, type SupportInput, type TechInfo } from "@/lib/portal/support";

/**
 * Support & Feedback on the server (HYPOTEQ 19.10.2026 C, DECISIONS P18 / P19). A ticket is
 * stored, then two things happen in parallel: a mail to info@hypoteq.ch and a Portal_Meldung__c
 * in Salesforce, which HYPOTEQ's Flow turns into an open Task for Fisnik Salihu (20.10.2026: the
 * integration user's licence cannot create Tasks). Either may fail without the other; the
 * ticket stays. HYPOTEQ sets its status in /portal/admin/support.
 */

/** Where tickets go, and the address the contact box shows: info@hypoteq.ch (B20 / C), unless configured. */
export function supportEmail(): string {
  return (process.env.PORTAL_SUPPORT_EMAIL || "").trim() || teamAddress();
}

export type SupportContact = { name: string; role: string; initials: string; phone: string; email: string; hours: string };

/**
 * «Ihr Ansprechpartner» (B20): Partner Management, HYPOTEQ AG · +41 44 554 41 00 · «Telefonisch
 * Mo–Fr, 09:30–16:30 · Meldungen rund um die Uhr (24/7)» — no response-time promise. The
 * prototype's person is demo data.
 */
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

export type SupportUser = { id: string; email: string; name: string | null; company: string | null; sfAccountId?: string | null };

/** The Case a ticket names, once checked against the partner's Cases. */
export type LinkedCase = { id: string; nr: string; kunde: string } | null;

type TicketParts = {
  ref: string;
  user: SupportUser;
  input: SupportInput;
  caseLine: string | null;
  linked?: LinkedCase;
  tech: TechInfo | null;
};

function partnerLine(user: SupportUser): string {
  return `${user.name || user.email}${user.company ? ` (${user.company})` : ""}`;
}

/** The mail to partner support (German, like every team mail): «Portal-Support · {Typ} · {Betreff}». */
export function supportMail(p: TicketParts): { subject: string; lines: string[] } {
  const type = support.de.types[p.input.type];
  return {
    subject: `Portal-Support · ${type} · ${p.input.subject}${p.linked ? ` · Case ${p.linked.nr}` : ""}`.slice(0, 250),
    lines: [
      `${partnerLine(p.user)} hat eine Support-Meldung erfasst (${p.ref}).`,
      `Typ: ${type}`,
      ...(p.caseLine ? [p.caseLine] : []),
      `Betreff: ${p.input.subject}`,
      `Beschreibung:\n${p.input.body}`,
      ...(p.tech ? [techLines(p.tech).join("\n")] : []),
      `«Antworten» geht direkt an ${p.user.email}. Den Status setzen Sie im Portal unter Administration › Support.`,
    ],
  };
}

/**
 * The Portal_Meldung__c of the ticket (HYPOTEQ 20.10.2026; lib/portal/meldung.ts): Typ = Frage /
 * Fehler / Wunsch, Betreff «Portal-Support: {Betreff}», the Case when one is linked. HYPOTEQ's
 * Flow turns it into the open Task (High) for Fisnik Salihu.
 */
export function supportMeldung(p: TicketParts): MeldungInput {
  const beschreibung = [
    p.input.body,
    "",
    `Partner: ${partnerLine(p.user)} · ${p.user.email}`,
    `Typ: ${support.de.types[p.input.type]}`,
    `Meldung: ${p.ref} (Status im Partnerportal unter Administration › Support)`,
    ...(p.caseLine ? [p.caseLine] : []),
  ].join("\n");
  return {
    typ: p.input.type,
    betreff: `Portal-Support: ${p.input.subject}`,
    beschreibung,
    technischeAngaben: p.tech ? techLines(p.tech).join("\n") : null,
    partnerEmail: p.user.email,
    partnerAccountId: p.user.sfAccountId ?? null,
    caseId: p.linked?.id ?? null,
  };
}

/** Result of checking the optional Case reference against the partner's own Cases. */
export type CaseCheck = { nr: string; kunde: string } | null | "unavailable";

export async function createSupportTicket(
  user: SupportUser,
  raw: unknown,
  ctx: { origin: string; ip: string | null; verifyCase: (caseId: string) => Promise<CaseCheck>; sf?: SfConnection }
): Promise<{ ok: true; ref: string } | { ok: false; error: SupportError }> {
  const v = validateSupport(raw);
  if (!v.ok) return v;
  const input = v.value;

  // The Case must be one of the partner's. When Salesforce cannot say, the ticket still
  // goes out — support is needed most when something is down — but without the link.
  let caseId: string | null = null;
  let caseLine: string | null = null;
  let linked: LinkedCase = null;
  if (input.caseId) {
    const c = await ctx.verifyCase(input.caseId);
    if (c === "unavailable") {
      caseLine = `Case: ${input.caseId} (nicht geprüft, Salesforce war nicht erreichbar)`;
    } else if (!c) {
      return { ok: false, error: "case" };
    } else {
      caseId = input.caseId;
      caseLine = `Case: ${c.nr} · ${c.kunde}`;
      linked = { id: input.caseId, nr: c.nr, kunde: c.kunde };
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
  const parts: TicketParts = { ref, user, input, caseLine, linked, tech };

  const mail = supportMail(parts);
  if (isTestMode()) {
    skipped("support mail and Portal_Meldung__c", mail.subject);
  } else {
    // Mail and Meldung in parallel; the ticket is kept whatever happens to either.
    const mailed = sendTeamMail({
      to: supportEmail(),
      replyTo: user.email,
      subject: mail.subject,
      lines: mail.lines,
      origin: ctx.origin,
      link: `${ctx.origin}/portal/admin/support`,
    }).catch((err) => console.error("[portal] support mail failed", err));
    const task = createPortalMeldung(ctx.sf ?? defaultConnection(), supportMeldung(parts)).then(async (t) => {
      if (!t.id) {
        console.error(`[portal] support Portal_Meldung for ${ref} failed`, t.error);
        return;
      }
      await prisma.portalSupportTicket.update({ where: { id }, data: { sfId: t.id } }).catch((err) => console.error("[portal] could not store the Portal_Meldung id", err));
    });
    await Promise.all([mailed, task]);
  }
  await audit({ action: "support_ticket_created", actorId: user.id, actorEmail: user.email, target: `${ref} · ${support.de.types[input.type]}`, ip: ctx.ip });
  return { ok: true, ref };
}
