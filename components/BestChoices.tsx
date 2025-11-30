"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function BestChoices() {
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <>
    
{/* Wrapper që ngjit tekstin tek box-i */}
<div className="w-full max-w-[1352px] mx-auto px-[24px] sm:px-[32px] md:px-[40px] mt-[120px] -mb-[100px]">

  {/* Teksti i kuq — ndodhet brenda wrapper-it - Hidden on mobile */}
  <p className="hidden lg:block text-[#132219] text-[16px] sm:text-[18px] lg:text-[20px] font-sfpro leading-[150%] text-center lg:text-left">
    {t("bestChoices.disclaimer")}
  </p>

</div>

{/* BOX që ruan mt siç është te Figma */}
<section
  className="
    flex flex-col lg:flex-row justify-between items-center
    w-full max-w-[1272px] mx-auto
    p-[24px] sm:p-[32px] md:p-[40px]
    rounded-[10px]
    border border-[#000]
    bg-[#132219]
    mt-[120px]
    mb-[24px]
  "
>

 
        {/* Left Column */}
        <div
          className="
            flex flex-col justify-center items-start
            w-full lg:w-[511px] h-auto lg:h-[249px]
            gap-[24px] lg:gap-[58px]
            text-white font-sfpro
          "
        >
          <div>
            <h2 className="text-[32px] sm:text-[40px] lg:text-[48px] font-[500] leading-[140%] tracking-[-0.48px] text-white">
              {t("bestChoices.title")}
            </h2>
            <p className="text-[22px] sm:text-[26px] lg:text-[32px] font-[400] leading-[140%] tracking-[-0.32px] text-white">
              {t("bestChoices.subtitle")}
            </p>
          </div>

          <p className="text-[18px] sm:text-[20px] lg:text-[22px] font-normal text-white leading-[150%] font-sfpro">
            {t("bestChoices.description")}
          </p>
        </div>

        {/* Right Column */}
        <div
          className="
            flex flex-wrap lg:flex-nowrap items-center justify-center
            gap-[10px] sm:gap-[16px] lg:gap-[42px]
            w-full lg:w-[622px] h-auto lg:h-[225px]
          "
        >
          <RateCard title={t("bestChoices.saronFrom")} value="0.83%" />
          <RateCard title={t("bestChoices.fiveYearsFrom")} value="0.99%" />
          <RateCard title={t("bestChoices.tenYearsFrom")} value="1.38%" />
        </div>

        {/* Info text - shown inside box on mobile only */}
        <p className="lg:hidden text-white text-[16px] sm:text-[18px] font-sfpro leading-[150%] text-center mt-[24px]">
          {t("bestChoices.footerText")}
        </p>
      </section>

      {/* Info text below - shown outside box on desktop only */}
      <p className="hidden lg:block max-w-[1352px] mx-auto text-[#132219] text-[18px] sm:text-[16px] lg:text-[22px] font-sfpro leading-[150%] px-[24px] sm:px-[32px] md:px-[40px] mb-[120px] text-center lg:text-left">
        {t("bestChoices.footerText")}
      </p>
    </>
  );
}

function RateCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="
        flex flex-col justify-center items-center
        w-[30%] sm:w-[32%] md:w-[160px] lg:w-[179.33px]
        h-[90px] sm:h-[110px] md:h-[130px] lg:h-[143px]
        rounded-[10px]
        bg-[#CAF476]
        px-[10px] py-[14px]
      "
    >
      <span className="font-sfpro text-[12px] sm:text-[14px] lg:text-[16px] font-[400] leading-[100%] text-[#132219] mb-[6px] text-center">
        {title}
      </span>
      <span className="font-sfpro text-[28px] sm:text-[36px] lg:text-[48px] font-[400] text-[#132219] leading-normal text-center">
        {value}
      </span>
    </div>
  );
}
