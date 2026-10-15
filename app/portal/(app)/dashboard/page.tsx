import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, BadgeCheck, Calculator, ExternalLink, FileCheck, GraduationCap, House, LifeBuoy, Timer, TrendingUp } from "lucide-react";
import CaseRow from "@/components/portal/CaseRow";
import { Card, FormError, PageHeader, ProgressBar, btn, formatLongDate } from "@/components/portal/ui";
import { PORTAL_TOOLS } from "@/lib/portal/config";
import type { Dict } from "@/lib/portal/i18n/dict";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { chf, chfShort, percent, portfolio } from "@/lib/portal/portfolio";
import { requireUser } from "@/lib/portal/session";
import { isClosedStatus, matchesFilter, type CaseFilter } from "@/lib/portal/status";
import { docChips, docProgress } from "@/lib/portal/view";

const EYEBROW_LIME = "text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]";
const TILE = "rounded-xl border border-white/[.08] bg-[#1A2E20] p-5";

/** Tools & Ressourcen: the two external tools (new tab) and Support. */
function Resources({ t, partner }: { t: Dict; partner: boolean }) {
  const tools: { href: string; external: boolean; icon: ReactNode; title: string; text: string }[] = [
    { href: PORTAL_TOOLS.valuation, external: true, icon: <House size={24} />, title: t.shell.tools.valuation, text: t.shell.tools.valuationText },
    { href: PORTAL_TOOLS.academy, external: true, icon: <GraduationCap size={24} />, title: t.shell.tools.academy, text: t.shell.tools.academyText },
    ...(partner ? [{ href: "/portal/support", external: false, icon: <LifeBuoy size={24} />, title: t.shell.tools.support, text: t.shell.tools.supportText }] : []),
  ];
  const cls = `${TILE} flex items-start gap-3.5 text-white transition-colors duration-200 ease-out hover:bg-white/[.08]`;
  const body = (x: (typeof tools)[number]) => (
    <>
      <span aria-hidden className="flex-none text-[#CAF476]">
        {x.icon}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-[17px] font-medium">{x.title}</span>
        <span className="text-[15px] text-white/70">{x.text}</span>
      </span>
      {x.external ? <ExternalLink size={16} aria-hidden className="mt-1 flex-none text-[#CAF476]" /> : <ArrowRight size={16} aria-hidden className="mt-1 flex-none text-[#CAF476]" />}
      {x.external ? <span className="sr-only">{t.shell.tools.newTab}</span> : null}
    </>
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="dash-tools">
      <h2 id="dash-tools" className={`m-0 ${EYEBROW_LIME}`}>
        {t.shell.tools.resources}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">
        {tools.map((x) =>
          x.external ? (
            <a key={x.href} href={x.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {body(x)}
            </a>
          ) : (
            <Link key={x.href} href={x.href} className={cls}>
              {body(x)}
            </Link>
          )
        )}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const who = user.viewingAs ? user.viewingAs.name.split(" · ")[0] : user.name || "";
  const firstName = who.split(" ")[0];
  const today = formatLongDate(new Date(), locale);
  const partner = user.role !== "admin" && !user.viewingAs;

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
        <Resources t={t} partner={partner} />
      </>
    );
  }

  const { cases, failed } = await loadMyCases(user, locale);
  const open = cases.filter((c) => !isClosedStatus(c.status));
  const action = cases.filter((c) => c.actionRequired);
  const count = (f: CaseFilter) => cases.filter((c) => matchesFilter(f, c.status, c.needDocs.length)).length;
  const kpis: { label: string; filter: CaseFilter }[] = [
    { label: t.dashboard.kpiOpen, filter: "Offen" },
    { label: t.dashboard.kpiInProgress, filter: "In Bearbeitung" },
    { label: t.dashboard.kpiDocs, filter: "Dokumente fehlen" },
    { label: t.dashboard.kpiLender, filter: "Bei Kreditgeber" },
    { label: t.dashboard.kpiClosed, filter: "Abgeschlossen" },
  ];

  const pf = portfolio(cases);
  const P = t.portfolio;
  const stats: { icon: ReactNode; label: string; value: string; sub: string }[] = [
    { icon: <TrendingUp size={18} />, label: P.pipeline, value: chfShort(pf.pipeline.volume), sub: P.pipelineSub(pf.pipeline.cases) },
    { icon: <BadgeCheck size={18} />, label: P.financed(pf.financed.year), value: chfShort(pf.financed.volume), sub: P.financedSub(pf.financed.cases) },
    { icon: <Calculator size={18} />, label: P.average, value: pf.average.amount === null ? "–" : chf(pf.average.amount), sub: P.averageSub(pf.average.cases) },
    {
      icon: <Timer size={18} />,
      label: P.throughput,
      value: pf.throughput.days === null ? "–" : P.days(pf.throughput.days),
      sub: pf.throughput.days === null ? P.throughputNone : P.throughputSub(pf.throughput.cases),
    },
    { icon: <FileCheck size={18} />, label: P.docQuota, value: pf.docQuota.pct === null ? "–" : percent(pf.docQuota.pct), sub: P.docQuotaSub },
  ];

  // The five most recently changed open Cases (the prototype's «Aktuelle Cases»).
  const recent = [...open].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium uppercase tracking-[.08em] text-white/45">{today}</div>
        <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.dashboard.welcome(firstName)}</h1>
        {!failed ? <p className="m-0 text-[21px] font-medium text-white/70">{t.dashboard.attention(action.length, open.length)}</p> : null}
      </div>

      <FormError>{failed ? t.common.casesLoadError : null}</FormError>

      {action.length > 0 ? (
        <section aria-labelledby="dash-action" className="hq-on-lime flex flex-col gap-4 rounded-xl bg-[#CAF476] p-5 text-[#132219] md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="dash-action" className="m-0 flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[.08em]">
              <AlertCircle size={18} strokeWidth={2} aria-hidden /> {t.dashboard.actionRequired}
            </h2>
            <Link href="/portal/dokumente" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full text-[14px] font-medium underline-offset-4 hover:underline min-[900px]:min-h-0">
              {t.dashboard.allMissing} <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {action.map((c) => {
              const { chips, more } = docChips(c.needDocs);
              const progress = docProgress(c.documents);
              return (
                <li key={c.id} className="border-t border-[#132219]/[.14]">
                  <Link href={`/portal/cases/${c.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-lg py-4">
                    <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
                      <div className="text-[17px] font-semibold">
                        {c.kunde} <span className="font-normal text-[#132219]/70">· {c.nr}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map((d) => (
                          <span key={d} className="whitespace-nowrap rounded-full border border-[#132219]/30 px-[11px] py-[7px] text-[13px] leading-none">
                            {d}
                          </span>
                        ))}
                        {more ? (
                          <span className="whitespace-nowrap rounded-full bg-[#132219] px-[11px] py-[7px] text-[13px] leading-none text-[#CAF476]">{t.dashboard.more(more)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="ml-auto flex flex-none items-center gap-6">
                      <div className="flex w-[130px] flex-col items-end gap-1.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[28px] font-bold leading-none tabular-nums">{c.needDocs.length}</span>
                          <span className="text-[13px] text-[#132219]/70">{t.dashboard.needLabel(c.needDocs.length)}</span>
                        </div>
                        {/* The text below says the same; inside a link the bar is decoration. */}
                        <div className="w-full" aria-hidden>
                          <ProgressBar value={progress.pct} label={t.dashboard.docsDone(progress.ok, progress.total)} onLime />
                        </div>
                        <span className="text-[11px] tracking-[.02em] text-[#132219]/70">{t.dashboard.docsDone(progress.ok, progress.total)}</span>
                      </div>
                      <span className="inline-flex h-10 flex-none items-center whitespace-nowrap rounded-full border-[1.5px] border-[#132219] px-[18px] text-[15px] font-medium">
                        {t.common.openCase} →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {kpis.map((k) => (
          <Link
            key={k.filter}
            href={`/portal/cases?filter=${encodeURIComponent(k.filter)}`}
            className={`${TILE} flex flex-col gap-1.5 transition-colors duration-200 ease-out hover:bg-white/[.08]`}
          >
            <span className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">{count(k.filter)}</span>
            <span className="text-[13px] text-white/70">{k.label}</span>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="dash-portfolio">
        <h2 id="dash-portfolio" className={`m-0 ${EYEBROW_LIME}`}>
          {P.title}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`${TILE} flex flex-col gap-2.5`}>
              <div className="flex items-center gap-2 text-[13px] text-white/70">
                <span aria-hidden className="text-[#CAF476]">
                  {s.icon}
                </span>
                {s.label}
              </div>
              <span className="text-[28px] font-bold leading-[1.05] tracking-[-0.02em] tabular-nums">{s.value}</span>
              <span className="text-[13px] text-white/70">{s.sub}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="dash-recent">
        <div className="flex items-center justify-between gap-3">
          <h2 id="dash-recent" className={`m-0 ${EYEBROW_LIME}`}>
            {t.dashboard.recent}
          </h2>
          <Link href="/portal/cases" className={`${btn.ghost} h-11 text-[16px] min-[900px]:h-9`}>
            {t.dashboard.allCases} <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
        <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
          {recent.length ? (
            recent.map((c) => <CaseRow key={c.id} c={c} viewerContactId={user.contactId} />)
          ) : (
            <div className="py-10 text-[15px] text-white/70">{failed ? "–" : cases.length ? t.dashboard.noOpenCases : t.dashboard.noCases}</div>
          )}
        </div>
      </section>

      <Resources t={t} partner={partner} />
    </>
  );
}
