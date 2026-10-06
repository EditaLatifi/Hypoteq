/* eslint-disable @next/next/no-img-element */
import { LanguageSwitch } from "@/components/portal/I18n";
import { getDict } from "@/lib/portal/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getDict();
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative flex min-h-[320px] flex-col justify-between overflow-hidden bg-[#0A130D] p-6 md:p-10 lg:p-14">
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-[26%] bg-[#CAF476]"
          style={{ clipPath: "polygon(60% 0,100% 0,100% 100%,0 100%)" }}
        />
        <div className="relative">
          <img src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" className="block h-auto w-[120px]" />
        </div>
        <div className="relative flex max-w-[min(440px,70%)] flex-col gap-5 py-12">
          <div className="h-[3px] w-11 bg-[#CAF476]" />
          <h1 className="m-0 text-[clamp(34px,4.2vw,56px)] font-bold leading-[1.05] tracking-[-0.02em]">
            {t.auth.heroTitle1}
            <br />
            {t.auth.heroTitle2}
          </h1>
          <p className="m-0 text-[21px] font-medium text-white/70">{t.auth.heroText}</p>
        </div>
        <div className="relative text-[13px] uppercase tracking-[.08em] text-white/45">{t.common.footer}</div>
      </div>

      <div className="relative flex items-center justify-center p-6 pt-16 md:p-16">
        <LanguageSwitch className="absolute right-4 top-4 md:right-8 md:top-6" />
        <div className="flex w-full max-w-[400px] flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
