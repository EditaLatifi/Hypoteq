"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const Banner: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = pathname.split("/")[1] || "de";
  const { t } = useTranslation(pathLocale as "de" | "en" | "fr" | "it");

  return (
    <section
      className="
        relative w-full max-w-[95%] md:max-w-[90%] lg:max-w-[1273px] 
        h-auto md:h-[240px] lg:h-[278px] 
        rounded-[10px] md:rounded-[15px] lg:rounded-[10px]
        mt-[80px] md:mt-[100px] lg:mt-[120px] 
        mb-[80px] md:mb-[120px] lg:mb-[200px] 
        overflow-hidden mx-auto
        flex flex-col md:flex-row justify-start items-start md:items-center gap-[24px] md:gap-[80px] lg:gap-[160px] 
        px-[28px] md:px-[50px] lg:px-[116px] 
        py-[40px] md:py-[30px] lg:pt-[40px]
      "
      style={{
        background: "url('/images/cta1.png') center/cover no-repeat",
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20"></div>

      {/* Content */}
      <div
        className="
          relative z-10 flex flex-col items-start justify-center gap-[16px] md:gap-[18px] lg:gap-[16px] max-w-[700px] text-left
        "
      >
        {/* Title */}
        <h3
          className="
            font-['SF Pro Display']
            text-[#CAF476]
            text-[22px] md:text-[28px] lg:text-[36px]
            font-[300] md:font-[300] lg:font-[300]
            leading-[140%] md:leading-[130%]
            tracking-[-0.3px]
          "
        >
         {t("consultation.title")}
        </h3>

        {/* Paragraph */}
        <p
          className="
            font-['SF Pro Display']
        text-[#CAF476]
            text-[14px] md:text-[17px] lg:text-[20px]
            font-[300]
            leading-[140%]
            opacity-90 md:opacity-90
            max-w-[310px] md:max-w-[500px] lg:max-w-[650px]
            mt-[4px] md:mt-[8px] lg:mt-5
          "
        >
{t("consultation.description")}
     
        </p>
      </div>

      {/* Button */}
      <div
        className="
          relative z-10 flex items-center justify-center h-full
          mt-[26px] md:mt-0 w-full md:w-auto justify-center md:justify-start
        "
      >
<Link href={`/${pathLocale}/contact`}>
  <button
    className="
      bg-[#CAF476]
      text-[#132219]
      font-['SF Pro Display']
      font-[600]
      text-[15px] md:text-[17px] lg:text-[20px]
      leading-normal tracking-[-0.2px]
      px-[24px] py-[12px] md:px-[26px] md:py-[11px] lg:px-[22px] lg:py-[10px]
      rounded-full border border-[#132219]
      hover:bg-[#D6FA8A]
      transition-all duration-300
      whitespace-nowrap 
      shadow-[0_0_20px_rgba(202,244,118,0.3)] md:shadow-[0_0_17px_rgba(202,244,118,0.28)] lg:shadow-[0_0_15px_rgba(202,244,118,0.25)]
      w-auto
    "
  >
    {t("buttons.bookAppointment")}
  </button>
</Link>
      </div>
    </section>
  );
};

export default Banner;
