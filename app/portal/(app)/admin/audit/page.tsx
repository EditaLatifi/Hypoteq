import { PageHeader, formatDateTime } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { AUDIT_LABELS } from "@/lib/portal/audit";
import { getDict } from "@/lib/portal/i18n/server";
import { requireAdmin } from "@/lib/portal/session";

export default async function AuditLogPage() {
  await requireAdmin();
  const { t } = await getDict();
  const rows = await prisma.portalAuditLog.findMany({ orderBy: { at: "desc" }, take: 300 });

  return (
    <>
      <PageHeader eyebrow={t.nav.administration} title={t.nav.audit} sub={t.admin.auditSub} />
      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-0.5 border-b border-white/[.14] py-3 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-3">
              <span className="text-[15px]">
                <span className="font-medium">{AUDIT_LABELS[r.action] || r.action}</span> · {r.actorEmail || "–"}
              </span>
              <span className="text-[13px] tabular-nums text-white/70">{formatDateTime(r.at)}</span>
            </div>
            <span className="text-[13px] text-white/70">{[r.target, r.ip ? `IP ${r.ip}` : null].filter(Boolean).join(" · ") || "–"}</span>
          </div>
        ))}
        {rows.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.admin.auditNone}</div> : null}
      </div>
    </>
  );
}
