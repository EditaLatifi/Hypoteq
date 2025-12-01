"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const logos = [
  { name: "UBS", img: "/images/HYPOTEQ_home_bank_ubs.svg" },
  { name: "Zürcher Kantonalbank", img: "/images/HYPOTEQ_home_bank_zkb.png" },
  { name: "Bank Cler", img: "/images/HYPOTEQ_home_bank_cler.png" },
  { name: "Raiffeisen", img: "/images/HYPOTEQ_home_bank_raiffeisen.png" },
  { name: "SNB BNS", img: "/images/HYPOTEQ_home_bank_snb.svg" },
];

const PartnersSection: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  return (
    <section className="py-[60px] md:py-[120px] bg-white overflow-hidden w-full">

      {/* TITLE — ONLY THIS HAS 116PX */}
      <h2
        className="font-sfpro mb-[32px] md:mb-[48px] px-[20px] md:px-[116px]"
        style={{
          color: "var(--Secondary-Color, #132219)",
          fontFamily: '"SF Pro Display", sans-serif',
          fontSize: "39px",
          fontWeight: 500,
          lineHeight: "140%",
        }}
      >
        {t("partners.title")}
      </h2>

      {/* FULL WIDTH SCROLLING WRAPPER */}
      <div className="w-full overflow-hidden">

        <div className="flex flex-col gap-[32px] md:gap-[48px] w-full">
          
          {/* ROW 1 */}
          <div className="relative flex overflow-hidden w-full">
            <div className="animate-scroll-left flex items-center gap-[32px] md:gap-[48px] whitespace-nowrap px-[16px]">
              {[...logos, ...logos].map((partner, index) => (
                <img
                  key={`row1-${index}`}
                  src={partner.img}
                  alt={partner.name}
                  className="h-[32px] md:h-[42px] object-contain"
                />
              ))}
            </div>
          </div>

          {/* ROW 2 */}
          <div className="relative flex overflow-hidden w-full">
            <div className="animate-scroll-right flex items-center gap-[32px] md:gap-[48px] whitespace-nowrap px-[16px]">
              {[...logos, ...logos].map((partner, index) => (
                <img
                  key={`row2-${index}`}
                  src={partner.img}
                  alt={partner.name}
                  className="h-[32px] md:h-[42px] object-contain"
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      <style jsx>{`
        @keyframes scrollLeft {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes scrollRight {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(0);
          }
        }

        .animate-scroll-left {
          animation: scrollLeft 25s linear infinite;
        }

        .animate-scroll-right {
          animation: scrollRight 25s linear infinite;
        }

        .animate-scroll-left:hover,
        .animate-scroll-right:hover {
          animation-play-state: paused;
        }
      `}</style>

    </section>
  );
};

export default PartnersSection;
