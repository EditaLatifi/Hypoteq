import Link from "next/link";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { btn } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";

/**
 * Zugriff verweigert: the Spezialfinanzierung is not this partner's. The page checked and
 * logged it on the server before calling notFound(), so this answers with HTTP 404.
 */
export default async function SpecialRequestDenied() {
  const { t } = await getDict();
  return (
    <>
      <div>
        <Link href="/portal/spezialfinanzierung" className={`${btn.ghost} h-9 text-[16px]`}>
          <ArrowLeft size={18} /> {t.special.backToList}
        </Link>
      </div>
      <div className="flex max-w-[560px] flex-col gap-5">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
          <ShieldOff size={26} />
        </span>
        <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.caseDetail.deniedTitle}</h1>
        <p className="m-0 text-[17px] text-white/70">{t.special.deniedText}</p>
      </div>
    </>
  );
}
