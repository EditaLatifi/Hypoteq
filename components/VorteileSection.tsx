"use client";
import { useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function VorteileSection() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  const cards = [
    {
      titleKey: "vorteile.card1Title",
      textKey: "vorteile.card1Text",
    },
    {
      titleKey: "vorteile.card2Title",
      textKey: "vorteile.card2Text",
    },
    {
      titleKey: "vorteile.card3Title",
      textKey: "vorteile.card3Text",
    },
    {
      titleKey: "vorteile.card4Title",
      textKey: "vorteile.card4Text",
    },
    {
      titleKey: "vorteile.card5Title",
      textKey: "vorteile.card5Text",
    },
    {
      titleKey: "vorteile.card6Title",
      textKey: "vorteile.card6Text",
    },
  ];

  const faqs = [
    { question: "Wer kann HYPOTEQ Partner werden?" },
    { question: "Welche Vorteile bietet eine Partnerschaft mit HYPOTEQ? " },
    { question: "Wie funktioniert die Zusammenarbeit?" },
    { question: "Welche Tools stehen mir als Partner zur Verfügung?" },
    {
      question:
        "Wie profitiert meine Kundschaft von der Partnerschaft mit HYPOTEQ? ",
    },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      className="max-w-[1379px] mx-auto relative w-full flex flex-col items-start gap-[120px]
      px-[24px] md:px-[116px] mt-[120px] mb-[120px]"
    >
      {/* =================== */}
      {/* Vorteile Section */}
      {/* =================== */}
      <div className="flex flex-col gap-[48px] w-full">
        <h2
          className="text-[#132219] text-[48px] font-[500] leading-[100%] tracking-[-0.48px]
               font-['SF Pro Display']"
        >
          {t("vorteile.title")}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[26px] gap-y-[48px] w-full">
          {cards.map((card, i) => (
            <div
              key={i}
              className="flex items-start gap-[16px] relative border-l-[5px] border-[#CAF476] pl-[24px] rounded-[2px]"
            >
              <div className="absolute top-[6px] left-[12px]">
                <Image
                  src="/images/MMMA.svg"
                  alt="Arrow Icon"
                  width={24}
                  height={24}
                  priority
                />
              </div>

              <div className="flex flex-col gap-[8px] mt-[40px]">
                <h3 className="text-[#132219] text-[34px] mt-[40px] font-[500] leading-normal font-['SF Pro Display']">
                  {t(card.titleKey as any)}
                </h3>
                <p className="text-[#132219] text-[22px] font-[400] mt-[32px] leading-[22px] max-w-[300px]">
                  {t(card.textKey as any)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ➤ INSERTED TEXT BELOW CARDS */}
        <p
          className="
      text-[#132219]
      font-['SF Pro Display']
      text-[24px]
      font-[400]
      leading-[100%]
      tracking-[-0.24px]
      mt-[48px]
    "
        >
          Dann trag dich ein – wir melden uns persönlich bei dir. HYPOTEQ – Dein
          Partner für smarte Immobilienfinanzierung.
        </p>
      </div>

    {/* ------------------------------------------------------- */}
{/* --------------------  FAQ SECTION OFF  ----------------- */}
{/* ------------------------------------------------------- */}

{/*
<div className="flex flex-col gap-[32px] sm:gap-[48px] w-full">
  <h2
    id="faq"
    className="text-[#132219] text-[32px] sm:text-[48px] font-[500] leading-[110%] tracking-[-0.48px]
               font-['SF Pro Display']"
  >
    Frequently Asked Questions
  </h2>

  <div className="flex flex-col gap-[20px] sm:gap-[24px] w-full">

    {[
      {
        q: "Wer kann HYPOTEQ Partner werden?",
        a: (
          <>
            Treuhänder:innen, Vermögensverwalter:innen, Makler:innen und
            Broker:innen, die ihr Angebot um professionelle Hypothekenberatung
            erweitern möchten – ganz ohne eigenen Bankenvertrag.
          </>
        ),
      },
      {
        q: "Welche Vorteile bietet eine Partnerschaft mit HYPOTEQ?",
        a: (
          <>
            Als Partner profitierst du von attraktiven Margen, einer fairen
            Provisionsstruktur, schnellen Auszahlungen, digitalen Tools sowie
            persönlichem Support – und das alles ohne Produktkonkurrenz.
            <br />
            Du stärkst deine Kundenbindung und erweiterst dein Angebot, ohne
            zusätzlichen administrativen Aufwand.
          </>
        ),
      },
      {
        q: "Wie funktioniert die Zusammenarbeit?",
        a: (
          <>
            Du bleibst im Lead: Die Kundenbeziehung gehört dir, während HYPOTEQ
            <br />
            Du führst die Beratung, wir übernehmen die Analyse, holen Offerten
            bei unseren Partnerbanken ein und begleiten dich bis zum Abschluss.
          </>
        ),
      },
      {
        q: "Welche Tools stehen mir als Partner zur Verfügung?",
        a: (
          <>
            Als Vertriebspartner kannst du über unsere Website Kreditanträge
            erfassen, den Funnel nutzen, Termine vereinbaren, Fragen stellen und
            unsere digitalen Tools wie den Hypothekenrechner oder die
            Immobilienbewertung (bereit ab Dezember 2025) verwenden – einfach,
            effizient und transparent.
            <br />
            Es gibt keinen separaten Login oder geschützten Bereich – du nutzt
            unsere Online-Tools direkt über die Website.
          </>
        ),
      },
      {
        q: "Wie profitiert meine Kundschaft von der Partnerschaft mit HYPOTEQ?",
        a: (
          <>
            Über unser Netzwerk mit mehr als 30 Kreditgebern vergleichen wir für
            deine Kund:innen die besten Finanzierungslösungen am Markt –
            <br />
            Du bleibst Hauptansprechperson und bietest echten Mehrwert, während
            wir im Hintergrund die passende Finanzierung strukturieren und
            begleiten.
            <br />
            Mehr dazu unter 
            <a
              href="https://hypoteq.ch/partner"
              target="_blank"
              className="underline"
            >
              hypoteq.ch/partner
            </a>
          </>
        ),
      },
    ].map((item, index) => {
      const isOpen = openIndex === index;

      return (
        <div key={index} className="flex flex-col w-full">

          <div
            onClick={() => toggleFAQ(index)}
            className="flex justify-between items-center border border-[#000]
            rounded-[30px] sm:rounded-[50px] py-[10px] px-[20px] cursor-pointer
            transition-all duration-300 hover:bg-[#132219]/5"
          >
            <p className="text-[20px] font-[500] tracking-[-0.32px] text-[#132219]">
              {item.q}
            </p>

            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              fill="#132219"
              viewBox="0 0 16 16"
              className={`transition-transform duration-300 ${
                isOpen ? "rotate-45" : ""
              }`}
            >
              <path d="M9.59969 6.40031V0H6.40031V6.40031H0V9.59969H6.40031V16H9.59969V9.59969H16V6.40031H9.59969Z" />
            </svg>
          </div>

          {isOpen && (
            <div
              className="mt-[12px] border border-[#132219] rounded-[16px] p-[24px]
              bg-white shadow-sm text-[18px] leading-[150%] font-light text-[#132219]"
            >
              {item.a}
            </div>
          )}
        </div>
      );
    })}
  </div>
</div>
*/}

{/* ------------------------------------------------------- */}
{/* ------------------  END FAQ COMMENT  ------------------- */}
{/* ------------------------------------------------------- */}



    </section>
  );
}
