import Link from "next/link";
import { ArrowRight, ShieldOff } from "lucide-react";
import { btn } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";

/**
 * Zugriff verweigert (handoff): the Case is not this partner's. The page checked and logged it
 * on the server before calling notFound(), so this answers with HTTP 404.
 */
export default async function CaseDenied() {
  const { t } = await getDict();
  return (
    <div className="flex max-w-[560px] flex-col gap-5 pt-6">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
        <ShieldOff size={26} aria-hidden />
      </span>
      <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.caseDetail.deniedTitle}</h1>
      <p className="m-0 text-[17px] text-white/70">{t.caseDetail.deniedText}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/portal/cases" className={`${btn.primary} h-11 text-[16px]`}>
          {t.caseDetail.toOverview} <ArrowRight size={18} aria-hidden />
        </Link>
        <Link href="/portal/dashboard" className={`${btn.ghost} h-11 rounded-full px-2 text-[16px]`}>
          {t.caseDetail.toDashboard}
        </Link>
      </div>
    </div>
  );
}
