"use client";
import HypoZinsSection from "@/components/HypoZinsSection";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import Image from "next/image";

export default function NeueHypotheken() {
  const [active, setActive] = useState("");
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

const buttons = [
  { id: "neue", label: t("hypotheken.newMortgage") },
  { id: "refi", label: t("hypotheken.refinancing") },
  { id: "neubau", label: t("hypotheken.newConstruction") },
];


  const handleClick = (id: string) => {
    setActive(id);
    const section = document.getElementById(id);
    if (section) {
      const offset = 100;
      const top =
        section.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <>
      {/* ====== SECTION 1: Hero ====== */}
      <section className="relative w-full flex justify-center items-start bg-cover bg-center bg-no-repeat">
        <Image
          src="/images/HYPOTEQ_hypotheken_hero.png"
          alt="Hypotheken background"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover -z-10"
        />

        <div
          className="
            relative z-10 w-full max-w-[1579px]
            h-auto md:h-[957px]
            flex flex-col justify-start
            px-[16px] sm:px-[24px] md:px-[116px]
            pt-[100px] md:pt-[140px] lg:pt-[110px] pb-[20px]
            gap-[10px] text-[#FFF]
          "
        >
          <div className="flex flex-col max-w-[600px]">
            <div className="flex flex-col gap-[16px] sm:gap-[20px]">
              <h2
                className="text-[32px] sm:text-[40px] md:text-[72px] leading-[110%] md:leading-[100%] font-[500] tracking-[-0.72px]"
                style={{ fontFamily: '"SF Pro Display", sans-serif' }}
              >
                {t("hypotheken.title")}
              </h2>
            </div>

      <div className="mt-[20px] sm:mt-[40px] md:mt-[32px]">
  <p
    className="text-[15px] sm:text-[18px] md:text-[24px] font-light leading-[1.6] text-white"
    style={{
      fontFamily: '"SF Pro Display", sans-serif',
      fontWeight: 100,
      letterSpacing: "0.01em",
    }}
  >
   {t("hypotheken.description")}
  </p>


</div>

{/* ===== BUTTON GRID ===== */}
<div className="mt-[32px] max-sm:mt-[-30px]">

  {/* ALL 3 BUTTONS IN ONE ROW */}
  <div className="flex flex-wrap gap-[12px] mt-[46px] justify-center sm:justify-start">
    {buttons.map((btn) => {
      const isActive = active === btn.id;
      return (
        <button
          key={btn.id}
          onClick={() => handleClick(btn.id)}
          className={`
            font-sfpro text-[20px] font-semibold px-[28px] py-[10px]
            rounded-[45px] border border-[#fff]
            transition-all duration-300
            max-sm:text-[16px] max-sm:px-[20px] max-sm:w-full
            ${
              isActive
                ? "bg-[#CAF476] text-[#132219]"
                : "bg-transparent hover:bg-[#CAF476]/60 text-[#fff]"
            }
          `}
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

      {/* ====== SECTION 2–4 ====== */}
      <section className="max-w-[1579px] mx-auto w-full bg-white flex flex-col items-center py-[60px] md:py-[120px] px-[24px] md:px-[116px] text-[#132219] font-['SF Pro Display']">

        {/* Neue Hypothek */}
        <div
          id="neue"
          className="
            flex flex-col md:flex-row 
            justify-between 
            items-center md:items-center
            w-full max-w-[1504px] 
            mb-[80px] md:mb-[120px] 
            gap-[40px]
          "
        >
          <div className="max-w-[536px] w-full">
            <h2 className="text-[28px] md:text-[36px] font-medium leading-[140%] tracking-[-0.36px] mb-[16px] md:mb-[24px]">
             {t("hypotheken.newMortgageTitle")}
            </h2>
<p className="text-[#132219] text-[18px] md:text-[24px] font-normal leading-[140%] tracking-[-0.24px] font-sfpro">
{t("hypotheken.newMortgageDesc")}
</p>


          </div>

          <div className="w-full md:w-[537px] h-[300px] md:h-[443px] rounded-[10px] overflow-hidden flex items-center justify-center bg-[#F8F8F8]">
            <img
              src="/images/HYPOTEQ_hypotheken_feature1.png"
              alt="New Mortgage"
              className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-105"
            />
          </div>
        </div>

        {/* Refinanzierung */}
        <div
          id="refi"
          className="
            flex flex-col md:flex-row 
            justify-between 
            items-center md:items-center
            w-full max-w-[1504px] 
            mb-[60px] md:mb-[120px] 
            gap-[40px]
          "
        >
          <div className="max-w-[536px] w-full md:order-1">
            <h2 className="text-[28px] md:text-[36px] font-medium leading-[140%] tracking-[-0.36px] mb-[16px] md:mb-[24px]">
              {t("hypotheken.refinancingTitle")}
            </h2>
      <p className="text-[#132219] text-[18px] md:text-[24px] font-normal leading-[140%] tracking-[-0.24px] font-sfpro">
  {t("hypotheken.refinancingDesc")}
</p>

          </div>

          <div className="w-full md:w-[537px] h-[300px] md:h-[443px] rounded-[10px] overflow-hidden flex items-center justify-center bg-[#F8F8F8] md:order-2">
            <img
              src="/images/HYPOTEQ_hypotheken_feature2.png"
              alt="Refinance Graph"
              className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-105"
            />
          </div>
        </div>

        {/* Neubau */}
        <div
          id="neubau"
          className="
            flex flex-col md:flex-row 
            justify-between 
            items-center md:items-center
            w-full max-w-[1504px] 
            gap-[40px] mb-[80px]
          "
        >
          <div className="max-w-[536px] w-full">
            <h2 className="text-[28px] md:text-[36px] font-medium leading-[140%] tracking-[-0.36px] mb-[16px] md:mb-[24px]">
              {t("hypotheken.newConstructionTitle")}
            </h2>
            <p className="text-[#132219] text-[18px] md:text-[24px] font-normal leading-[140%] tracking-[-0.24px] font-sfpro"
>{t("hypotheken.newConstructionDesc")}

            </p>
          </div>

          <div className="w-full md:w-[537px] h-[300px] md:h-[443px] rounded-[10px] overflow-hidden flex items-center justify-center bg-[#F8F8F8]">
            <img
              src="/images/HYPOTEQ_hypotheken_feature3.png"
              alt="Neubau Graph"
              className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-105"
            />
          </div>
        </div>
      </section>
    </>
  );
}
