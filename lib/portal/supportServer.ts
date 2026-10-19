import pkg from "@/package.json";
import { isTestMode, skipped } from "@/components/testMode";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { support, type SupportDict } from "@/lib/portal/i18n/special";
import { teamAddress } from "@/lib/portal/config";
import { defaultConnection, type SfConnection } from "@/lib/portal/changeRequests";
import { sendTeamMail } from "@/lib/portal/mail";
import { ticketRef, validateSupport, type SupportError, type SupportInput, type TechInfo } from "@/lib/portal/support";

/**
 * Support & Feedback on the server (HYPOTEQ 19.10.2026 C, DECISIONS P18 / P19). A ticket is
 * stored, then two things happen in parallel: a mail to info@hypoteq.ch and an open Task in
 * Salesforce for Fisnik Salihu, created by the integration user. Either may fail without the
 * other; the ticket stays. HYPOTEQ sets its status in /portal/admin/support.
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

export type SupportUser = { id: string; email: string; name: string | null; company: string | null };

/** Owner of the support Tasks: Fisnik Salihu (C). PORTAL_SUPPORT_TASK_OWNER_ID overrides it. */
export const SUPPORT_TASK_OWNER_DEFAULT = "005TG000004Ogi9YAC";

export function supportTaskOwner(): string {
  return (process.env.PORTAL_SUPPORT_TASK_OWNER_ID || "").trim() || SUPPORT_TASK_OWNER_DEFAULT;
}

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

/** The open Task: «Portal-Support: {Betreff}», for Fisnik Salihu, on the Case when one is linked. */
export function supportTask(p: TicketParts): Record<string, unknown> {
  const description = [
    p.input.body,
    "",
    `Partner: ${partnerLine(p.user)} · ${p.user.email}`,
    `Typ: ${support.de.types[p.input.type]}`,
    `Meldung: ${p.ref} (Status im Partnerportal unter Administration › Support)`,
    ...(p.caseLine ? [p.caseLine] : []),
    ...(p.tech ? ["", ...techLines(p.tech)] : []),
  ].join("\n");
  return {
    Subject: `Portal-Support: ${p.input.subject}`.slice(0, 255),
    Description: description.slice(0, 32000),
    OwnerId: supportTaskOwner(),
    Status: "Open",
    ...(p.linked ? { WhatId: p.linked.id } : {}),
  };
}

function errorText(err: any): string {
  if (Array.isArray(err?.errors) && err.errors.length) return err.errors.map((e: any) => e?.message || String(e)).join("; ");
  return err?.data?.message || err?.message || String(err);
}

/**
 * Create the support Task. Never throws. Should the org refuse the agreed values it tries
 * again without Status «Open» (Task.Status is a restricted picklist; the org's default open
 * status then applies), then also without the owner (the Task stays with the integration
 * user). The description names the Case either way.
 */
export async function createSupportTask(sf: SfConnection, record: Record<string, unknown>): Promise<{ id: string | null; error: string | null }> {
  const attempt = async (r: Record<string, unknown>): Promise<string> => {
    const res = await sf.sobject("Task").create(r);
    const out = Array.isArray(res) ? res[0] : res;
    if (!out?.id || out?.success === false) throw out;
    return String(out.id);
  };
  const withoutStatus = { ...record };
  delete withoutStatus.Status;
  const withoutOwner = { ...withoutStatus };
  delete withoutOwner.OwnerId;
  const tries = [record, withoutStatus, withoutOwner];
  let last: unknown = null;
  for (let i = 0; i < tries.length; i++) {
    try {
      return { id: await attempt(tries[i]), error: null };
    } catch (err) {
      last = err;
      if (i < tries.length - 1) console.warn("[portal] support Task refused, retrying with less", errorText(err));
    }
  }
  return { id: null, error: errorText(last) };
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
    skipped("support mail and Salesforce Task", mail.subject);
  } else {
    // Mail and Task in parallel; the ticket is kept whatever happens to either.
    const mailed = sendTeamMail({
      to: supportEmail(),
      replyTo: user.email,
      subject: mail.subject,
      lines: mail.lines,
      origin: ctx.origin,
      link: `${ctx.origin}/portal/admin/support`,
    }).catch((err) => console.error("[portal] support mail failed", err));
    const task = createSupportTask(ctx.sf ?? defaultConnection(), supportTask(parts)).then(async (t) => {
      if (!t.id) {
        console.error(`[portal] support Task for ${ref} failed`, t.error);
        return;
      }
      await prisma.portalSupportTicket.update({ where: { id }, data: { sfId: t.id } }).catch((err) => console.error("[portal] could not store the support Task id", err));
    });
    await Promise.all([mailed, task]);
  }
  await audit({ action: "support_ticket_created", actorId: user.id, actorEmail: user.email, target: `${ref} · ${support.de.types[input.type]}`, ip: ctx.ip });
  return { ok: true, ref };
}
