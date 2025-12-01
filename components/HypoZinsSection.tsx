"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function HypoZinsSection() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <section id="hypo" className="w-screen bg-[#CAF476]  mb-[200px] flex justify-center">
      {/* Inner container */}
      <div className="w-full max-w-[1579px] flex flex-col justify-center items-center py-[60px] sm:py-[80px] px-[20px] sm:px-[40px] md:px-[116px]gap-[40px] sm:gap-[48px] text-[#132219] font-['SF Pro Display']">
        {/* Top Section */}
        <div className="w-full flex flex-col md:flex-row justify-between items-start gap-[40px] sm:gap-[80px] md:gap-[201px]">
          {/* Left Side */}
          <div className="flex flex-col w-full ">
            <h2
              className="text-[#132219] font-[500] text-[32px] sm:text-[40px] md:text-[48px] leading-[110%] md:leading-[100%] tracking-[-0.48px]"
              style={{ fontFamily: "SF Pro Display" }}
            >
           {t("hypoZins.title")}
            </h2>
  <p
  className="mt-[16px] sm:mt-[20px] md:mt-[24px] text-[#132219] font-[500] text-[16px] sm:text-[20px] md:text-[24px] leading-[150%]"
  style={{ fontFamily: "SF Pro Display" }}
>
  {t("hypoZins.descriptionLine1")}
  <br />
  {t("hypoZins.descriptionLine2")}
</p>

          </div>

          {/* Right Side Form */}
          <form className="flex flex-col w-full md:w-[756px] gap-[16px] sm:gap-[20px] md:gap-[30px]">
            {/* First row */}
            <div className="flex flex-col sm:flex-row gap-[10px]">
              <input
                type="text"
                placeholder={t("form.firstName")}
                className="flex-1 bg-[#CAF476] px-[20px] py-[8px] sm:px-[24px] rounded-[58px] border border-[#132219] outline-none opacity-70 focus:opacity-100 placeholder-[#132219] placeholder:font-[600] placeholder:text-[14px] sm:placeholder:text-[16px]"
              />
              <input
                type="text"
                placeholder={t("form.lastName")}
                className="flex-1 bg-[#CAF476] px-[20px] py-[8px] sm:px-[24px] rounded-[58px] border border-[#132219] outline-none opacity-70 focus:opacity-100 placeholder-[#132219] placeholder:font-[600] placeholder:text-[14px] sm:placeholder:text-[16px]"
              />
            </div>

            {/* Second row */}
            <div className="flex flex-col sm:flex-row gap-[10px]">
              <input
                type="text"
                placeholder={t("form.phone")}
                className="flex-1 bg-[#CAF476] px-[20px] py-[8px] sm:px-[24px] rounded-[58px] border border-[#132219] outline-none opacity-70 focus:opacity-100 placeholder-[#132219] placeholder:font-[600] placeholder:text-[14px] sm:placeholder:text-[16px]"
              />
              <input
                type="email"
                placeholder={t("form.email")}
                className="flex-1 bg-[#CAF476] px-[20px] py-[8px] sm:px-[24px] rounded-[58px] border border-[#132219] outline-none opacity-70 focus:opacity-100 placeholder-[#132219] placeholder:font-[600] placeholder:text-[14px] sm:placeholder:text-[16px]"
              />
            </div>

            {/* Third row */}
            <input
              type="text"
              placeholder={t("form.mortgageType")}
              className="w-full bg-[#CAF476] px-[20px] py-[8px] sm:px-[24px] rounded-[58px] border border-[#132219] outline-none opacity-70 focus:opacity-100 placeholder-[#132219] placeholder:font-[600] placeholder:text-[14px] sm:placeholder:text-[16px]"
            />

            {/* Send Button */}
            <button
              type="submit"
              className="self-center sm:self-end px-[20px] sm:px-[24px] py-[8px] rounded-[58px] border border-[#132219] bg-[#132219] text-[#CAF476] font-[600] text-[14px] sm:text-[16px] hover:bg-[#243b2d] transition-all h-[42px] sm:h-[46px] flex items-center justify-center"
              style={{
                fontFamily: "SF Pro Display",
              }}
            >
              {t("form.send")}
            </button>
          </form>
        </div>

        {/* Bottom Info */}
   <div
  className="
    w-full flex flex-col sm:flex-row justify-center md:justify-between 
    items-center gap-[16px] sm:gap-[20px]
    text-[16px] sm:text-[20px] md:text-[24px] 
    leading-[140%] text-[#132219]
  "
  style={{
    fontFamily: '"SF Pro Display", sans-serif',
    fontWeight: 400,
  }}
>
          <div className="flex items-center gap-[16px] sm:gap-[24px]">
<img
  src="/images/HYPOTEQ_hypotheken_zins_icon.svg"
  alt="icon"
  className="w-[24px] sm:w-[28px] md:w-[32px] h-auto"
/>
            {t("hypoZins.calculateRate")}
          </div>
          <div className="flex items-center gap-[16px] sm:gap-[24px]">
<img
  src="/images/HYPOTEQ_hypotheken_zins_icon.svg"
  alt="icon"
  className="w-[24px] sm:w-[28px] md:w-[32px] h-auto"
/>
            {t("hypoZins.noObligation")}
          </div>
          <div className="flex items-center gap-[16px] sm:gap-[24px]">
            <span className="text-[#132219] text-[22px] sm:text-[26px] md:text-[28px] leading-none"><img
  src="/images/HYPOTEQ_hypotheken_zins_icon.svg"
  alt="icon"
  className="w-[24px] sm:w-[28px] md:w-[32px] h-auto"
/>
</span>
          {t("hypoZins.personalConsultation")}
          </div>
        </div>
      </div>
    </section>
  );
}
