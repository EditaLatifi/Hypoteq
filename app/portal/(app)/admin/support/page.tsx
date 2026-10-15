import Link from "next/link";
import { setSupportStatusAction } from "@/app/portal/supportActions";
import { Badge, FormError, PageHeader, btn, formatDateTime } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/portal/i18n/server";
import { requireAdmin } from "@/lib/portal/session";
import { SUPPORT_STATUSES, isSupportStatus, isSupportType, supportStatusLabel, supportTone, ticketRef } from "@/lib/portal/support";

/**
 * Admin: the Support & Feedback tickets of all partners, newest first, and their status —
 * which the partner sees under «Ihre Meldungen». Reached by URL (/portal/admin/support);
 * the reply itself goes out by e-mail from the support mailbox.
 */
export default async function AdminSupportPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireAdmin();
  const { t } = await getDict();
  const sp = t.support;
  const filter = isSupportStatus(searchParams.status) ? searchParams.status : null;

  let tickets: Awaited<ReturnType<typeof prisma.portalSupportTicket.findMany>> = [];
  let counts = new Map<string, number>();
  let users = new Map<string, { name: string | null; email: string; company: string | null }>();
  let failed = false;
  try {
    const [rows, groups] = await Promise.all([
      prisma.portalSupportTicket.findMany({ where: filter ? { status: filter } : {}, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.portalSupportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    tickets = rows;
    counts = new Map(groups.map((g) => [g.status, g._count._all]));
    const people = await prisma.portalUser.findMany({
      where: { id: { in: Array.from(new Set(rows.map((r) => r.userId))) } },
      select: { id: true, name: true, email: true, company: true },
    });
    users = new Map(people.map((p) => [p.id, p]));
  } catch (err) {
    console.error("[portal] loading support tickets failed", err);
    failed = true;
  }
  const total = Array.from(counts.values()).reduce((n, c) => n + c, 0);

  const pill = (on: boolean) =>
    `inline-flex h-8 items-center rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
      on ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/20 text-white hover:bg-white/[.08]"
    }`;

  return (
    <>
      <PageHeader eyebrow={t.nav.administration} title={sp.admin.title} sub={sp.admin.sub} />
      <FormError>{failed ? t.errors.generic : null}</FormError>
      <div className="flex flex-wrap gap-2">
        <Link href="/portal/admin/support" className={pill(!filter)} aria-current={!filter ? "page" : undefined}>
          {sp.admin.all} · {total}
        </Link>
        {SUPPORT_STATUSES.map((st) => (
          <Link key={st} href={`/portal/admin/support?status=${st}`} className={pill(filter === st)} aria-current={filter === st ? "page" : undefined}>
            {sp.statuses[st]} · {counts.get(st) || 0}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {tickets.map((tk) => {
          const who = users.get(tk.userId);
          const tech = (tk.techInfo && typeof tk.techInfo === "object" ? tk.techInfo : null) as Record<string, string> | null;
          return (
            <div key={tk.id} className="flex flex-col gap-2 border-b border-white/[.14] py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="text-[13px] tabular-nums text-white/70">
                  {ticketRef(tk.id)} · {isSupportType(tk.type) ? sp.types[tk.type] : tk.type} · {formatDateTime(tk.createdAt)}
                </span>
                <Badge tone={supportTone(tk.status)}>{supportStatusLabel(sp, tk.status)}</Badge>
              </div>
              <div className="break-words text-[17px] font-medium">{tk.subject}</div>
              <div className="text-[14px] text-white/70">
                {sp.admin.partner}: {who ? [who.name, who.company].filter(Boolean).join(" · ") || who.email : "–"}
                {who ? (
                  <>
                    {" · "}
                    <a href={`mailto:${who.email}`} className="text-[#CAF476] hover:text-[#DAF6A2]">
                      {who.email}
                    </a>
                  </>
                ) : null}
                {tk.caseId ? ` · ${sp.admin.case}: ${tk.caseId}` : null}
              </div>
              <p className="m-0 whitespace-pre-wrap break-words text-[15px]">{tk.body}</p>
              {tech ? (
                <div className="flex flex-col gap-0.5 text-[13px] text-white/60">
                  <span>
                    {sp.admin.tech}: {[tech.page, tech.viewport, tech.appVersion].filter(Boolean).join(" · ") || "–"}
                  </span>
                  {tech.browser ? <span className="break-all">{tech.browser}</span> : null}
                </div>
              ) : null}
              <form action={setSupportStatusAction} className="flex flex-wrap items-center gap-2 pt-1">
                <input type="hidden" name="ticketId" value={tk.id} />
                <label className="sr-only" htmlFor={`status-${tk.id}`}>
                  {sp.admin.status}
                </label>
                <select
                  id={`status-${tk.id}`}
                  name="status"
                  defaultValue={tk.status}
                  className="h-9 rounded-full border border-white/[.14] bg-[#1A2E20] px-3 text-[14px] text-white outline-none focus:border-[#CAF476]"
                >
                  {SUPPORT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {sp.statuses[st]}
                    </option>
                  ))}
                </select>
                <button type="submit" className={`${btn.secondary} h-9 text-[14px]`}>
                  {sp.admin.save}
                </button>
              </form>
            </div>
          );
        })}
        {tickets.length === 0 ? <div className="py-10 text-[15px] text-white/70">{sp.admin.none}</div> : null}
      </div>
    </>
  );
}
