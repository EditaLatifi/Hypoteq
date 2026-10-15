/* eslint-disable @next/next/no-img-element */
import { LanguageSwitch } from "@/components/portal/I18n";
import { getDict } from "@/lib/portal/i18n/server";

/**
 * The frame of every sign-in screen (handoff «Layout Login»): full-bleed #0A130D, logo,
 * headline and footer on the left, the form on a glass card on the right, a lime wedge at
 * the right edge and a faint lime glow. The grid falls to one column below roughly 880 px
 * (two 420 px columns no longer fit), exactly as the prototype's.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getDict();
  return (
    <div className="relative grid min-h-screen grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-[clamp(32px,5vw,80px)] overflow-hidden bg-[#0A130D] p-[clamp(20px,4vw,64px)]">
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-22vmax] top-[-30vmax] h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(202,244,118,.12),rgba(202,244,118,0))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-32vmax] left-[-24vmax] h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgba(74,120,84,.55),rgba(74,120,84,0))]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[22%] bg-[#CAF476]" style={{ clipPath: "polygon(64% 0,100% 0,100% 100%,30% 100%)" }} />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10%] right-[-10%] top-[58%] h-px rotate-[-14deg] bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.12),rgba(255,255,255,0))]"
      />

      <div className="relative flex flex-col justify-between gap-14 self-stretch py-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <img src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" className="block h-auto w-[120px]" />
          <LanguageSwitch />
        </div>
        <div className="flex max-w-[480px] flex-col gap-5">
          <div aria-hidden className="h-[3px] w-11 bg-[#CAF476]" />
          <h1 className="m-0 text-[clamp(34px,4.2vw,56px)] font-bold leading-[1.05] tracking-[-0.02em]">
            {t.auth.heroTitle1}
            <br />
            {t.auth.heroTitle2}
          </h1>
          <p className="m-0 text-[21px] font-medium text-white/70">{t.auth.heroText}</p>
        </div>
        <div className="text-[13px] uppercase tracking-[.08em] text-white/45">{t.common.footer}</div>
      </div>

      <div className="relative flex justify-center">
        <div
          className="hq-in flex w-full max-w-[440px] flex-col gap-6 rounded-[24px] border border-white/10 p-[clamp(24px,3vw,40px)] shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_30px_80px_rgba(3,8,5,.6)] backdrop-blur-[18px]"
          style={{ background: "linear-gradient(160deg, rgba(30,52,38,.9), rgba(15,27,20,.94))" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
