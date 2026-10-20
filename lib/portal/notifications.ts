import { prisma } from "@/lib/prisma";
import { statusMailsOn } from "@/lib/portal/config";
import type { CaseMail, Dict } from "@/lib/portal/i18n/dict";
import { sendNotificationMail } from "@/lib/portal/mail";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";
import { currentStatus, isRelabel, type CaseStatus } from "@/lib/portal/status";

/**
 * Case notifications.
 *
 * Salesforce does not tell us when a Case changes, so the portal keeps the last state it
 * saw per Case (PortalCaseSeen) and turns differences into notifications («Meldungen»).
 * This runs when a partner opens the portal and on the cron (/api/portal/cron).
 * Notifications store a variant, not text, and are worded in the reader's language.
 *
 * There is no opt-out (HYPOTEQ 19.10.2026 E.2): HYPOTEQ decides per partner company, with
 * Account.Send_Notification__c. The mails carry HYPOTEQ's texts (Mail-Texte 20.10.2026
 * M6–M13, lib/portal/mail.ts). They still go out only with PORTAL_STATUS_MAILS=on, so nobody
 * gets the portal's mail and a Salesforce flow's as well (B24, F.1, DECISIONS P32).
 */

export type NotifyKind = "new_case" | "docs" | "status" | "lender";
export type NotifyVariant = keyof Dict["notif"];

/** The statuses D.3 marks «Auto-Mail an Partner: ja»; mailTemplateFor mails exactly these (tested). */
export const MAIL_STATUSES: CaseStatus[] = [
  "Anfrage eingegangen",
  "Unterlagen fehlen noch",
  "Bei der Bank in Prüfung",
  "Angebot liegt vor",
  "Kleine Nacharbeit nötig",
  "Finanzierung bestätigt",
  "Abgeschlossen",
  "Leider abgelehnt",
];

/**
 * Which of HYPOTEQ's mails M6–M13 a notification sends (with PORTAL_STATUS_MAILS on), or null:
 * a Case newly assigned is M6 like the status «Anfrage eingegangen», more missing documents
 * M7 (M10 under «Kleine Nacharbeit nötig»), a status change only to a D.3 «ja» status.
 */
export function mailTemplateFor(n: { kind: NotifyKind; variant: string; status: string }): CaseMail | null {
  if (n.kind === "new_case") return "received";
  switch (n.variant) {
    case "docs":
      return "missing";
    case "rework":
      return "rework";
    case "lender_sent":
      return "lender";
    case "lender_answer":
      return "offer";
    case "confirmed":
      return "confirmed";
    case "closed":
      return "closed";
    case "declined":
      return "declined";
  }
  return currentStatus(n.status) === "Anfrage eingegangen" ? "received" : null;
}

/** What kind of change a move to this status is, and how it is worded. */
export function variantFor(status: string): { kind: NotifyKind; variant: NotifyVariant } {
  switch (currentStatus(status)) {
    case "Unterlagen fehlen noch":
      return { kind: "docs", variant: "docs" };
    case "Kleine Nacharbeit nötig":
      return { kind: "docs", variant: "rework" };
    case "Bei der Bank in Prüfung":
      return { kind: "lender", variant: "lender_sent" };
    case "Angebot liegt vor":
      return { kind: "lender", variant: "lender_answer" };
    case "Finanzierung bestätigt":
      return { kind: "lender", variant: "confirmed" };
    case "Abgeschlossen":
      return { kind: "status", variant: "closed" };
    case "Leider abgelehnt":
      return { kind: "status", variant: "declined" };
    case "Anfrage zurückgezogen":
      return { kind: "status", variant: "cancelled" };
    default:
      return { kind: "status", variant: "status" };
  }
}

/**
 * What a Case change is worth telling the partner: a new status (unless it only renames the
 * old one, lib/portal/status.ts isRelabel), else more documents missing than before.
 */
export function changeNotice(
  prev: { status: string; missingCount: number } | undefined,
  c: { status: string; missingCount: number },
  firstSync: boolean
): { kind: NotifyKind; variant: NotifyVariant } | null {
  if (!prev) return firstSync ? null : { kind: "new_case", variant: "new_case" };
  if (prev.status !== c.status && !isRelabel(prev.status, c.status)) return variantFor(c.status);
  if (c.missingCount > prev.missingCount) return { kind: "docs", variant: c.status === "Kleine Nacharbeit nötig" ? "rework" : "docs" };
  return null;
}

export function notifText(t: Dict, n: { variant: string; caseNr: string; kunde: string; status: string | null }): { title: string; text: string } {
  const v = (t.notif as Record<string, { title: (k: string) => string; text: (nr: string, k: string, s: string) => string }>)[n.variant] || t.notif.status;
  const status = n.status ? t.status[n.status] || n.status : "";
  return { title: v.title(n.kunde), text: v.text(n.caseNr, n.kunde, status) };
}

export type NotifyMail = {
  origin: string;
  /** Account.Send_Notification__c of the partner company; null = not readable or not in the org. */
  accountNotify?: (accountId: string | null) => Promise<boolean | null>;
};

async function accountNotify(accountId: string | null): Promise<boolean | null> {
  const { accountPortalFlags } = await import("@/lib/portal/salesforce");
  return (await accountPortalFlags(accountId)).notify;
}

export async function syncNotifications(
  user: { id: string; email: string; name: string | null; locale: string | null; sfAccountId: string | null },
  contactId: string,
  cases: PortalCaseSummary[],
  mail: NotifyMail | null
): Promise<number> {
  const seen = await prisma.portalCaseSeen.findMany({ where: { contactId } });
  const byId = new Map(seen.map((s) => [s.caseId, s]));
  // The very first sync only records what exists: a partner must not get a notification
  // for every Case they already had on the day they were invited.
  const firstSync = seen.length === 0;

  const created: { kind: NotifyKind; variant: NotifyVariant; c: PortalCaseSummary }[] = [];
  for (const c of cases) {
    const prev = byId.get(c.id);
    const missingCount = c.missingDocs.length;

    const notice = changeNotice(prev, { status: c.status, missingCount }, firstSync);
    if (notice) created.push({ ...notice, c });

    if (!prev || prev.status !== c.status || prev.missingCount !== missingCount) {
      await prisma.portalCaseSeen.upsert({
        where: { contactId_caseId: { contactId, caseId: c.id } },
        create: { contactId, caseId: c.id, status: c.status, missingCount },
        update: { status: c.status, missingCount },
      });
    }
  }
  if (!created.length) return 0;

  // E-mail only when switched on, and never to a company HYPOTEQ has unticked.
  const toMail = (n: (typeof created)[number]) => mailTemplateFor({ kind: n.kind, variant: n.variant, status: n.c.status });
  let mailing = !!mail && statusMailsOn() && created.some(toMail);
  if (mailing && (await (mail!.accountNotify ?? accountNotify)(user.sfAccountId)) === false) mailing = false;

  // One event, one mail: never two for the same Case in one sync (HYPOTEQ Mail-Texte 20.10.2026).
  const mailed = new Set<string>();
  for (const n of created) {
    const row = await prisma.portalNotification.create({
      data: { userId: user.id, caseId: n.c.id, caseNr: n.c.nr, kunde: n.c.kunde, kind: n.kind, variant: n.variant, status: n.c.status },
    });
    const template = mailing ? toMail(n) : null;
    if (!mail || !template || mailed.has(n.c.id)) continue;
    mailed.add(n.c.id);
    try {
      await sendNotificationMail({
        to: user.email,
        name: user.name,
        origin: mail.origin,
        caseId: n.c.id,
        kunde: n.c.kunde,
        caseNr: n.c.nr,
        mail: template,
        missing: n.c.missingDocs.length,
        locale: user.locale,
      });
      await prisma.portalNotification.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
    } catch (err) {
      console.error("[portal] notification mail failed", err);
    }
  }
  return created.length;
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.portalNotification.count({ where: { userId, readAt: null } });
}
