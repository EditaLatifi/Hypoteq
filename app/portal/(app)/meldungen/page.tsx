import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCheck, ChevronRight } from "lucide-react";
import { markAllReadAction } from "@/app/portal/actions";
import { PageHeader, btn, formatDate } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { notifText } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";

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
        {unread ? (
          <form action={markAllReadAction}>
            <button type="submit" className={`${btn.ghost} h-9 text-[16px]`}>
              <CheckCheck size={18} /> {t.notifications.markAll}
            </button>
          </form>
        ) : null}
      </PageHeader>
      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {rows.map((n) => {
          const { title, text } = notifText(t, n);
          return (
            <Link
              key={n.id}
              href={`/portal/cases/${n.caseId}`}
              className="flex items-start gap-4 border-b border-white/[.14] py-4 last:border-b-0 hover:bg-white/[.03]"
            >
              <span className={`mt-[7px] h-2 w-2 flex-none rounded-full ${n.readAt ? "bg-transparent" : "bg-[#CAF476]"}`} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap justify-between gap-3">
                  <span className={`text-[17px] ${n.readAt ? "font-normal" : "font-semibold"}`}>{title}</span>
                  <span className="text-[13px] text-white/70">{formatDate(n.createdAt)}</span>
                </div>
                <span className="text-[15px] text-white/70">{text}</span>
              </div>
              <ChevronRight size={20} className="mt-0.5 flex-none text-[#CAF476]" />
            </Link>
          );
        })}
        {rows.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.notifications.none}</div> : null}
      </div>
    </>
  );
}
