import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncNotifications } from "@/lib/portal/notifications";
import { listPartnerCases } from "@/lib/portal/salesforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled in vercel.json (daily, because Vercel Hobby allows no more; on Pro switch it to
 * "0 * * * *" for hourly): turn Case changes in Salesforce into partner notifications and
 * e-mails, for partners who are not logged in. Vercel sends `Authorization: Bearer
 * $CRON_SECRET`; without the secret configured the endpoint refuses to run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = (process.env.PORTAL_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.hypoteq.ch").replace(/\/$/, "");

  const partners = await prisma.portalUser.findMany({
    where: { status: "active", sfContactId: { not: null } },
    select: { id: true, email: true, name: true, notifyPrefs: true, locale: true, sfContactId: true },
  });

  let notifications = 0;
  const failures: string[] = [];
  for (const p of partners) {
    try {
      const cases = await listPartnerCases(p.sfContactId!);
      notifications += await syncNotifications(p, p.sfContactId!, cases, { origin });
    } catch (err: any) {
      failures.push(p.id);
      console.error(`[portal] cron sync failed for ${p.id}`, err?.message || err);
    }
  }
  return NextResponse.json({ partners: partners.length, notifications, failures: failures.length });
}
