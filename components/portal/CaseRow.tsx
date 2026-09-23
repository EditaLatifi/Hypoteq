"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useT } from "@/components/portal/I18n";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";
import { Badge, formatChf, formatDate } from "@/components/portal/ui";

/** One Case in a list: the whole row opens it. Used by the dashboard and the Case list. */
export default function CaseRow({ c, meta }: { c: PortalCaseSummary; meta?: "docs" | "updated" }) {
  const t = useT();
  const sub = meta === "docs" && c.missingDocs.length ? t.dashboard.docsMissing(c.missingDocs.length) : t.common.updated(formatDate(c.updatedAt));
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
