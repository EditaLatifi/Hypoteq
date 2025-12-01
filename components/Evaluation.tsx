"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";


export default function Evaluation() {
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <>
      {/* =======================
          SECTION 1: HOME EVALUATION
      ======================= */}
      <section
        className="relative bg-no-repeat bg-cover bg-center text-white px-6 md:px-[118px] pt-[200px] pb-[140px] overflow-hidden min-h-[850px] flex flex-col justify-between"
        style={{
          backgroundImage: "url('/images/HYPOTEQ_evaluation_desktop_bg.png')",
        }}
      >
        {/* Overlay (opsionale për kontrast) */}
        <div className="absolute inset-0 "></div>

        {/* Përmbajtja */}
        <div className="relative z-10 flex flex-col items-start text-left max-w-[880px] gap-[28px]">
          <h1 className="font-['SF Pro Display'] text-[#132219] text-[100px] font-[500] leading-[100%] tracking-[-1px]">
            {t("evaluation.title")}
          </h1>

          <p className="font-['SF Pro Display'] text-[#132219] text-[20px] font-[300] leading-[140%] max-w-[692px]">
            {t("evaluation.description")}
          </p>

          <button className="bg-[#132219] hover:bg-[#1C2B1F] text-white text-[20px] font-normal rounded-full px-[24px] py-[8px] w-[328px] h-[40px] flex items-center justify-center transition">
            {t("evaluation.enterAddress")}
          </button>
        </div>

        {/* Steps */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[32px] mt-[100px] text-[#132219]">
          <Step
            icon={<img src="/images/HYPOTEQ_evaluation_location_icon.svg" alt="Location" width={49} height={68} />}
            title="Address Lookup"
            text="Type your street and number; we auto-complete and pinpoint your exact property."
          />
          <Step
            icon={<img src="/images/HYPOTEQ_evaluation_property_icon.svg" alt="Property Match" width={49} height={68} />}
            title="Property match"
            text="We confirm parcel, unit, and living area from official records and maps."
          />
          <Step
            icon={<img src="/images/HYPOTEQ_evaluation_comparison_icon.svg" alt="Market Comps" width={54} height={68} />}
            title="Market comps"
            text="Recent nearby sales and active listings with similar size and features."
          />
          <Step
            icon={<img src="/images/HYPOTEQ_evaluation_invoice_icon.svg" alt="Instant Estimate" width={39} height={68} />}
            title="Instant estimate"
            text="We combine comps with local trends to calculate today's value range."
          />
        </div>
      </section>

      {/* =======================
          SECTION 2: CLARITY AT EVERY STEP
      ======================= */}
      <section className="w-full bg-white py-[100px] px-6 sm:px-[80px] md:px-[118px] font-sfpro flex flex-col items-start justify-center">
        <div className="w-full max-w-[1274px] mx-auto">
          {/* Title */}
          <h2 className="font-['SF Pro Display'] text-[#132219] text-[48px] sm:text-[56px] md:text-[64px] font-[400] leading-[140%] tracking-[-0.5px] mb-[48px]">
            From accurate home valuations to actionable financing.{" "}
            <span className="font-[600]">Clarity at every step.</span>
          </h2>

          {/* Paragraph */}
          <p className="font-['SF Pro Display'] text-[#132219] text-[18px] sm:text-[20px] md:text-[24px] font-[300] leading-[140%] max-w-[1274px]">
            See a verified value range (with a clear confidence band from local comps), explore
            rate/term trade-offs and sensitivities with side-by-side scenarios—including different
            down-payment levels—and simulate monthly costs (taxes, insurance, fees) plus amortization
            in minutes, then move forward with a customized, lender-ready plan aligned to your
            property specifics, budget, risk tolerance, cash-flow targets, goals, and closing
            timeline.
          </p>
        </div>
      </section>

      {/* =======================
          SECTION 3: BOOK CONSULTATION
      ======================= */}
      <section
        className="relative w-[1273px] h-[320px] rounded-[12px] mt-[120px] mb-[120px] overflow-hidden mx-auto 
                 flex items-center px-[60px] text-white"
        style={{
          background: "url('/images/HYPOTEQ_calc_background_alt.png') center/cover no-repeat, #132219",
        }}
      >
        <div className="absolute inset-0 bg-black/15" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-start justify-center gap-[20px]">
          <p className="text-[#CAF476] text-[22px] leading-[140%] font-[400] font-['SF Pro Display'] max-w-[640px]">
            Talk to a Hypoteq expert for a{" "}
            <span className="font-[600]">15-minute consultation</span>
            <br />
            to get personalized guidance on financing options.
          </p>

          <button
            className="px-[26px] py-[12px] bg-[#CAF476] text-[#132219] text-[15px] font-[500] 
                     rounded-full hover:bg-[#D6FA8A] transition-all"
          >
            Book your call
          </button>
        </div>
      </section>
    </>
  );
}

/* ========== Step Component ========== */
interface StepProps {
  icon: React.ReactNode;
  title: string;
  text: string;
}

function Step({ icon, title, text }: StepProps) {
  return (
    <div className="flex flex-col items-start text-left w-[191px] h-auto transition-transform duration-300 hover:translate-y-[-6px]">
      <div className="mb-[19px] min-h-[68px] flex items-center">{icon}</div>

      <h3
        className="text-[#132219] font-['SF Pro Display'] text-[20px] font-[500] leading-[140%] mb-[8px]"
        style={{
          fontStyle: "normal",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {title}
      </h3>

      <p
        className="text-[#132219] font-['SF Pro Display'] text-[16px] font-[300] leading-[140%]"
        style={{
          fontStyle: "normal",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {text}
      </p>
    </div>
  );
}
