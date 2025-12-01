"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const StatsSection: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <section className="w-full bg-white py-[60px] md:py-[90px] lg:py-[120px] flex flex-col items-center text-[#132219]">
      
      {/* Title */}
<div className="w-full max-w-[1579px] px-[20px] md:px-[60px] lg:px-[116px] mx-auto">
        <h2
          className="
            font-sfpro text-[#132219]
            text-[32px] md:text-[48px] lg:text-[64px] leading-[140%] font-normal
          "
        >
          {t("stats.title")}
        </h2>

        <p
          className="
            mt-[32px] font-sfpro text-[18px] md:text-[21px] lg:text-[24px] font-light leading-[140%]
          "
        >
          {t("stats.description")}
        </p>
      </div>

  {/* Stats */}
<div
  className="
    w-full max-w-[1579px] px-[20px] md:px-[60px] lg:px-[116px] mx-auto
    mt-[40px] md:mt-[60px] lg:mt-[80px] mb-[40px] md:mb-[60px] lg:mb-[80px]
    grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[32px] md:gap-[36px] lg:gap-[40px]
  "
>
  {[
    {
      titleKey: "stats.stat1Title",
      descKey: "stats.stat1Desc",
    },
    {
      titleKey: "stats.stat2Title",
      descKey: "stats.stat2Desc",
    },
    {
      titleKey: "stats.stat3Title",
      descKey: "stats.stat3Desc",
    },
    {
      titleKey: "stats.stat4Title",
      descKey: "stats.stat4Desc",
    },
  ].map((item, idx) => (
    <div key={idx} className="flex flex-col gap-[12px]">

      <h3
        className="
          font-sfpro text-[32px] md:text-[40px] lg:text-[48px] font-normal leading-[140%]
        "
      >
        {t(item.titleKey as any)}
      </h3>

      <p
        className="
          font-sfpro text-[18px] md:text-[19px] lg:text-[20px] font-light leading-[150%]
          max-w-[400px] lg:max-w-full
        "
      >
        {t(item.descKey as any)}
      </p>


    </div>
  ))}
</div>


      {/* Image */}
      <div className="w-full max-w-[1579px] px-[20px] md:px-[60px] lg:px-[116px] mx-auto h-[160px] md:h-[220px] lg:h-[278px] rounded-[10px] overflow-hidden">
        <img
          src="/images/HYPOTEQ_about_stats_visual.png"
          alt="Modern houses"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Unsere DNA */}
      <div className="w-full flex flex-col items-center mt-[80px] md:mt-[100px] lg:mt-[120px]">
        <div className="w-full max-w-[1390px] px-[20px] md:px-[60px] lg:px-[116px] mx-auto flex flex-col gap-[40px]">

          {/* Title */}
          <h2
            id="dna"
            className="
              font-sfpro text-[28px] md:text-[34px] lg:text-[40px] font-medium text-[#132219]
            "
          >
            {t("dna.title")}
          </h2>

          {/* Paragraph */}
          <p
            className="
              font-sfpro text-[18px] md:text-[21px] lg:text-[24px] font-light leading-[140%]
              text-[#132219] max-w-[1280px]
            "
          >
            {t("dna.description")}
          </p>

          {/* Grid */}
          <div
            className="
              grid grid-cols-1 md:grid-cols-2 gap-x-[60px] md:gap-x-[80px] lg:gap-x-[100px] gap-y-[60px] md:gap-y-[70px] lg:gap-y-[80px]
            "
          >
            {
            [
  {
    icon: "/images/HYPOTEQ_about_mission_icon.svg",
    titleKey: "dna.missionTitle",
    descKey: "dna.missionDesc",
  },
  {
    icon: "/images/HYPOTEQ_about_vision_icon.svg",
    titleKey: "dna.visionTitle",
    descKey: "dna.visionDesc",
  },
  {
    icon: "/images/HYPOTEQ_about_values_icon.svg",
    titleKey: "dna.valuesTitle",
    descKey: "dna.valuesDesc",
  },
  {
    icon: "/images/HYPOTEQ_about_team_icon.svg",
    titleKey: "dna.driveTitle",
    descKey: "dna.driveDesc",
  },
]

            
            .map((item, idx) => (
              <div key={idx} className="flex flex-col gap-[24px] md:gap-[28px] relative pl-[42px]">
                <img
                  src={item.icon}
                  alt={item.titleKey}
                  className="w-[28px] h-[28px] md:w-[32px] md:h-[32px] absolute left-0 top-[4px]"
                />
                <div className="flex flex-col gap-[14px] md:gap-[16px]">
                  <h3 className="font-sfpro text-[24px] md:text-[26px] lg:text-[28px] font-semibold text-[#132219]">
                    {t(item.titleKey as any)}
                  </h3>

                  <div className="flex gap-[16px] md:gap-[20px]">
                    <div className="w-[12px] md:w-[15px] bg-[#CAF476] rounded-[2px]" />

                    <p className="font-sfpro text-[18px] md:text-[19px] lg:text-[20px] leading-[160%] font-light text-[#132219]">
                      {t(item.descKey as any)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

    </section>
  );
};

export default StatsSection;
