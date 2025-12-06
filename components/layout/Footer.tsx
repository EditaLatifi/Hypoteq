"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";

export default function Footer() {
  const pathname = usePathname();
  const pathLocale = pathname.split("/")[1] || "de";
  const { t } = useTranslation(pathLocale as "de" | "en" | "fr" | "it");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubscribe = async () => {
    if (!email) {
      setMessage(pathLocale === "de" ? "Bitte E-Mail eingeben" : "Please enter email");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage(pathLocale === "de" ? "Erfolgreich angemeldet!" : "Successfully subscribed!");
        setEmail("");
      } else {
        setMessage(data.error || (pathLocale === "de" ? "Fehler beim Anmelden" : "Subscription failed"));
      }
    } catch (error) {
      setMessage(pathLocale === "de" ? "Fehler beim Anmelden" : "Subscription failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="w-full bg-[#0B1C14] text-white font-sfpro">
      <div className="max-w-[1579px] mx-auto px-[24px] md:px-[60px] lg:px-[116px] pt-[40px] md:pt-[50px] lg:pt-[60px] pb-[60px] md:pb-[70px] lg:pb-[80px]">

      {/* LOGO */}
      <div className="w-full flex justify-start">
        <Link href={`/${pathLocale}`} className="cursor-pointer">
          <Image
            src="/images/HYPOTEQ_layout_logo_white.png"
            width={168}
            height={42}
            alt="Logo"
            className="object-contain w-[120px] md:w-[140px] lg:w-[168px] h-auto"
          />
        </Link>
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
          <div className="flex flex-col gap-[12px] w-full md:w-auto">
            <div className="flex flex-col sm:flex-row items-center gap-[12px] sm:gap-[14px] md:gap-[18px] lg:gap-[22px]">
              <div className="flex items-center w-full sm:w-[240px] md:w-[280px] lg:w-[356px] h-[48px] sm:h-[44px] md:h-[42px] lg:h-[40px] rounded-[50px] bg-[#2A3B2C] px-[18px] sm:px-[16px]">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSubscribe()}
                  className="flex-1 bg-transparent text-white placeholder-white/70 outline-none text-[15px] sm:text-[14px] md:text-[14.5px] lg:text-[15px]"
                  placeholder={t("footer.newsletter")}
                />
              </div>

              <button 
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full sm:w-[130px] md:w-[140px] lg:w-[159px] h-[48px] sm:h-[44px] md:h-[42px] lg:h-[40px] flex items-center justify-center bg-[#CAF476] 
                rounded-[50px] text-[#132219] font-semibold sm:font-medium hover:opacity-90 transition text-[16px] sm:text-[15px] md:text-[14.5px] lg:text-base disabled:opacity-50">
                {loading ? "..." : t("buttons.sendNewsletter")}
              </button>
            </div>
            {message && (
              <p className={`text-sm ${message.includes("Erfolg") || message.includes("Success") ? "text-[#CAF476]" : "text-red-400"}`}>
                {message}
              </p>
            )}
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
          <Link href={`/${pathLocale}/uber-uns`} className="hover:underline py-1">{t("footer.aboutUs")}</Link>
          <Link href={`/${pathLocale}/kontaktieren-sie-uns`} className="hover:underline py-1">{t("footer.contactUs")}</Link>
          <Link href={`/${pathLocale}/partner-werden`} className="hover:underline py-1">{t("footer.becomePartner")}</Link>
          <Link href={`/${pathLocale}/impressum`} className="hover:underline py-1">{t("footer.impressumData")}</Link>
        </div>

        {/* COLUMN 3 */}
        <div className="flex flex-col gap-[16px] md:gap-[18px] lg:gap-[24px]">
          <Link href={`/${pathLocale}/hypothekenrechner`} className="hover:underline py-1">{t("footer.mortgageCalc")}</Link>
          <Link href={`/${pathLocale}/faq`} className="hover:underline py-1">{t("footer.faqTitle")}</Link>
          <Link href={`/${pathLocale}/beratung`} className="hover:underline py-1">{t("footer.hypoteqAdvisory")}</Link>
          <div className="flex items-center gap-2 py-1">
            <span className="text-[15px] md:text-[16px] lg:text-[18px]">{t("common.followUs")}</span>
            <a
              href="https://www.linkedin.com/company/hypoteq/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
            >
              {/* Official LinkedIn SVG icon without extra background */}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.761 0 5-2.239 5-5v-14c0-2.761-2.239-5-5-5zm-11 19h-3v-10h3v10zm-1.5-11.268c-.966 0-1.75-.784-1.75-1.75s.784-1.75 1.75-1.75 1.75.784 1.75 1.75-.784 1.75-1.75 1.75zm13.5 11.268h-3v-5.604c0-1.337-.026-3.063-1.868-3.063-1.868 0-2.156 1.459-2.156 2.967v5.7h-3v-10h2.881v1.367h.041c.401-.761 1.379-1.563 2.838-1.563 3.036 0 3.6 2 3.6 4.594v5.602z" fill="#0A66C2"/>
              </svg>
            </a>
          </div>
        </div>

      </div>
      </div>

    </footer>
  );
}
