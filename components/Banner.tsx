"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const Banner: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = pathname.split("/")[1] || "de";
  const { t } = useTranslation(pathLocale as "de" | "en" | "fr" | "it");

  return (
    <section
      className="
        relative w-full max-w-[1273px] h-[278px] rounded-[10px]
        mt-[80px] md:mt-[100px] lg:mt-[120px] mb-[120px] md:mb-[160px] lg:mb-[200px] overflow-hidden mx-auto
        flex justify-start items-start gap-[160px] px-[116px] pt-[40px]
        max-lg:flex-col max-lg:items-start max-lg:h-auto max-lg:px-[48px] max-lg:py-[60px]
        max-sm:w-full max-sm:rounded-none max-sm:px-[24px] max-sm:py-[50px]
        max-sm:flex max-sm:flex-col max-sm:items-center max-sm:justify-center max-sm:text-center
      "
    >
      {/* Background Image */}
      <Image
        src="/images/HYPOTEQ_home_cta_banner.png"
        alt="Banner background"
        fill
        quality={85}
        sizes="(max-width: 768px) 95vw, (max-width: 1024px) 90vw, 1273px"
        className="object-cover -z-10"
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20 z-0"></div>

      {/* Content */}
      <div
        className="
          relative z-10 flex flex-col items-start justify-start gap-[16px] max-w-[700px]
          max-sm:items-center max-sm:justify-center max-sm:gap-[8px] md:pl-[40px] md:pt-[30px]
        "
      >
        {/* Title */}
        <h3
          className="
            font-['SF Pro Display']
            text-[#CAF476]
            text-[28px] lg:text-[36px]
            font-[300]
            leading-[140%]
            tracking-[-0.3px]
            max-sm:text-[22px] max-sm:leading-[130%] max-sm:font-[400]
            max-sm:max-w-[320px]
          "
        >
         {t("consultation.bannerTitle")}
        </h3>

        {/* Paragraph */}
        <p
          className="
            font-['SF Pro Display']
            text-[#CAF476]
            text-[16px] lg:text-[20px]
            font-[300]
            leading-[140%]
            opacity-90
            max-w-[650px]
            mt-5
            max-sm:text-[14px] max-sm:leading-[140%]
            max-sm:max-w-[310px] max-sm:opacity-95 max-sm:mt-[4px]
          "
        >
{t("consultation.bannerDescription")}
     
        </p>
      </div>

      {/* Button */}
      <div
        className="
          relative z-10 flex items-center justify-center h-full
          max-sm:mt-[-86px] max-sm:w-full max-sm:justify-center
        "
      >
<Link href="https://calendly.com/hypoteq/hypoteq-intro-call" target="_blank">
  <button
    className="
      bg-[#CAF476]
      text-[#132219]
      font-['SF Pro Display']
      font-[600]
      text-[16px] sm:text-[17px] md:text-[18px] lg:text-[20px]
      leading-normal tracking-[-0.2px]
      px-[28px] py-[12px] sm:px-[24px] sm:py-[11px] md:px-[22px] md:py-[10px]
      rounded-full border border-[#132219]
      hover:bg-[#D6FA8A] 
      transition-all duration-300
      whitespace-nowrap shadow-[0_0_15px_rgba(202,244,118,0.25)]
      min-h-[48px] sm:min-h-[44px]
      max-sm:shadow-[0_0_20px_rgba(202,244,118,0.3)]
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
