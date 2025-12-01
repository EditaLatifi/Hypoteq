"use client";
import Image from "next/image";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const StartProcessBanner = () => {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
<section
  className="
    relative w-full max-w-[1275px]
    h-[260px] md:h-[197px]
    rounded-[10px] overflow-hidden mx-auto
    mt-[48px] md:mt-[120px]
    flex flex-col md:flex-row
    items-start md:items-center
    justify-start md:justify-between
    px-[16px] md:px-[24px]
    py-[20px] md:py-0
  "
>


  <Image
    src="/images/HYPOTEQ_home_cta_mobile.png"
    alt="Mobile background"
    fill
    className="object-cover absolute inset-0 md:hidden"
  />

  <Image
    src="/images/HYPOTEQ_home_cta_desktop.png"
    alt="Desktop background"
    fill
    className="object-cover absolute inset-0 hidden md:block"
  />

  {/* TEXT */}
  <div className="relative z-10 flex flex-col gap-[8px] md:gap-[10px] max-w-full md:max-w-[536px]">
    <h3
      className="
        text-[#132219]
        font-[600] md:font-[500]
        text-[24px] md:text-[40px]
        leading-[130%] md:leading-[140%]
      "
    >
      {t("startProcess.title")}
    </h3>

    <p
      className="
        text-[#132219]
        text-[16px] md:text-[20px]
        font-[300]
        leading-[140%] md:leading-[140%]
      "
    >
      {t("startProcess.description")}
    </p>
  </div>

  {/* ✅ BUTTON: mobile bottom-left, desktop untouched */}
  <button
    className="
      z-10 rounded-[58px] border border-[#132219]
      bg-[#132219] md:bg-white
      text-white md:text-[#132219]

      /* ✅ MOBILE real Figma values */
      w-[167px] h-[30px]
      text-[12px] font-[600] leading-[normal]

      /* ✅ Desktop untouched */
      md:w-auto md:h-auto
      md:px-[24px] md:py-[8px]
      md:text-[18px]

      absolute md:static
      bottom-[16px] left-[16px]  /* ✅ Left corner mobile */
      translate-x-0 md:translate-x-0 /* override center */

      transition-transform hover:scale-[1.03]
      flex items-center justify-center
    "
  >
    {t("startProcess.button")}
  </button>

</section>
  );
};

export default StartProcessBanner;
