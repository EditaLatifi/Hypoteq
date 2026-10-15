import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCheck, ChevronRight, Mail } from "lucide-react";
import { markAllReadAction } from "@/app/portal/actions";
import { PageHeader, btn, formatDate } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { notifText } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";

/**
 * Meldungen (handoff): unread ones carry a lime dot; opening one opens its Case, and the Case
 * page marks that Case's notifications read on the server, so it also works without script.
 */
export default async function NotificationsPage() {
  const user = await requireUser();
  if (!user.contactId || user.viewingAs) redirect("/portal/dashboard");
  const { t, locale } = await getDict();

  // Pick up anything that changed in Salesforce since the last visit.
  await loadMyCases(user, locale);
  const rows = await prisma.portalNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = rows.some((r) => !r.readAt);

  return (
    <>
      <PageHeader eyebrow={t.notifications.eyebrow} title={t.notifications.title}>
        <div className="flex flex-wrap gap-1">
          <Link href="/portal/meldungen/vorschau" className={`${btn.ghost} h-11 rounded-full px-2 text-[16px] min-[900px]:h-9`}>
            <Mail size={18} aria-hidden /> {t.mailPreview.open}
          </Link>
          {unread ? (
            <form action={markAllReadAction}>
              <button type="submit" className={`${btn.ghost} h-11 rounded-full px-2 text-[16px] min-[900px]:h-9`}>
                <CheckCheck size={18} aria-hidden /> {t.notifications.markAll}
              </button>
            </form>
          ) : null}
        </div>
      </PageHeader>
      <ul className="m-0 list-none rounded-xl border border-white/[.08] bg-[#1A2E20] px-5 py-0">
        {rows.map((n) => {
          const { title, text } = notifText(t, n);
          return (
            <li key={n.id} className="border-b border-white/[.14] last:border-b-0">
              <Link href={`/portal/cases/${n.caseId}`} className="flex items-start gap-4 py-4 transition-colors duration-200 ease-out hover:bg-white/[.03]">
                <span aria-hidden className={`mt-[7px] h-2 w-2 flex-none rounded-full ${n.readAt ? "bg-transparent" : "bg-[#CAF476]"}`} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <span className={`text-[17px] ${n.readAt ? "font-normal" : "font-semibold"}`}>
                      {title}
                      {!n.readAt ? <span className="sr-only"> · {t.shell.unreadMark}</span> : null}
                    </span>
                    <span className="text-[13px] text-white/70">{formatDate(n.createdAt)}</span>
                  </div>
                  <span className="text-[15px] text-white/70">{text}</span>
                </div>
                <ChevronRight size={20} aria-hidden className="mt-0.5 flex-none text-[#CAF476]" />
              </Link>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="py-10 text-[15px] text-white/70">{t.notifications.none}</li> : null}
      </ul>
    </>
  );
}
