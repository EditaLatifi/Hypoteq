import { Info } from "lucide-react";
import type { SpecialDict } from "@/lib/portal/i18n/special";

/** The always-visible notice of the handoff: individually assessed, outside the partner agreement. */
export default function SpecialNotice({ s }: { s: SpecialDict }) {
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-[#CAF476]/35 bg-[#CAF476]/[.08] px-[18px] py-4">
      <Info size={20} className="mt-0.5 flex-none text-[#CAF476]" />
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{s.noticeTitle}</span>
        <span className="text-[15px] text-white/70">{s.noticeText}</span>
      </div>
    </div>
  );
}
