"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function HomeEvaluation() {
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <section
      className="
        relative bg-no-repeat text-white 
        px-4 sm:px-8 md:px-[118px]
        py-[48px] md:py-[60px]
        overflow-hidden

        bg-[url('/images/999.png')]
        md:bg-[url('/images/vV_.png')]
        bg-cover bg-center
      "
    >
      {/* Content */}
      <div className="max-w-[720px]">
        <h1
          className="
            font-['SF Pro Display']
            text-[#132219]
            font-[500]
            text-[40px] sm:text-[48px] md:text-[56px]
            leading-[140%]
            tracking-[-0.4px]
            mb-4 sm:mb-5
          "
        >
  {t("homeEvaluation.title")}
        </h1>

    <p
  className="
    font-['SF Pro Display']
    text-[#132219]
    font-[300]
    text-[22px] sm:text-[20px]
    leading-[140%]
    max-w-[92%] md:max-w-none
    mb-6 sm:mb-8
  "
>
{t("homeEvaluation.description")}
</p>

<button
  className="
    bg-[#132219]
    text-white
    font-['SF Pro Display']
        font-[300]

    text-[20px]
    leading-[140%]
    rounded-[58px]
    flex items-center justify-center
    px-[32px] py-[8px]
    hover:opacity-90 transition-all duration-200
  "
>
  {t("homeEvaluation.startButton")}
</button>


      </div>

      {/* Steps */}
      <div
        className="
          mt-[13x] md:mt-[110px]
          grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4
          gap-x-[155px] gap-y-[50px]
          text-[#132219]
          place-items-start
        "
      >
        <Step
          icon={<img src="/images/Lokacion.svg" className="w-[35px] h-[68px]" />}
          title="Address Lookup"
  text={`Type your street and number; we auto-complete and pin your exact property.`}
        />
        <Step
          icon={<img src="/images/Shpia.svg" className="w-[49px] h-[68px]" />}
          title="Property match"
            text={`We confirm parcel, unit, and living area      from official records\n and maps.`}
        />
        <Step
          icon={<img src="/images/ShpiPare.svg" className="w-[54px] h-[68px]" />}
          title="Market comps"
            text={`Recent nearby sales and\n active listings with similar size and features.`}
  
        />
        <Step
          icon={<img src="/images/Faktura.svg" className="w-[39px] h-[68px]" />}
          title="Instant estimate"
       text={`We combine comps with local trends to calculate today's value range.`}
        />
      </div>
    </section>
  );
}

interface StepProps {
  icon: React.ReactNode;
  title: string;
  text: string;
}
function Step({ icon, title, text }: StepProps) {
  return (
    <div
      className="
        flex flex-col
        sm:items-start items-center
        text-center sm:text-left
        w-full max-w-none
      "
    >
      <div className="mb-4">{icon}</div>

      <h3
        className="
          font-['SF Pro Display']
          text-[20px]
          font-[500]
          leading-[140%]
          text-[#132219]
          mb-5
        "
      >
        {title}
      </h3>

      <p
        className="
          font-['SF Pro Display']
          text-[14px] sm:text-[16px]
          leading-[150%] font-[300]
          whitespace-pre-line
        "
      >
        {text}
      </p>
    </div>
  );
}
