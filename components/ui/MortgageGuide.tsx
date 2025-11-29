"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const MortgageGuide: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  return (
    <section
      className="relative w-full mt-[120px] md:mb-[116px] h-[384px] flex items-center justify-center max-sm:h-[340px]"
      style={{
        background: "url('/images/foto12345.png') center/cover no-repeat",
      }}
    >
      {/* Overlay */}
      <div className="absolute " />

      {/* Content */}
      <div
        className="
          relative flex justify-between items-center w-[1506px] 
          px-[116px]py-[48px] text-white
          max-sm:w-full max-sm:flex-col max-sm:items-center max-sm:justify-center
          max-sm:px-[28px] max-sm:py-[40px] max-sm:text-center
        "
      >
        {/* Text */}
        <div
          className="
            flex flex-col items-start justify-center gap-[48px]
            max-w-[560px]
            max-sm:items-center max-sm:justify-center max-sm:gap-[12px]
          "
        >
          <h2
            className="
              font-sfpro text-[40px] font-[500] leading-[140%]
              max-sm:text-[24px] max-sm:leading-[130%] max-sm:tracking-tight
            "
          >
            {t("mortgageGuide.title")}
          </h2>

          <p
            className="
              font-['SF Pro Display']
              text-white
              font-[300]
              text-[25px] sm:text-[20px]
              leading-[140%] opacity-90
              tracking-[0.01em]
              max-sm:text-[15px] max-sm:leading-[135%]
              max-sm:max-w-[330px] max-sm:opacity-95
            "
          >
            {t("mortgageGuide.description")}
          </p>
        </div>

        {/* Arrow */}
        <button
          className="
            relative z-10 flex items-center justify-center 
            transition-transform hover:translate-x-[6px]
            max-sm:mt-[26px] max-sm:w-[56px] max-sm:h-[56px]
            max-sm:rounded-full max-sm:bg-white/15 max-sm:backdrop-blur-sm
            max-sm:hover:bg-white/25 max-sm:shadow-lg
          "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="55"
            height="32"
            viewBox="0 0 20 34"
            fill="none"
            className="max-sm:w-[28px] max-sm:h-[28px]"
          >
            <path
              d="M19.3146 16.5258C19.3154 17.2725 19.0576 17.9334 18.5412 18.5083L4.76965 32.3085C4.19578 32.8261 3.53547 33.0852 2.78874 33.086C2.042 33.0868 1.38116 32.829 0.806212 32.3126C0.288644 31.7387 0.0294751 31.0784 0.0287 30.3317C0.027925 29.585 0.285723 28.9241 0.802098 28.3492L12.6802 16.5327L0.777595 4.74087C0.260028 4.167 0.000858384 3.50669 8.33495e-05 2.75996C-0.000691685 2.01322 0.257106 1.35238 0.773482 0.777434C1.34736 0.259867 2.00766 0.000697485 2.7544 -7.75502e-05C3.50113 -0.000852586 4.16197 0.256946 4.73692 0.773321L18.5371 14.5449C19.0547 15.1188 19.3138 15.7791 19.3146 16.5258Z"
              fill="white"
            />
          </svg>
        </button>
      </div>
    </section>
  );
};

export default MortgageGuide;
