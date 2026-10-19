import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncNotifications } from "@/lib/portal/notifications";
import { isLocale } from "@/lib/portal/i18n/dict";
import { backgroundOrigin } from "@/lib/portal/origin";
import { listPartnerCases } from "@/lib/portal/salesforce";
import { scopeOfPartner } from "@/lib/portal/scope";
import { sendSignatureReminders } from "@/lib/funnel-v3/signatureServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled in vercel.json (daily, because Vercel Hobby allows no more; on Pro switch it to
 * "0 * * * *" for hourly): turn Case changes in Salesforce into partner notifications and
 * e-mails, for partners who are not logged in. Vercel sends `Authorization: Bearer
 * $CRON_SECRET`; without the secret configured the endpoint refuses to run.
 *
 * The same daily run sends the Auskunftsermächtigung reminders of the funnel (Handover 6 / 7.1:
 * after 2 and 5 days; lib/funnel-v3/signatureServer.ts). They run after the partner sync, also
 * when it fails, and never fail it: sendSignatureReminders does not throw. An hourly schedule
 * would not send more — at most one reminder per inquiry and day.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // PORTAL_BASE_URL, else this deployment's own domain (lib/portal/origin.ts).
  const origin = backgroundOrigin();

  let portal: { partners: number; notifications: number; failures: number };
  let signatures: { checked: number; sent: number } = { checked: 0, sent: 0 };
  try {
    portal = await syncPartners(origin);
  } finally {
    signatures = await sendSignatureReminders();
  }
  return NextResponse.json({ ...portal, signatures });
}

async function syncPartners(origin: string) {
  const partners = await prisma.portalUser.findMany({
    where: { status: "active", sfContactId: { not: null } },
    select: { id: true, email: true, name: true, locale: true, sfContactId: true, sfAccountId: true, companyScope: true },
  });

  let notifications = 0;
  const failures: string[] = [];
  for (const p of partners) {
    try {
      const cases = await listPartnerCases(scopeOfPartner(p)!, isLocale(p.locale) ? p.locale : "de");
      notifications += await syncNotifications(p, p.sfContactId!, cases, { origin });
    } catch (err: any) {
      failures.push(p.id);
      console.error(`[portal] cron sync failed for ${p.id}`, err?.message || err);
    }
  }
  return { partners: partners.length, notifications, failures: failures.length };
}
