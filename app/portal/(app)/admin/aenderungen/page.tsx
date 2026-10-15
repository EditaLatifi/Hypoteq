import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { Badge, Card, Eyebrow, PageHeader, btn, formatDate, formatDateTime } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { CHANGE_STATUSES, CHANGE_STATUS_TONE, changeRequestNr, isChangeStatus } from "@/lib/portal/changeRequests";
import { getDict } from "@/lib/portal/i18n/server";
import { PARTNER_DOC_STATUSES, PARTNER_DOC_STATUS_TONE, isPartnerDocStatus } from "@/lib/portal/partnerDocuments";
import { requireAdmin } from "@/lib/portal/session";
import { setChangeRequestStatusAction, setPartnerDocumentStatusAction } from "./actions";

const selectClass =
  "h-9 rounded-xl border border-white/[.14] bg-[#1A2E20] px-3 text-[15px] text-white outline-none focus:border-[#CAF476]";

/**
 * Admin: partners' change requests and company documents, with their status. Reached at
 * /portal/admin/aenderungen (linked from the team mails); «Offen» shows what still waits.
 */
export default async function AdminChangeRequestsPage({ searchParams }: { searchParams: { filter?: string } }) {
  await requireAdmin();
  const { t } = await getDict();
  const tx = t.profileExtra;
  const all = searchParams.filter === "all";

  const [requests, docs] = await Promise.all([
    prisma.portalChangeRequest.findMany({ where: all ? undefined : { status: "in_pruefung" }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.portalPartnerDocument.findMany({ where: all ? undefined : { status: "in_pruefung" }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  const userIds = Array.from(new Set([...requests.map((r) => r.userId), ...docs.map((d) => d.userId)]));
  const users = new Map(
    (await prisma.portalUser.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, company: true } })).map((u) => [u.id, u])
  );
  const who = (id: string) => {
    const u = users.get(id);
    return u ? [u.name, u.company, u.email].filter(Boolean).join(" · ") : tx.admin.unknownUser;
  };

  const filters: [string, string][] = [
    ["", tx.admin.filterOpen],
    ["all", tx.admin.filterAll],
  ];

  return (
    <>
      <PageHeader eyebrow={t.nav.administration} title={tx.admin.title} sub={tx.admin.sub} />

      <div className="flex flex-wrap gap-2">
        {filters.map(([k, label]) => {
          const on = (k === "all") === all;
          return (
            <Link
              key={k}
              href={k ? `/portal/admin/aenderungen?filter=${k}` : "/portal/admin/aenderungen"}
              aria-current={on ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full border px-4 text-[15px] font-medium ${on ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/30 text-white hover:bg-white/[.08]"}`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <Card className="gap-3">
        <Eyebrow accent>{tx.change.listTitle}</Eyebrow>
        {requests.length === 0 ? <p className="m-0 text-[15px] text-white/70">{tx.admin.none}</p> : null}
        <div className="flex flex-col">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 border-t border-white/[.14] py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] text-white/70">
                    {changeRequestNr(r.id)} · {formatDateTime(r.createdAt)} · {who(r.userId)}
                  </span>
                  <span className="text-[15px] font-semibold">{tx.change.fields[r.field] || r.field}</span>
                </div>
                <Badge tone={isChangeStatus(r.status) ? CHANGE_STATUS_TONE[r.status] : "neutral"}>{tx.change.status[r.status] || r.status}</Badge>
              </div>
              <div className="grid gap-1 text-[15px] sm:grid-cols-[140px_1fr]">
                <span className="text-white/70">{tx.admin.oldValue}</span>
                <span className="break-words">{r.oldValue || "–"}</span>
                <span className="text-white/70">{tx.admin.newValue}</span>
                <span className="break-words font-medium">{r.newValue}</span>
                {r.note ? (
                  <>
                    <span className="text-white/70">{tx.admin.note}</span>
                    <span className="whitespace-pre-wrap break-words">{r.note}</span>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] text-white/70">
                  {r.sfTaskId ? `${tx.admin.task} (${r.sfTaskId})` : tx.admin.noTask}
                  {r.decidedAt && r.decidedBy ? ` · ${tx.admin.decided(formatDate(r.decidedAt), r.decidedBy)}` : ""}
                </span>
                <form action={setChangeRequestStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="status" defaultValue={r.status} aria-label={tx.admin.setTo} className={selectClass}>
                    {CHANGE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {tx.change.status[s]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={`${btn.secondary} h-9 text-[15px]`}>
                    {tx.admin.save}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-3">
        <Eyebrow accent>{tx.admin.docsTitle}</Eyebrow>
        {docs.length === 0 ? <p className="m-0 text-[15px] text-white/70">{tx.admin.docsNone}</p> : null}
        <div className="flex flex-col">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.14] py-3">
              <a href={`/api/portal/partner-docs/${d.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
                <FileText size={20} className="flex-none text-[#CAF476]" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium group-hover:text-[#DAF6A2]">
                    {tx.docs.kinds[d.name] || d.name} · {d.fileName}
                  </span>
                  <span className="block truncate text-[13px] text-white/70">
                    {who(d.userId)} · {formatDate(d.createdAt)}
                  </span>
                </span>
                <Download size={16} className="flex-none text-white/60" />
              </a>
              <div className="flex items-center gap-2">
                <Badge tone={isPartnerDocStatus(d.status) ? PARTNER_DOC_STATUS_TONE[d.status] : "neutral"}>{tx.docs.status[d.status] || d.status}</Badge>
                <form action={setPartnerDocumentStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <select name="status" defaultValue={d.status} aria-label={tx.admin.setTo} className={selectClass}>
                    {PARTNER_DOC_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {tx.docs.status[s]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={`${btn.secondary} h-9 text-[15px]`}>
                    {tx.admin.save}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
