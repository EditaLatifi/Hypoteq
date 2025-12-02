"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function PartnerWerdenSection() {
  const pathname = usePathname();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };
  return (
      <section
        className="
          max-w-[1379px] 
          mx-auto w-full 
          flex flex-col items-start 
          gap-8 sm:gap-10 md:gap-12 
          px-4 sm:px-6 md:px-28 
          mt-12 sm:mt-20 md:mt-28 
          mb-12 sm:mb-20 md:mb-28
        "
      >
      {/* Title */}
      <h2 className="text-[#132219] text-[32px] sm:text-[40px] md:text-[48px] font-[500] leading-[110%] md:leading-[100%] tracking-[-0.48px] font-['SF Pro Display'] text-center md:text-left">
    {t("partnerWerden.title")}
      </h2>

      {/* Subtitle */}
      <p className="hidden md:block text-[#132219] text-[16px] sm:text-[18px] md:text-[20px] font-[600] leading-[140%] md:leading-[22px] font-['SF Pro Display'] text-center md:text-left">
      {t("partnerWerden.subtitle")}
      </p>

          <p
          className="
      text-[#132219]
      font-['SF Pro Display']
      text-[18px] sm:text-[20px] md:text-[24px]
      font-[400]
      leading-[130%] md:leading-[100%]
      tracking-[-0.24px]
      mt-[32px] md:mt-[48px]
      block sm:hidden
      text-center
    "
        >
          {t("vorteile.partnerFooterText" as any)}
        </p>

      {/* Form */}
      <form className="w-full flex flex-col gap-[16px] sm:gap-[20px] md:gap-[24px]">
        {/* Top row */}
        <div className="flex flex-col md:flex-row gap-[12px] sm:gap-[17px] w-full">
          <input
            type="text"
            placeholder={t("form.firstName")}
            className="flex-1 border border-[#132219] opacity-70 rounded-[58px] px-[16px] sm:px-[20px] md:px-[24px] py-[8px] text-[#132219] text-[14px] sm:text-[15px] md:text-[16px] font-['SF Pro Display']"
          />
          <input
            type="text"
            placeholder={t("form.lastName")}
            className="flex-1 border border-[#132219] opacity-70 rounded-[58px] px-[16px] sm:px-[20px] md:px-[24px] py-[8px] text-[#132219] text-[14px] sm:text-[15px] md:text-[16px] font-['SF Pro Display']"
          />
        </div>

        {/* Middle row */}
        <div className="flex flex-col md:flex-row gap-[12px] sm:gap-[17px] w-full">
          <input
            type="email"
            placeholder={t("form.email")}
            className="flex-1 border border-[#132219] opacity-70 rounded-[58px] px-[16px] sm:px-[20px] md:px-[24px] py-[8px] text-[#132219] text-[14px] sm:text-[15px] md:text-[16px] font-['SF Pro Display']"
          />
          <input
            type="tel"
            placeholder={t("partnerWerden.phoneNumber")}
            className="flex-1 border border-[#132219] opacity-70 rounded-[58px] px-[16px] sm:px-[20px] md:px-[24px] py-[8px] text-[#132219] text-[14px] sm:text-[15px] md:text-[16px] font-['SF Pro Display']"
          />
        </div>

        {/* Message */}
        <textarea
          placeholder={t("form.message")}
          className="w-full border border-[#132219] opacity-70 rounded-[10px] px-[16px] sm:px-[20px] md:px-[24px] py-[8px] h-[110px] sm:h-[133px] text-[#132219] text-[14px] sm:text-[15px] md:text-[16px] font-['SF Pro Display']"
        ></textarea>

        {/* Footer info + button */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-[16px] sm:gap-[20px] md:gap-[24px] w-full">
          <p className="text-[#132219] opacity-60 text-[12px] sm:text-[13px] md:text-[14px] leading-[20px] sm:leading-[22px] font-[400] font-['SF Pro Display'] max-w-[1088px] text-center md:text-left">
            {t("partnerWerden.requirement")}
          </p>

          <button
            type="submit"
            className="self-center md:self-auto flex justify-center items-center px-[20px] sm:px-[24px] py-[8px] rounded-[58px] border border-[#132219] bg-[#132219] text-white font-['SF Pro Display'] text-[14px] sm:text-[15px] md:text-[16px] font-[600] hover:opacity-90 transition"
          >
            {t("form.submit")}
          </button>
        </div>
      </form>
      
    {/* ------------------------------------------------------- */}
{/* --------------------  FAQ SECTION OFF  ----------------- */}
{/* ------------------------------------------------------- */}


<div className="flex flex-col gap-[32px] mt-[120px] sm:gap-[48px] w-full">
  <h2
    id="faq"
    className="text-[#132219] text-[32px] sm:text-[48px] font-[500] leading-[110%] tracking-[-0.48px]
               font-['SF Pro Display']"
  >
    {t("partnerWerden.faqTitle")}
  </h2>

  <div className="flex flex-col gap-[20px] sm:gap-[24px] w-full">

    {[
      {
        q: t("partnerWerden.faq1Q"),
        a: t("partnerWerden.faq1A"),
      },
      {
        q: t("partnerWerden.faq2Q"),
        a: (
          <>
            {t("partnerWerden.faq2A1")}
            <br />
            {t("partnerWerden.faq2A2")}
          </>
        ),
      },
      {
        q: t("partnerWerden.faq3Q"),
        a: (
          <>
            {t("partnerWerden.faq3A1")}
            <br />
            {t("partnerWerden.faq3A2")}
          </>
        ),
      },
      {
        q: t("partnerWerden.faq4Q"),
        a: (
          <>
            {t("partnerWerden.faq4A1")}
            <br />
            {t("partnerWerden.faq4A2")}
          </>
        ),
      },
      {
        q: t("partnerWerden.faq5Q"),
        a: (
          <>
            {t("partnerWerden.faq5A1")}
            <br />
            {t("partnerWerden.faq5A2")}
            <br />
            {t("partnerWerden.faq5A3")}{" "}
            <a
              href="https://hypoteq.ch/de/partner-werden"
              target="_blank"
              className="underline"
            >
              {t("partnerWerden.faq5Link")}
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

    </section>
    
  );
}
