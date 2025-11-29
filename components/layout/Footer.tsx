"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function Footer() {
  const pathname = usePathname();
  const pathLocale = pathname.split("/")[1] || "de";
  const { t } = useTranslation(pathLocale as "de" | "en" | "fr" | "it");

  return (
    <footer className="w-full bg-[#0B1C14] text-white font-sfpro">
      <div className="max-w-[1579px] mx-auto px-[24px] md:px-[60px] lg:px-[116px] pt-[40px] md:pt-[50px] lg:pt-[60px] pb-[60px] md:pb-[70px] lg:pb-[80px]">

      {/* LOGO */}
      <div className="w-full flex justify-start">
        <Image
          src="/images/whitelogo.png"
          width={168}
          height={42}
          alt="Logo"
          className="object-contain w-[120px] md:w-[140px] lg:w-[168px] h-auto"
        />
      </div>

      {/* TOP SECTION */}
      <div className="mt-[32px] md:mt-[45px] lg:mt-[60px] flex flex-col gap-[32px] md:gap-[40px] lg:gap-[48px]">

        {/* TITLE + INPUT */}
        <div className="flex flex-col md:flex-row items-start md:items-end gap-[24px] md:gap-[100px] lg:gap-[173px]">
          <h2 className="text-[28px] md:text-[34px] lg:text-[40px] font-[400] leading-[110%] md:leading-[110%] lg:leading-[110%] tracking-[-0.4px]">
            {t("footer.compareFirst")}<br />
            {t("footer.decideAfter")}
          </h2>

          {/* INPUT */}
          <div className="flex flex-col md:flex-row items-center gap-[12px] md:gap-[18px] lg:gap-[22px] w-full md:w-auto">
            <div className="flex items-center w-full md:w-[280px] lg:w-[356px] h-[44px] md:h-[42px] lg:h-[40px] rounded-[50px] bg-[#2A3B2C] px-[16px]">
              <input
                className="flex-1 bg-transparent text-white placeholder-white/70 outline-none text-[14px] md:text-[14.5px] lg:text-[15px]"
                placeholder={t("footer.newsletter")}
              />
            </div>

            <button className="w-full md:w-[140px] lg:w-[159px] h-[44px] md:h-[42px] lg:h-[40px] flex items-center justify-center bg-[#CAF476] 
              rounded-[50px] text-[#132219] font-medium md:font-medium lg:font-medium hover:opacity-90 transition text-[15px] md:text-[14.5px] lg:text-base">
              {t("buttons.sendNewsletter")}
            </button>
          </div>
        </div>

        <div className="w-full border-b border-white/40 mt-[16px] md:mt-[20px] lg:mt-[24px]"></div>
      </div>

      {/* 3 COLUMNS */}
      <div className="mt-[32px] lg:mt-[24px] flex flex-col md:grid md:grid-cols-3 md:gap-[40px] lg:flex lg:flex-row justify-start lg:gap-[200px] xl:gap-[317px] text-[15px] md:text-[16px] lg:text-[18px]">

        {/* COLUMN 1 */}
        <div className="flex flex-col gap-[16px] md:gap-[18px] lg:gap-[24px] mb-[32px] md:mb-0">
          <Link href={`/${pathLocale}`} className="hover:underline py-1">{ t("footer.homePage")}</Link>
          <Link href={`/${pathLocale}/hypotheken`} className="hover:underline py-1">
            {t("footer.hypothekenMade")}
          </Link>
          <Link href={`/${pathLocale}/documents`} className="hover:underline py-1">{t("common.documents")}</Link>
          <Link href={`/${pathLocale}/mezzanine`} className="hover:underline py-1">{t("common.mezzanine")}</Link>
        </div>

        {/* COLUMN 2 */}
        <div className="flex flex-col gap-[16px] md:gap-[18px] lg:gap-[24px] mb-[32px] md:mb-0">
          <Link href={`/${pathLocale}/about`} className="hover:underline py-1">{t("footer.aboutUs")}</Link>
          <Link href={`/${pathLocale}/contact`} className="hover:underline py-1">{t("footer.contactUs")}</Link>
          <Link href={`/${pathLocale}/partner`} className="hover:underline py-1">{t("footer.becomePartner")}</Link>
          <Link href={`/${pathLocale}/impressum`} className="hover:underline py-1">{t("footer.impressumData")}</Link>
        </div>

        {/* COLUMN 3 */}
        <div className="flex flex-col gap-[16px] md:gap-[18px] lg:gap-[24px]">
          <Link href={`/${pathLocale}/calc`} className="hover:underline py-1">{t("footer.mortgageCalc")}</Link>
          <Link href={`/${pathLocale}/faq`} className="hover:underline py-1">{t("footer.faqTitle")}</Link>
          <Link href={`/${pathLocale}/advisory`} className="hover:underline py-1">{t("footer.hypoteqAdvisory")}</Link>
          <Link
            href="https://www.linkedin.com/company/hypoteq-ag/"
            target="_blank"
            className="hover:underline py-1"
          >
            {t("footer.news")}
          </Link>
        </div>

      </div>
      </div>

    </footer>
  );
}
