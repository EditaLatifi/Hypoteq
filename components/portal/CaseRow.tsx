"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useT } from "@/components/portal/I18n";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";
import { Badge, formatChf, formatDate } from "@/components/portal/ui";

/**
 * One Case in a list: the whole row opens it. Used by the dashboard and the Case list.
 * `viewerContactId` marks colleagues' Cases (company view) with their consultant's name.
 */
export default function CaseRow({ c, meta, viewerContactId }: { c: PortalCaseSummary; meta?: "docs" | "updated"; viewerContactId?: string | null }) {
  const t = useT();
  const sub =
    meta === "docs" && c.missingDocs.length
      ? t.dashboard.docsMissing(c.missingDocs.length)
      : meta === "docs" && c.openDocs.length
        ? t.dashboard.docsOpen(c.openDocs.length)
        : t.common.updated(formatDate(c.updatedAt));
  const colleague = viewerContactId && c.consultantId && c.consultantId !== viewerContactId ? c.consultantName : null;
  return (
    <Link
      href={`/portal/cases/${c.id}`}
      className="grid grid-cols-1 items-center gap-x-5 gap-y-3 border-b border-white/[.14] py-4 last:border-b-0 hover:bg-white/[.03] sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.3fr_auto]"
    >
      <div className="min-w-0">
        <div className="truncate text-[17px] font-medium">{c.kunde}</div>
        <div className="text-[13px] text-white/70">
          {c.nr} · {t.common.created} {formatDate(c.createdAt)}
        </div>
        {colleague ? <div className="truncate text-[13px] text-[#CAF476]/80">{t.common.consultant(colleague)}</div> : null}
      </div>
      <div className="min-w-0">
        <div className="text-[15px]">{c.art}</div>
        <div className="text-[13px] tabular-nums text-white/70">{formatChf(c.betrag)}</div>
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <Badge tone={c.tone}>{t.status[c.status] || c.status}</Badge>
        <span className="text-[13px] text-white/70">{sub}</span>
      </div>
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 text-[16px] font-semibold">
          {t.common.openCase} <ArrowRight size={18} />
        </span>
      </div>
    </Link>
  );
}
