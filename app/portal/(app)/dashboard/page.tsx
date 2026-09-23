import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import CaseRow from "@/components/portal/CaseRow";
import { Card, FormError, PageHeader, btn, formatLongDate } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { requireUser } from "@/lib/portal/session";
import { CLOSED_STATUSES, matchesFilter, type CaseFilter } from "@/lib/portal/status";

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const who = user.viewingAs ? user.viewingAs.name.split(" · ")[0] : user.name || "";
  const firstName = who.split(" ")[0];
  const today = formatLongDate(new Date(), locale);

  if (!user.contactId) {
    return (
      <>
        <PageHeader eyebrow={today} title={t.dashboard.welcome(firstName)} />
        <Card>
          <p className="m-0 text-white/70">{user.role === "admin" ? t.dashboard.adminNoCases : t.dashboard.noContact}</p>
          {user.role === "admin" ? (
            <Link href="/portal/admin/partner" className={`${btn.primary} h-11 w-fit text-[16px]`}>
              {t.dashboard.toPartners} <ArrowRight size={18} />
            </Link>
          ) : null}
        </Card>
      </>
    );
  }

  const { cases, failed } = await loadMyCases(user, locale);
  const open = cases.filter((c) => !CLOSED_STATUSES.includes(c.status));
  const needsAction = open.filter((c) => matchesFilter("Dokumente fehlen", c.status, c.missingDocs.length));
  const count = (f: CaseFilter) => cases.filter((c) => matchesFilter(f, c.status, c.missingDocs.length)).length;

  const kpis: { label: string; filter: CaseFilter; value: number }[] = [
    { label: t.dashboard.kpiOpen, filter: "Offen", value: open.length },
    { label: t.dashboard.kpiInProgress, filter: "In Bearbeitung", value: count("In Bearbeitung") },
    { label: t.dashboard.kpiDocs, filter: "Dokumente fehlen", value: needsAction.length },
    { label: t.dashboard.kpiLender, filter: "Bei Kreditgeber", value: count("Bei Kreditgeber") },
    { label: t.dashboard.kpiClosed, filter: "Abgeschlossen", value: cases.length - open.length },
  ];

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium uppercase tracking-[.08em] text-white/45">{today}</div>
        <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.dashboard.welcome(firstName)}</h1>
        {!failed ? <p className="m-0 text-[21px] font-medium text-white/70">{t.dashboard.attention(needsAction.length)}</p> : null}
      </div>

      <FormError>{failed ? t.common.casesLoadError : null}</FormError>

      {needsAction.length > 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[#CAF476] p-5 text-[#132219] md:p-7">
          <div className="flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[.08em]">
            <AlertCircle size={18} strokeWidth={2} /> {t.dashboard.actionRequired}
          </div>
          <div className="flex flex-col">
            {needsAction.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-[#132219]/[.12] py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="text-[17px] font-semibold">
                    {c.kunde} <span className="font-normal opacity-70">· {c.nr}</span>
                  </div>
                  <div className="text-[15px] text-[#132219]/70">
                    {c.missingDocs.length ? `${t.dashboard.docsMissing(c.missingDocs.length)}: ${c.missingDocs.join(", ")}` : t.status[c.status]}
                  </div>
                </div>
                <Link
                  href={`/portal/cases/${c.id}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-[#132219] px-[18px] text-[15px] font-medium hover:bg-[#132219]/[.08]"
                >
                  {t.common.openCase} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={`/portal/cases?filter=${encodeURIComponent(k.filter)}`}
            className="flex flex-col gap-1.5 rounded-xl border border-white/[.08] bg-[#1A2E20] p-5 transition-colors hover:bg-white/[.08]"
          >
            <span className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">{k.value}</span>
            <span className="text-[13px] text-white/70">{k.label}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.dashboard.recent}</div>
          <Link href="/portal/cases" className={`${btn.ghost} h-9 text-[16px]`}>
            {t.dashboard.allCases} <ArrowRight size={18} />
          </Link>
        </div>
        <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
          {cases.length ? (
            cases.slice(0, 5).map((c) => <CaseRow key={c.id} c={c} />)
          ) : (
            <div className="py-10 text-[15px] text-white/70">{failed ? "–" : t.dashboard.noCases}</div>
          )}
        </div>
      </div>
    </>
  );
}
