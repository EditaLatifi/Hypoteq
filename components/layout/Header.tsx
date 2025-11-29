"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { useTranslation } from "@/hooks/useTranslation";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openLang, setOpenLang] = useState(false);
  const { locale, setLocale } = useLanguage();
  const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  const whiteMenu =
    (pathname.includes("/hypotheken") || pathname.includes("/about")) && !isScrolled;

  // Sync context locale with URL locale on mount
  useEffect(() => {
    if (pathLocale !== locale) {
      setLocale(pathLocale);
    }
  }, [pathLocale, locale, setLocale]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSelect = (lang: "de" | "en" | "fr" | "it") => {
    setLocale(lang);
    // Navigate to the same page but with new locale
    const currentPath = pathname.replace(`/${pathLocale}`, "");
    router.push(`/${lang}${currentPath}`);
    setOpenLang(false);
  };

  return (
    <header
      className={`fixed top-0 left-0 z-50 w-full font-sfpro transition-all duration-300 ${
        isScrolled ? "backdrop-blur-lg bg-white/60 shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="w-full mx-auto h-[70px] sm:h-[80px] md:h-[85px] lg:h-[90px] px-[12px] sm:px-6 md:px-[60px] lg:px-[118px] xl:max-w-[1579px] flex items-center justify-between">

        {/* Left side */}
        <div className="flex items-center gap-[12px] sm:gap-[32px] xl:gap-[48px] flex-shrink-0">
          <Link href={`/${pathLocale}`} className="flex items-center flex-shrink-0">
            <Image
              src={whiteMenu ? "/images/whitelogo.png" : "/images/logo.png"}
              alt="Hypoteq"
              width={168}
              height={42}
              priority
              className="w-[85px] sm:w-[130px] md:w-[145px] lg:w-[168px] h-auto"
            />
          </Link>

          {/* Desktop Menu */}
          <nav className="hidden md:flex items-center gap-[24px] lg:gap-[32px] xl:gap-[48px]">
            <Link
              href={`/${pathLocale}/partner`}
              className={`text-[16px] md:text-[17px] xl:text-[19px] font-semibold hover:opacity-70 transition ${
                whiteMenu ? "text-white" : "text-[#132219]"
              }`}
            >
              {t("navigation.partnerWerden")}
            </Link>
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-[6px] sm:gap-3 md:gap-5 relative flex-shrink-0">

          {/* Phone icon */}
          <Link href={`/${pathLocale}/contact`} className="hidden md:block">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="22"
              fill="none"
              viewBox="0 0 18 24"
            >
              <path
                fill={whiteMenu ? "#fff" : "#132219"}
                d="M0.46 2.92L3.48 1.09c.22-.13.45-.15.69-.07.24.08.42.24.54.48l2.36 4.74c.19.38.14.84-.13 1.15L5.04 9.53c-.27.31-.33.75-.15 1.12 1 2.08 2.9 4.55 4.6 5.93.31.25.72.26 1.04.03l2.25-1.68c.33-.25.75-.24 1.09.06l3.86 3.34c.2.17.31.39.34.66.03.27-.04.51-.2.73l-2.15 2.96c-.21.29-.53.41-.87.35C7.66 21.63.06 11.75 0 3.79c-.01-.37.17-.69.46-.88z"
              />
            </svg>
          </Link>

          {/* Hypothek Button */}
          <Link
            href={`/${pathLocale}/funnel`}
            className="hidden sm:flex items-center justify-center gap-[10px] 
              w-[200px] sm:w-[220px] md:w-[240px] lg:w-[259px] h-[38px] sm:h-[40px]
              rounded-[58px] bg-[#CAF476] text-[#132219]
              text-[17px] md:text-[18px] lg:text-[20px] font-semibold hover:opacity-90 transition-all"
          >
            {t("navigation.hypothekAnfragen")}
          </Link>

          {/* Language selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setOpenLang(!openLang)}
              className="px-[8px] sm:px-3 py-[6px] border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all text-[#132219] font-semibold text-[13px] sm:text-[16px] min-w-[42px] sm:min-w-[60px]"
            >
              {pathLocale.toUpperCase()}
            </button>

            {openLang && (
              <div className="absolute right-0 mt-1 w-[100px] sm:w-[140px] bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden animate-fadeIn z-[100]">
                {["de", "en", "fr", "it"].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleSelect(lang as "de" | "en" | "fr" | "it")}
                    className="w-full px-2 sm:px-4 py-[8px] sm:py-3 text-[#132219] hover:bg-gray-50 text-[13px] sm:text-[15px] text-left"
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hamburger menu */}
          <button
            className="flex flex-col justify-center items-center w-[24px] h-[24px] md:hidden flex-shrink-0"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span
              className={`block w-[18px] h-[2px] bg-[#132219] transition ${
                menuOpen ? "rotate-45 translate-y-[4px]" : ""
              }`}
            ></span>
            <span
              className={`block w-[18px] h-[2px] bg-[#132219] my-[3px] transition ${
                menuOpen ? "opacity-0" : ""
              }`}
            ></span>
            <span
              className={`block w-[18px] h-[2px] bg-[#132219] transition ${
                menuOpen ? "-rotate-45 -translate-y-[4px]" : ""
              }`}
            ></span>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-md px-6 py-6 flex flex-col gap-4 animate-fadeIn max-sm:px-[24px] max-sm:py-[18px] max-sm:gap-[14px]">
          <Link
            href={`/${pathLocale}/partner`}
            onClick={() => setMenuOpen(false)}
            className="text-[#132219] text-[16px] font-semibold hover:opacity-70 transition max-sm:text-[15px]"
          >
            {t("navigation.partnerWerden")}
          </Link>
          <Link
            href={`/${pathLocale}/funnel`}
            onClick={() => setMenuOpen(false)}
            className="text-[#132219] text-[16px] font-semibold hover:opacity-70 transition max-sm:text-[15px]"
          >
            {t("navigation.hypothekAnfragen")}
          </Link>
        </div>
      )}
    </header>
  );
}
