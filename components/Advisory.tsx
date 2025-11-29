"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import ConsultationBanner from "./ConsultationBanner";

interface Card {
  title: string;
  text: string;
}

export default function Advisory() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  const cards: Card[] = [
    {
      title: t("advisory.card1"),
      text: t("advisory.card1Text"),
    },
    {
      title: t("advisory.card2"),
      text: t("advisory.card2Text"),
    },
    {
      title: t("advisory.card3"),
      text: t("advisory.card3Text"),
    },
    {
      title: t("advisory.card4"),
      text: t("advisory.card4Text"),
    },
  ];

  return (
    <>
      {/* ======================= */}
      {/* SECTION 1: ADVISORY HERO */}
      {/* ======================= */}
      <section
        className="
          relative w-full min-h-[50vh] flex justify-center mb-[120px] items-center overflow-hidden 
          font-sfpro 
          px-[16px] sm:px-[24px] md:px-[116px]lg:px-[116px]xl:px-[116px]2xl:px-[116px]
          text-[#132219]
        "
      >
        <Image
          src="/images/09.png"
          alt="Advisory background"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover object-right -z-10"
        />

        <div className="w-full max-w-[1320px] mx-auto flex flex-col justify-center items-start mt-[80px] sm:mt-[100px] py-[60px] sm:py-[116px]">
          <div className="flex flex-col items-start gap-[16px] sm:gap-[24px] max-w-[650px]">
            <h1
              className="text-[48px] sm:text-[72px] md:text-[100px] font-[500] leading-[100%] tracking-[-1px]"
              style={{ fontFamily: '"SF Pro Display", sans-serif' }}
            >
              {t("advisory.title")}
            </h1>

            <p
              className="text-[18px] sm:text-[24px] mt-[16px] sm:mt-[32px] leading-[140%]"
              style={{ fontFamily: '"SF Pro Display", sans-serif' }}
            >
              {t("advisory.description")}
            </p>
          </div>

          {/* BUTTONS */}
          <div className="flex flex-col mt-[48px] sm:mt-[80px] gap-[16px] sm:gap-[24px]">
       <div className="flex flex-col gap-[16px]">
  
  {/* RRESHTI 1 – dy butonat */}
  <div className="flex flex-wrap gap-[12px] sm:gap-[24px]">
    <a
      href="#expectations"
      className="border border-[#132219] rounded-full px-[20px] sm:px-[24px] py-[6px] sm:py-[8px]
        text-[18px] sm:text-[20px] font-[600] text-[#132219]
        bg-transparent hover:bg-[#CAF476]/50 transition-all"
    >
    {t("advisory.examples")}
    </a>

    <a
      href="#benefits"
      className="border border-[#132219] rounded-full px-[20px] sm:px-[24px] py-[6px] sm:py-[8px]
        text-[18px] sm:text-[20px] font-[600] text-[#132219]
        bg-transparent hover:bg-[#CAF476]/50 transition-all"
    >
      {t("advisory.process")}
    </a>
  </div>


</div>

          </div>
        </div>
      </section>

      {/* ======================= */}
      {/* SECTION 2: CARDS */}
      {/* ======================= */}
      <section
        id="expectations"
        className="
          w-full bg-white 
          py-[48px] sm:py-[80px] mb-[120px]
          px-[16px] sm:px-[24px] md:px-[116px]lg:px-[116px]xl:px-[116px]2xl:px-[116px]
          font-sfpro flex flex-col items-center justify-center
        "
      >
        <div className="w-full max-w-[1300px] grid grid-cols-1 sm:grid-cols-2 gap-[24px] sm:gap-[40px] lg:gap-[48px]">
          {cards.map((card, index) => (
            <div
              key={index}
              className="
                border border-black rounded-[10px]
                flex flex-col items-start
                p-[16px] sm:p-[28px_32px_36px_32px]
                gap-[16px] sm:gap-[24px] md:gap-[32px]
                bg-white hover:bg-[#CAF476]/50 transition-all
              "
            >
              <h3
                className="text-[#132219] font-[500] text-[28px] sm:text-[40px] md:text-[48px] leading-[140%]"
                style={{ fontFamily: '"SF Pro Display", sans-serif' }}
              >
                {card.title}
              </h3>

              <p
                className="text-[#132219] font-[300] text-[16px] sm:text-[20px] md:text-[24px] leading-[140%]"
                style={{ fontFamily: '"SF Pro Display", sans-serif' }}
              >
                {card.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ======================= */}
      {/* SECTION 3: PROCESS */}
      {/* ======================= */}
      <section
        id="benefits"
        className="
          w-full bg-[#132219] max-w-[1379px] mx-auto
          flex flex-col items-start 
          px-[16px] sm:px-[24px] md:px-[116px]mb-[120px] lg:px-[116px]xl:px-[116px]2xl:px-[116px]
          py-[48px] font-sfpro
        "
      >
        <h2
          className="text-[#CAF476] text-[32px] sm:text-[48px] font-[500] mb-[32px] sm:mb-[48px]"
          style={{ fontFamily: '"SF Pro Display", sans-serif' }}
        >
          {t("advisory.processTitle")}
        </h2>

        <div className="flex flex-col sm:flex-row justify-center items-stretch gap-[16px] sm:gap-[19px] w-full">
          {[
            {
              number: "1",
              text: t("advisory.step1"),
              button: true,
            },
            {
              number: "2",
              text: t("advisory.step2"),
            },
            {
              number: "3",
              text: t("advisory.step3"),
            },
          ].map((box, index) => (
            <div
              key={index}
              className="flex flex-col w-full sm:w-[412px] bg-[#CAF476] border border-[#132219] rounded-[10px] px-[20px] sm:px-[24px] py-[24px]"
            >
              <span
                className="text-[56px] sm:text-[80px] font-[500] leading-[140%] text-[#132219] mb-[32px] sm:mb-[68px]"
                style={{ fontFamily: '"SF Pro Display", sans-serif' }}
              >
                {box.number}
              </span>

              <p
                className="text-[22px] sm:text-[32px] font-[500] leading-[140%] text-[#132219] flex-1"
                style={{ fontFamily: '"SF Pro Display", sans-serif' }}
              >
                {box.text}
              </p>

              {box.button && (
          <Link href={`/${pathLocale}/contact`}>
  <button className="mt-[24px] bg-[#132219] text-[#CAF476] px-[16px] py-[6px] rounded-full text-[16px] sm:text-[18px] font-[500] hover:opacity-80 transition-all w-fit">
    {t("buttons.bookAppointment")}
  </button>
</Link>
              )}
            </div>
          ))}
        </div>


      </section>

      <div className="mb-[200px] sm:mb-[180px]">
        <ConsultationBanner />
      </div>
    </>
  );
}
