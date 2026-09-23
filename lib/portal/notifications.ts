import { prisma } from "@/lib/prisma";
import { DICTS, isLocale, type Dict } from "@/lib/portal/i18n/dict";
import { sendNotificationMail } from "@/lib/portal/mail";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";

/**
 * Case notifications.
 *
 * Salesforce does not tell us when a Case changes, so the portal keeps the last state it
 * saw per Case (PortalCaseState) and turns differences into notifications. This runs when
 * a partner opens the portal and on the cron (/api/portal/cron), so a partner who never
 * logs in still gets the e-mail. Notifications store a variant, not text, and are worded
 * in the reader's language when shown or mailed.
 */

export type NotifyKind = "new_case" | "docs" | "status" | "lender";
export type NotifyVariant = keyof Dict["notif"];

export const NOTIFY_KINDS: NotifyKind[] = ["new_case", "docs", "status", "lender"];

export function notifyPrefs(raw: unknown): Record<NotifyKind, boolean> {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    new_case: p.new_case !== false,
    docs: p.docs !== false,
    status: p.status !== false,
    lender: p.lender !== false,
  };
}

function variantFor(status: string): { kind: NotifyKind; variant: NotifyVariant } {
  switch (status) {
    case "Dokumente ausstehend":
      return { kind: "docs", variant: "docs" };
    case "Bei Kreditgeber":
      return { kind: "lender", variant: "lender_sent" };
    case "Rückmeldung erhalten":
      return { kind: "lender", variant: "lender_answer" };
    case "Abgeschlossen":
      return { kind: "status", variant: "closed" };
    case "Nicht weiterverfolgt":
      return { kind: "status", variant: "lost" };
    default:
      return { kind: "status", variant: "status" };
  }
}

export function notifText(t: Dict, n: { variant: string; caseNr: string; kunde: string; status: string | null }): { title: string; text: string } {
  const v = (t.notif as Record<string, { title: (k: string) => string; text: (nr: string, k: string, s: string) => string }>)[n.variant] || t.notif.status;
  const status = n.status ? t.status[n.status] || n.status : "";
  return { title: v.title(n.kunde), text: v.text(n.caseNr, n.kunde, status) };
}

export async function syncNotifications(
  user: { id: string; email: string; name: string | null; notifyPrefs: unknown; locale: string | null },
  contactId: string,
  cases: PortalCaseSummary[],
  mail: { origin: string } | null
): Promise<number> {
  const states = await prisma.portalCaseState.findMany({ where: { caseId: { in: cases.map((c) => c.id) } } });
  const byId = new Map(states.map((s) => [s.caseId, s]));
  // The very first sync only records what exists: a partner must not get a notification
  // for every Case they already had on the day they were invited.
  const firstSync = (await prisma.portalCaseState.count({ where: { contactId } })) === 0;

  const created: { kind: NotifyKind; variant: NotifyVariant; c: PortalCaseSummary }[] = [];
  for (const c of cases) {
    const prev = byId.get(c.id);
    const missingCount = c.missingDocs.length;

    if (!prev || prev.contactId !== contactId) {
      if (!firstSync) created.push({ kind: "new_case", variant: "new_case", c });
    } else if (prev.status !== c.status) {
      created.push({ ...variantFor(c.status), c });
    } else if (missingCount > prev.missingCount) {
      created.push({ kind: "docs", variant: "docs", c });
    }

    if (!prev || prev.status !== c.status || prev.missingCount !== missingCount || prev.contactId !== contactId) {
      await prisma.portalCaseState.upsert({
        where: { caseId: c.id },
        create: { caseId: c.id, contactId, status: c.status, missingCount },
        update: { contactId, status: c.status, missingCount },
      });
    }
  }
  if (!created.length) return 0;

  const prefs = notifyPrefs(user.notifyPrefs);
  const t = DICTS[isLocale(user.locale) ? user.locale : "de"];
  for (const n of created) {
    const row = await prisma.portalNotification.create({
      data: { userId: user.id, caseId: n.c.id, caseNr: n.c.nr, kunde: n.c.kunde, kind: n.kind, variant: n.variant, status: n.c.status },
    });
    if (!mail || !prefs[n.kind]) continue;
    const { title, text } = notifText(t, row);
    try {
      await sendNotificationMail({ to: user.email, name: user.name, origin: mail.origin, caseId: n.c.id, kunde: n.c.kunde, caseNr: n.c.nr, title, text, locale: user.locale });
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
