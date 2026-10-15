import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Eyebrow, formatDate } from "@/components/portal/ui";
import type { SpecialDict } from "@/lib/portal/i18n/special";
import { formatChfAmount, specialArt } from "@/lib/portal/special";
import type { SpecialRequestView } from "@/lib/portal/specialServer";

/**
 * «Ihre Spezialfinanzierungen» under the wizard: what the partner submitted, with the Case
 * once Salesforce has one (opens it), otherwise the stored request (opens its confirmation).
 */
export default function SpecialRequestList({ rows, s }: { rows: SpecialRequestView[]; s: SpecialDict }) {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow accent>{s.listTitle}</Eyebrow>
      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {rows.length ? (
          rows.map((r) => (
            <Link
              key={r.id}
              href={r.caseId ? `/portal/cases/${r.caseId}` : `/portal/spezialfinanzierung/${r.id}`}
              className="flex items-center gap-4 border-b border-white/[.14] py-3.5 last:border-b-0 hover:bg-white/[.03]"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[17px] font-medium">{r.kunde}</span>
                <span className="text-[13px] text-white/70">
                  {specialArt(s, r.type)} · <span className="tabular-nums">{formatChfAmount(r.amount)}</span> · {formatDate(r.submittedAt)}
                </span>
              </div>
              <div className="flex flex-none flex-col items-end gap-1 text-right">
                <Badge tone="neutral">{s.statusSubmitted}</Badge>
                <span className="text-[13px] text-white/70">{r.caseNr ? s.caseCreated(r.caseNr) : r.caseId ? null : s.casePending}</span>
              </div>
              <ChevronRight size={20} className="flex-none text-[#CAF476]" />
            </Link>
          ))
        ) : (
          <div className="py-8 text-[15px] text-white/70">{s.listNone}</div>
        )}
      </div>
    </div>
  );
}
