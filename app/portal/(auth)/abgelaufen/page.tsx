import Link from "next/link";
import { ArrowRight, TimerOff } from "lucide-react";
import { btn } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";

export default async function SessionExpiredPage() {
  const { t } = await getDict();
  return (
    <div className="flex flex-col gap-5">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
        <TimerOff size={26} />
      </span>
      <h2 className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.02em]">{t.auth.expiredTitle}</h2>
      <p className="m-0 text-white/70">{t.auth.expiredText}</p>
      <Link href="/portal/login" className={`${btn.primary} h-[52px] w-full text-[19px]`}>
        {t.auth.loginAgain} <ArrowRight size={20} />
      </Link>
    </div>
  );
}
