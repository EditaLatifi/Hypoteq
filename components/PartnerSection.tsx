"use client";
import { useState } from "react";
import Image from "next/image";
import PartnerExpectSection from "@/components/PartnerExpectSection";
import VorteileSection from "./VorteileSection";
import PartnerWerdenSection from "./PartnerWerdenSection";
import Banner from "./Banner";

import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function PartnerSection() {
  const [active, setActive] = useState("");
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  const buttons = [
    { id: "neue", label: t("partner.expectations") },
    { id: "refi", label: t("partner.benefitsOverview") },
    { id: "neubau", label: t("common.faq") },
    { id: "partner", label: t("common.partner") },
  ];

const handleClick = (id: string) => {
  setActive(id);

  // If Neubau → Scroll to FAQ
  if (id === "neubau") {
    const faqSection = document.getElementById("faq");
    if (faqSection) {
      const offset = 120;
      const top =
        faqSection.getBoundingClientRect().top +
        window.scrollY -
        offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    return;
  }

  // Normal scroll for others
  const section = document.getElementById(id);
  if (section) {
    const offset = 120;
    const top = section.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }
};


  return (
    <>
      {/* HERO SECTION */}
      <section className="relative w-full overflow-hidden font-sfpro">
        <Image
          src="/images/98.png"
          alt="Partner background"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover -z-10"
        />

        <div className="
            relative z-10 w-full h-auto md:h-[957px]
            flex flex-col justify-start
            px-[20px] sm:px-[40px] md:px-[116px]
            pt-[100px] pb-[40px] sm:pt-[110px] md:pt-[110px] sm:pb-[60px]
            text-[#132219] max-w-[1579px] mx-auto
          "
        >
          <h2 className="max-w-full sm:max-w-[700px] text-[36px] sm:text-[56px] md:text-[100px] font-[500] leading-[110%] tracking-[-0.5px] sm:tracking-[-1px] break-words">
          
            <span className="block md:inline"> {t("footer.becomePartner")}</span>
          </h2>

          <p className="mt-[16px] sm:mt-[24px] text-[18px] sm:text-[22px] md:text-[24px] leading-[140%]">
            {t("partner.growWithUs")}
          </p>

          <p className="mt-[20px] sm:mt-[32px] text-[16px] sm:text-[20px] md:text-[24px] leading-[150%] max-w-full sm:max-w-[850px]">
            {t("partner.intro1")}<br className="hidden sm:block" />
            {t("partner.intro2")}<br className="hidden sm:block" />
            {t("partner.intro3")}
          </p>

          {/* BUTTONS */}
          <div className="flex flex-col gap-[20px] mt-[40px] sm:mt-[70px]">
            <div className="flex flex-wrap gap-[10px]">
              {buttons.slice(0, 2).map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => handleClick(btn.id)}
                  className={`
                    rounded-[45px] text-[16px] sm:text-[18px] md:text-[20px]
                    font-[600] border-2 border-[#132219]
                    px-[18px] sm:px-[24px] py-[6px] sm:py-[8px]
                    transition-all duration-300
                    ${
                      active === btn.id
                        ? "bg-[#CAF476] text-[#132219]"
                        : "bg-transparent hover:bg-[#CAF476]/60"
                    }
                  `}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-[10px]">
              {buttons.slice(2).map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => handleClick(btn.id)}
                  className={`
                    rounded-[45px] text-[16px] sm:text-[18px] md:text-[20px]
                    font-[600] border-2 border-[#132219]
                    px-[18px] sm:px-[24px] py-[6px] sm:py-[8px]
                    transition-all duration-300
                    ${
                      active === btn.id
                        ? "bg-[#CAF476] text-[#132219]"
                        : "bg-transparent hover:bg-[#CAF476]/60"
                    }
                  `}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
<div id="neue">
  <PartnerExpectSection />
</div>

<div id="refi">
  <VorteileSection />
</div>

<div id="partner">
  <PartnerWerdenSection />
</div>


      <div className="mb-[200px] md:mb-[180px]">
        <Banner />
      </div>
    </>
  );
}
 