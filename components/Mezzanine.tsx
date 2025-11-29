"use client";
import Image from "next/image";
import { useState } from "react";
import ConsultationBanner from "./ConsultationBanner";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function Mezzanine() {
  const [active, setActive] = useState("");
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  const buttons = [
    { id: "neue", label: t("mezzanine.whatIs") },
    { id: "refi", label: t("mezzanine.whenUseful") },
    { id: "neubau", label: t("mezzanine.howWorks") },
    { id: "gemeinsam", label: t("mezzanine.makePossible") },
  ];

  const handleClick = (id: string) => {
    setActive(id);
    const section = document.getElementById(id);
    if (section) {
      const offset = 100;
      const top = section.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <>
      {/* =======================
          SECTION 1: HERO
      ======================= */}
      <section className="relative w-full  px-[16px] sm:px-[32px] md:px-[116px]flex justify-center items-start bg-cover bg-center bg-no-repeat">
        <Image
          src="/images/FOtototo.png"
          alt="Mezzanine background"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover -z-10"
        />

        <div
          className="relative z-10 w-full max-w-[1370px] mx-auto h-[auto] md:h-[957px] flex flex-col justify-start
           pt-[100px] pb-[20px] md:pt-[180px] gap-[10px] text-[#132219]"
        >
          <div className="flex flex-col max-w-[692px]">
 <h2
  className="text-[36px] sm:text-[42px] md:text-[72px] leading-[110%] font-[500] tracking-[-0.72px]"
  style={{ fontFamily: '"SF Pro Display", sans-serif' }}
>
  {t("mezzanine.title")}
</h2>

<p
  className="mt-[20px] sm:mt-[24px] text-[18px] sm:text-[20px] md:text-[24px] leading-[140%] font-[400]"
  style={{ fontFamily: '"SF Pro Display", sans-serif' }}
>
  {t("mezzanine.subtitle")}
</p>

<p
  className="mt-[20px] sm:mt-[28px] text-[18px] sm:text-[20px] md:text-[24px] leading-[150%] font-[400]"
  style={{ fontFamily: '"SF Pro Display", sans-serif' }}
>
  {t("mezzanine.description")}
</p>


            <div className="flex flex-col gap-[16px] sm:gap-[24px] mt-[40px] sm:mt-[60px] md:mt-[80px]">
              <div className="flex flex-wrap gap-[8px] sm:gap-[10px]">
                {buttons.slice(0, 2).map((btn) => {
                  const isActive = active === btn.id;
                  return (
                    <button
                      key={btn.id}
                      onClick={() => handleClick(btn.id)}
                      className={`rounded-[40px] text-[16px] sm:text-[18px] md:text-[20px] font-[600] font-['SF Pro Display']
                        border-2 border-[#132219] px-[16px] sm:px-[20px] md:px-[24px] py-[6px] sm:py-[8px] transition-all duration-300
                        ${
                          isActive
                            ? "bg-[#CAF476] text-[#132219]"
                            : "bg-transparent text-[#132219] hover:bg-[#CAF476]/60"
                        }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-[8px] sm:gap-[10px]">
                {buttons.slice(2).map((btn) => {
                  const isActive = active === btn.id;
                  return (
                    <button
                      key={btn.id}
                      onClick={() => handleClick(btn.id)}
                      className={`rounded-[40px] text-[16px] sm:text-[18px] md:text-[20px] font-[600] font-['SF Pro Display']
                        border-2 border-[#132219] px-[16px] sm:px-[20px] md:px-[24px] py-[6px] sm:py-[8px] transition-all duration-300
                        ${
                          isActive
                            ? "bg-[#CAF476] text-[#132219]"
                            : "bg-transparent text-[#132219] hover:bg-[#CAF476]/60"
                        }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =======================
          SECTION 2: DETAILS
      ======================= */}
<section className="mx-auto w-full bg-white flex flex-col items-center 
py-[60px] md:py-[120px] 
px-[16px] sm:px-[32px] max-w-[1579px]
 md:px-[116px]
text-[#132219] font-['SF Pro Display']">

        {/* SECTION 1 */}
        <div id="neue" className="flex flex-col md:flex-row items-center justify-between w-full max-w-[1504px] gap-[40px] sm:gap-[60px] md:gap-[199px] mb-[60px] md:mb-[120px] pb-[20px]">
          <div className="max-w-full md:max-w-[536px] text-center md:text-left w-full">
            <h2 className="text-[22px] sm:text-[28px] md:text-[36px] font-[500] mb-[16px]">{t("mezzanine.whatIs")}</h2>
            <p className="text-[16px] sm:text-[18px] md:text-[24px] font-[300] leading-[150%]">
              {t("mezzanine.whatIsDesc")}
            </p>
          </div>
          <div className="w-full sm:w-[380px] md:w-[538px] flex justify-center">
            <img src="/images/109.png" alt={t("mezzanine.whatIs")} className="w-full max-w-[340px] sm:max-w-[420px] md:max-w-none h-auto object-contain" />
          </div>
        </div>

        {/* SECTION 2 */}
        <div id="refi" className="flex flex-col md:flex-row items-center justify-between w-full max-w-[1504px] gap-[40px] sm:gap-[60px] md:gap-[199px] mb-[60px] md:mb-[120px] pb-[20px]">
          <div className="max-w-full md:max-w-[536px] md:order-1 text-center md:text-left w-full">
            <h2 className="text-[22px] sm:text-[28px] md:text-[36px] font-[500] mb-[16px]">{t("mezzanine.whenUseful")}</h2>
            <ul className="text-[16px] sm:text-[18px] md:text-[24px] font-[300] leading-[150%] list-disc pl-[20px]">
              <li>{t("mezzanine.whenUsefulItem1")}</li>
              <li>{t("mezzanine.whenUsefulItem2")}</li>
              <li>{t("mezzanine.whenUsefulItem3")}</li>
            </ul>
          </div>
          <div className="w-full sm:w-[380px] md:w-[538px] flex justify-center md:order-2">
            <img src="/images/Kalendar.png" alt="Closing Day Kalender" className="w-full max-w-[340px] sm:max-w-[420px] md:max-w-none h-auto object-contain" />
          </div>
        </div>

        {/* SECTION 3 */}
        <div id="neubau" className="flex flex-col md:flex-row items-center justify-between w-full max-w-[1504px] gap-[40px] sm:gap-[60px] md:gap-[199px] mb-[60px] md:mb-[120px] pb-[20px]">
          <div className="max-w-full md:max-w-[536px] text-center md:text-left w-full">
            <h2 className="text-[22px] sm:text-[28px] md:text-[36px] font-[500] mb-[16px]">{t("mezzanine.howWorks")}</h2>
            <p className="text-[16px] sm:text-[18px] md:text-[24px] font-[300] leading-[150%] mb-[12px]">{t("mezzanine.howWorksIntro")}</p>
            <ul className="text-[16px] sm:text-[18px] md:text-[24px] font-[300] leading-[150%] list-disc pl-[20px]">
              <li>{t("mezzanine.howWorksItem1")}</li>
              <li>{t("mezzanine.howWorksItem2")}</li>
              <li>{t("mezzanine.howWorksItem3")}</li>
              <li>{t("mezzanine.howWorksItem4")}</li>
              <li>{t("mezzanine.howWorksItem5")}</li>
            </ul>
          </div>
          <div className="w-full sm:w-[380px] md:w-[538px] flex justify-center">
            <img src="/images/7777.png" alt="Projekt Risiko Zeithorizont" className="w-full max-w-[340px] sm:max-w-[420px] md:max-w-none h-auto object-contain" />
          </div>
        </div>

        {/* SECTION 4 */}
        <div id="gemeinsam" className="flex flex-col md:flex-row items-center justify-between w-full max-w-[1504px] gap-[40px] sm:gap-[60px] md:gap-[199px] pb-[20px]">
          <div className="max-w-full md:max-w-[536px] text-center md:text-left w-full">
            <h2 className="text-[22px] sm:text-[28px] md:text-[36px] font-[500] mb-[16px]">{t("mezzanine.makePossible")}</h2>
            <p className="text-[16px] sm:text-[18px] md:text-[24px] font-[300] leading-[150%]">
              {t("mezzanine.makePossibleDesc")}
            </p>
          </div>
          <div className="w-full sm:w-[380px] md:w-[538px] flex justify-center">
            <img src="/images/58965552.png" alt="Features Graph" className="w-full max-w-[340px] sm:max-w-[420px] md:max-w-none h-auto object-contain" />
          </div>
        </div>
      </section>

      <div className="mb-[100px] sm:mb-[140px] md:mb-[180px]">
        <ConsultationBanner />
      </div>
    </>
  );
}
