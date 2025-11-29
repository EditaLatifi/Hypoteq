"use client";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const strategieCards = [
  {
    img: "/images/rectangle22.png",
    titleKey: "strategie.simple",
    textKey: "strategie.simpleText",
    bg: "#CAF476", 
  },
  {
    img: "/images/Rectangle1.png",
    titleKey: "strategie.swift",
    textKey: "strategie.swiftText",
    bg: "#6DA9FF", // blue
  },
  {
    img: "/images/22.png",
    titleKey: "strategie.smart",
    textKey: "strategie.smartText",
    bg: "#C4F6EF", // light green
  },
  {
    img: "/images/13.png",
    titleKey: "strategie.scalable",
    textKey: "strategie.scalableText",
    bg: "#BDE0FF", // light blue
  },
];

export default function Strategie() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  return (
    <section className="w-full px-[116px]py-[100px] bg-white font-sfpro ">
      {/* Header */}
      <div className="flex items-start justify-between mb-[75px]">
        <h2 className="font-bold text-[#132219] text-[48px] leading-[50px]">
          {t("strategie.title")}
        </h2>
        <p className="w-[766px] font-sfpro text-[#656565] ml-[155px] text-[24px] font-medium leading-[32px]">
          {t("strategie.description")}
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 gap-[15px] mb-[155px] ">
        {strategieCards.map((card, idx) => (
          <div
            key={idx}
            className="flex flex-col rounded-[10px] overflow-hidden shadow-md"
          >
            {/* Top Section with background image + color */}
            <div
              className="h-[454px] w-full bg-cover bg-center"
              style={{
                backgroundColor: card.bg,
                backgroundImage: `url(${card.img})`,
              }}
            />

            {/* Bottom Content */}
            <div className="bg-[#132219] text-white flex flex-col gap-[16px] p-[24px] h-[304px]">
              <h3 className="text-[24px] font-bold">{t(card.titleKey as any)}</h3>
              <p className="text-[14px] font-normal leading-[20px]">
                {t(card.textKey as any)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
