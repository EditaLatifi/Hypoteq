"use client";
import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

interface ExpectItem {
  titleKey: string;
  textKey: string;
}

const PartnerExpectSection: React.FC = () => {
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [visibleCards, setVisibleCards] = useState<boolean[]>(
    new Array(5).fill(false)
  );

  const items: ExpectItem[] = [
    {
      titleKey: "partnerExpect.item1Title",
      textKey: "partnerExpect.item1Text",
    },
    {
      titleKey: "partnerExpect.item2Title",
      textKey: "partnerExpect.item2Text",
    },
    {
      titleKey: "partnerExpect.item3Title",
      textKey: "partnerExpect.item3Text",
    },
    {
      titleKey: "partnerExpect.item4Title",
      textKey: "partnerExpect.item4Text",
    },
    {
      titleKey: "partnerExpect.item5Title",
      textKey: "partnerExpect.item5Text",
    },
  ];

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    cardsRef.current.forEach((card, index) => {
      if (!card) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            setVisibleCards((prev) => {
              const updated = [...prev];
              updated[index] = entry.isIntersecting;
              return updated;
            });
          });
        },
        { threshold: 0.3 }
      );

      observer.observe(card);
      observers.push(observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []);

  return (
    <section className="bg-[#E6E6E6] py-[120px] mb-[120px]">
      <div className="max-w-[1579px] mx-auto px-[116px] flex justify-between items-start gap-[46px]
                 max-lg:flex-col max-lg:px-[40px] max-md:px-[24px]">
        
      {/* LEFT COLUMN — Sticky Title */}
      <div className="flex-shrink-0 sticky top-[160px] self-start">
        <h2
          className="text-[#132219] text-[48px] font-[500] leading-[100%] tracking-[-0.48px]
                     font-['SF Pro Display'] max-md:text-[36px]"
        >
          {t("partnerExpect.title")}
        </h2>
      </div>

      {/* RIGHT COLUMN — Animated Cards */}
      <div className="flex flex-col gap-[48px] max-w-[680px] w-full">
        {items.map((item, index) => {
          const isVisible = visibleCards[index];
          const isEven = index % 2 === 0;

          return (
            <div
              key={index}
              ref={(el: HTMLDivElement | null) => {
                cardsRef.current[index] = el;
              }}
              className={`bg-[#132219] rounded-[10px] p-[24px] flex flex-col gap-[24px]
                transition-all duration-[1000ms] ease-out
                ${
                  isVisible
                    ? "opacity-100 translate-x-0"
                    : isEven
                    ? "opacity-0 -translate-x-[80px]"
                    : "opacity-0 translate-x-[80px]"
                }`}
            >
              <h3 className="text-[#CAF476] text-[36px] font-[500] leading-normal font-['SF Pro Display'] max-md:text-[28px]">
                {t(item.titleKey as any)}
              </h3>
              <p className="text-[#CAF476] text-[20px] font-[400] leading-normal font-['SF Pro Display'] max-md:text-[18px]">
                {t(item.textKey as any)}
              </p>
            </div>
          );
        })}
      </div>
      </div>
    </section>
  );
};

export default PartnerExpectSection;
