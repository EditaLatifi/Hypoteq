"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const LOCALES = ["de", "en", "fr", "it"] as const;
type LocaleCode = (typeof LOCALES)[number];

const ArrowIcon = ({ className = "" }: { className?: string }) => (
  <svg
    width="18"
    height="12"
    viewBox="0 0 18 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M1 6h15.5M11 1l5 5-5 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function BetterHome() {
  const pathname = usePathname();
  const router = useRouter();
  const firstSegment = pathname?.split("/")[1] ?? "";
  const pathLocale = (LOCALES.includes(firstSegment as LocaleCode)
    ? firstSegment
    : "de") as LocaleCode;
  const { t } = useTranslation(pathLocale);

  const startHref = `/${pathLocale}/funnel`;

  const switchLocale = (next: LocaleCode) => {
    if (next === pathLocale) return;
    router.push(`/${next}/betterhomes`);
  };

  return (
    <main className="font-sfpro bg-white text-[#132219] overflow-x-hidden">
      {/* ============ HERO ============ */}
      <section className="relative w-full min-h-[640px] md:min-h-[760px] lg:min-h-[835px] flex flex-col overflow-hidden isolate">
        <Image
          src="/images/HYPOTEQ_betterhome_hero_bg.jpg"
          alt={t("betterhomes.hero.imageAlt")}
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover z-0"
        />
        <div className="absolute inset-0 bg-black/40 z-[1]" />

        {/* Language switcher (top-right) */}
        <div className="absolute top-[20px] right-[20px] md:top-[32px] md:right-[40px] z-20 flex items-center gap-[4px] rounded-full border border-white/30 bg-black/30 backdrop-blur-sm px-[6px] py-[4px]">
          {LOCALES.map((lang) => {
            const active = lang === pathLocale;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => switchLocale(lang)}
                aria-label={`Switch language to ${lang.toUpperCase()}`}
                aria-current={active ? "page" : undefined}
                className={`min-w-[34px] px-[8px] py-[4px] rounded-full text-[12px] md:text-[13px] font-semibold uppercase tracking-wide transition-all ${
                  active
                    ? "bg-[#CAF476] text-[#132219]"
                    : "text-white hover:bg-white/15"
                }`}
              >
                {lang}
              </button>
            );
          })}
        </div>

        {/* Co-branded logos */}
        <div className="relative z-10 w-full flex justify-center pt-[28px] md:pt-[46px]">
          <div className="flex items-end gap-[12px] md:gap-[16px]">
            <div className="relative h-[32px] w-[128px] md:h-[42px] md:w-[168px]">
              <Image
                src="/images/HYPOTEQ_layout_logo_white.png"
                alt="HYPOTEQ"
                fill
                priority
                className="object-contain"
              />
            </div>
            <div className="relative h-[32px] w-[180px] md:h-[42px] md:w-[258px]">
              <Image
                src="/images/HYPOTEQ_betterhome_logo.svg"
                alt={t("betterhomes.logoAlt")}
                fill
                priority
                className="object-contain"
              />
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-12 py-[80px] md:py-[120px]">
          <div className="w-full max-w-[1178px] flex flex-col items-center gap-[28px] md:gap-[48px] text-center">
            <h1 className="text-white font-medium tracking-[-0.4px] md:tracking-[-0.8px] text-[40px] md:text-[64px] lg:text-[80px] leading-[1.1] md:leading-[1.2]">
              <span className="block">{t("betterhomes.hero.title")}</span>
              <span className="block text-[#CAF476]">
                {t("betterhomes.hero.titleAccent")}
              </span>
            </h1>

            <p className="text-white text-[16px] md:text-[20px] lg:text-[24px] leading-[1.5] md:leading-[1.4] max-w-[1080px]">
              {t("betterhomes.hero.subtitle")}
            </p>

            <Link href={startHref}>
              <button
                type="button"
                className="inline-flex items-center gap-[10px] rounded-[45px] border border-[#132219] bg-[#CAF476] px-[24px] py-[12px] text-[#132219] text-[18px] md:text-[20px] font-semibold hover:opacity-90 transition-all"
              >
                {t("betterhomes.hero.cta")}
                <ArrowIcon />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ SECTION: Schneller zur Hypothek ============ */}
      <section className="w-full px-6 md:px-12 py-[64px] md:py-[100px]">
        <div className="mx-auto max-w-[1142px] flex flex-col items-center text-center gap-[24px]">
          <h2 className="text-[#132219] font-medium text-[32px] md:text-[40px] lg:text-[48px] leading-[1.2] md:leading-[1.4]">
            {t("betterhomes.benefits.title")}
          </h2>
          <p className="text-[#132219] font-light text-[16px] md:text-[20px] lg:text-[24px] leading-[1.4] max-w-[980px]">
            {t("betterhomes.benefits.subtitle")}
          </p>
          <Link href={startHref}>
            <button
              type="button"
              className="inline-flex items-center gap-[10px] rounded-[45px] border border-[#132219] bg-[#CAF476] px-[24px] py-[10px] text-[#132219] text-[18px] md:text-[20px] font-semibold hover:opacity-90 transition-all"
            >
              {t("betterhomes.benefits.cta")}
              <ArrowIcon />
            </button>
          </Link>
        </div>
      </section>

      {/* ============ SECTION: Image + 3 steps ============ */}
      <section className="w-full px-6 md:px-12 py-[40px] md:py-[80px]">
        <div className="mx-auto max-w-[1320px] grid grid-cols-1 lg:grid-cols-2 items-center gap-[40px] lg:gap-[108px]">
          <div className="relative w-full aspect-[629/523] rounded-[28px] overflow-hidden">
            <Image
              src="/images/HYPOTEQ_betterhome_keys.jpg"
              alt={t("betterhomes.steps.imageAlt")}
              fill
              quality={85}
              sizes="(max-width: 1024px) 100vw, 629px"
              className="object-cover"
            />
          </div>

          <ol className="flex flex-col gap-[40px] md:gap-[56px] lg:gap-[80px] list-none">
            <li className="flex flex-col gap-[12px] md:gap-[16px] max-w-[536px]">
              <h3 className="text-[#132219] text-[26px] md:text-[32px] lg:text-[36px] leading-[1.2] font-normal">
                {t("betterhomes.steps.step1.title")}
              </h3>
              <p className="text-[#132219] text-[16px] md:text-[18px] lg:text-[20px] leading-[1.5]">
                {t("betterhomes.steps.step1.body")}
              </p>
            </li>
            <li className="flex flex-col gap-[12px] md:gap-[16px] max-w-[536px]">
              <h3 className="text-[#132219] text-[26px] md:text-[32px] lg:text-[36px] leading-[1.2] font-normal">
                {t("betterhomes.steps.step2.title")}
              </h3>
              <p className="text-[#132219] text-[16px] md:text-[18px] lg:text-[20px] leading-[1.5]">
                {t("betterhomes.steps.step2.body")}
              </p>
            </li>
            <li className="flex flex-col gap-[12px] md:gap-[16px] max-w-[536px]">
              <h3 className="text-[#132219] text-[26px] md:text-[32px] lg:text-[36px] leading-[1.2] font-normal">
                {t("betterhomes.steps.step3.title")}
              </h3>
              <p className="text-[#132219] text-[16px] md:text-[18px] lg:text-[20px] leading-[1.5]">
                {t("betterhomes.steps.step3.body")}
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* ============ SECTION: Wir kennen den Markt ============ */}
      <section className="w-full px-6 md:px-12 py-[64px] md:py-[100px]">
        <div className="mx-auto max-w-[1320px] grid grid-cols-1 md:grid-cols-2 gap-[20px] md:gap-[32px]">
          <h2 className="text-[#132219] font-medium text-[32px] md:text-[42px] lg:text-[50px] leading-[1.15] md:leading-[1.4] max-w-[613px]">
            {t("betterhomes.market.title")}
          </h2>
          <p className="text-[#132219] font-light text-[16px] md:text-[20px] lg:text-[24px] leading-[1.5] md:leading-[1.4] max-w-[616px]">
            {t("betterhomes.market.subtitle")}
          </p>
        </div>
      </section>

      {/* ============ SECTION: CTA banner (lime green) ============ */}
      <section className="w-full bg-[#CAF476] px-6 md:px-12 py-[64px] md:py-[80px]">
        <div className="mx-auto max-w-[1142px] flex flex-col items-center text-center gap-[24px] md:gap-[30px]">
          <h2 className="text-[#132219] font-medium tracking-[-0.4px] md:tracking-[-0.6px] text-[36px] md:text-[48px] lg:text-[60px] leading-[1.15] md:leading-[1.2]">
            {t("betterhomes.finalCta.title")}
          </h2>
          <p className="text-black text-[16px] md:text-[20px] leading-[1.5] md:leading-[30px] max-w-[876px]">
            {t("betterhomes.finalCta.subtitle")}
          </p>
          <Link href={startHref}>
            <button
              type="button"
              className="inline-flex items-center gap-[8px] rounded-[45px] bg-black px-[24px] py-[10px] md:py-[8px] text-[#CAF476] text-[18px] md:text-[20px] font-semibold hover:opacity-90 transition-all"
            >
              {t("betterhomes.finalCta.button")}
              <ArrowIcon className="text-[#CAF476]" />
            </button>
          </Link>
        </div>
      </section>
    </main>
  );
}
