"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function Hero() {
  const [openLang, setOpenLang] = useState(false);
  const pathname = usePathname();
  const pathLocale = pathname.split("/")[1] || "de";
  const { t } = useTranslation(pathLocale as "de" | "en" | "fr" | "it");

  return (
    <section className="relative w-full overflow-hidden font-sfpro min-h-[50vh]">
      {/* ✅ Background (works for all screens) */}
      <div
        className="absolute inset-0 bg-no-repeat bg-cover -z-10"
        style={{
          backgroundImage: "url('/images/fotoHeroSection.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      ></div>

      {/* ✅ Content */}
      <div
        className="relative z-10 flex flex-col justify-start h-full w-full mx-auto max-w-[1579px]
        px-6 md:px-[60px] lg:px-[116px] pt-[100px] pb-[20px] md:pt-[140px] lg:pt-[180px] gap-6 md:gap-[16px]"
      >
        {/* ✅ Heading */}
        <h1
          className="text-[#132219] font-medium
          text-[42px] md:text-[65px] lg:text-[90px] xl:text-[110px]
          leading-[110%] md:leading-[100%]
          tracking-[-0.6px] md:tracking-[-1px] lg:tracking-[-1.28px]
          max-w-[95%] md:max-w-[700px] lg:max-w-[1000px]"
        >
          {t("hero.title")} <br />
          {t("hero.title2")} <br />
          {t("hero.title3")}
        </h1>

        {/* ✅ Paragraph */}
        <p
          className="text-[#132219]/80
          text-[18px] md:text-[19px] lg:text-[21px] xl:text-[22px]
          leading-[150%] md:leading-[140%]
          font-[400]
          mt-4 md:mt-[20px] lg:mt-[32px]
          max-w-[95%] md:max-w-[650px] lg:max-w-[900px]"
        >
          {t("hero.subtitle")} <br/> – <strong>{t("hero.subtitleBold")} </strong><br/>{t("hero.description")}
        </p>

        {/* ✅ CTA Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-[14px] mt-6 md:mt-[18px] lg:mt-[24px] w-full">
<Link href={`/${pathLocale}/calc`} className="w-full sm:w-auto">
  <button
    className="flex items-center justify-center 
    w-full sm:w-auto
    h-[54px] md:h-[50px] lg:h-[56px]
    px-[32px] md:px-[36px] lg:px-[48px] py-[12px] md:py-[11px] lg:py-[14px]
    rounded-[45px]
    bg-[#132219] text-[#CAF476]
    text-[18px] md:text-[19px] lg:text-[22px] font-semibold
    hover:opacity-90 transition-all"
  >
    {t("hero.buttonText")}
  </button>
</Link>

        </div>

{/*
<div className="flex flex-col mt-[60px] sm:mt-[80px] gap-[16px] sm:gap-[24px]">
  <p className="text-[#132219]/70 text-[15px] sm:text-[16px] font-normal">
    In Zusammenarbeit mit:
  </p>

  <div
    className="
      flex flex-wrap sm:flex-nowrap
      items-center justify-start sm:justify-between
      gap-x-[24px] gap-y-[16px] sm:gap-x-[32px]
      mb-[30px] sm:mb-[42px]
    "
  >
    <Image
      src="/images/UBS-LogoBlack.svg"
      alt="UBS"
      width={130}
      height={36}
      className="h-[32px] sm:h-[52px] w-auto shrink-0"
    />
    <Image
      src="/images/24.png"
      alt="ZKB"
      width={130}
      height={36}
      className="h-[32px] sm:h-[52px] w-auto shrink-0"
    />
    <Image
      src="/images/Bank_Cler_logo.png"
      alt="Cler"
      width={140}
      height={32}
      className="h-[32px] sm:h-[44px] w-auto shrink-0"
    />
    <Image
      src="/images/Raiffeisen_Schweiz_Logo.png"
      alt="Raiffeisen"
      width={150}
      height={28}
      className="h-[30px] sm:h-[36px] w-auto shrink-0"
    />
    <Image
      src="/images/67.svg"
      alt="SNB"
      width={140}
      height={28}
      className="h-[30px] sm:h-[36px] w-auto shrink-0"
    />
  </div>
</div>
*/}


      </div>
    </section>
  );
}
