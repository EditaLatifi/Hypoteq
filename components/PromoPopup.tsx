"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

const LOCALES = ["de", "en", "fr", "it"] as const;

const VALUATION_URL = "https://hypoteq-hedonic.wuestappraisal.com/";

// Bump the suffix when the campaign changes, so visitors who already closed
// the old popup get to see the new one.
const STORAGE_KEY = "hypoteq_promo_immobilienbewertung_2026";

// Pages where the visitor is already in a flow - no promo on top of those.
const HIDDEN_ON = ["/funnel", "/nachreichen", "/danke", "/thank-you", "/merci", "/grazie"];

const DELAY_MS = 1000;

export default function PromoPopup() {
  const pathname = usePathname();
  const segment = pathname.split("/")[1];
  const pathLocale = (LOCALES.includes(segment as any) ? segment : "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);

  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const hidden = HIDDEN_ON.some((path) => pathname.includes(path));

  useEffect(() => {
    if (hidden) return;

    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // private mode / storage blocked - just show it
    }
    if (alreadySeen) return;

    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [hidden]);

  const dismiss = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  // Escape closes it, and the page behind it stays put while it is open.
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto px-[16px] py-[24px] bg-[#0B1C14]/80 backdrop-blur-md animate-promoOverlayIn"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-popup-title"
    >
      <div
        className="relative w-full max-w-[480px] my-auto rounded-[28px] overflow-hidden bg-[#0B1C14] ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] text-white font-sfpro animate-promoCardIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Photo band */}
        <div className="relative h-[150px] sm:h-[180px] overflow-hidden">
          <Image
            src="/images/HYPOTEQ_misc_houses.png"
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 520px) 100vw, 480px"
            className="object-cover object-center"
          />
          {/* Blends the photo into the card and keeps the close button readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1C14]/45 via-[#0B1C14]/10 to-[#0B1C14]" />
        </div>

        <button
          ref={closeRef}
          onClick={dismiss}
          aria-label={t("promoPopup.close")}
          className="absolute top-[14px] right-[14px] z-20 w-[36px] h-[36px] flex items-center justify-center rounded-full bg-[#0B1C14]/50 backdrop-blur text-white/80 ring-1 ring-white/20 hover:bg-[#0B1C14]/80 hover:text-white transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Savings seal, straddling the photo edge */}
        <div className="absolute top-[108px] sm:top-[138px] right-[22px] sm:right-[30px] z-20 w-[84px] h-[84px] flex flex-col items-center justify-center rounded-full bg-[#CAF476] text-[#132219] ring-[5px] ring-[#0B1C14] shadow-[0_10px_30px_-8px_rgba(202,244,118,0.6)] animate-promoSealIn">
          <span className="text-[15px] font-bold leading-none tracking-[-0.3px]">{t("promoPopup.sealAmount")}</span>
          <span className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[0.12em] leading-none">
            {t("promoPopup.sealLabel")}
          </span>
        </div>

        {/* Body */}
        <div className="relative px-[24px] pb-[28px] sm:px-[40px] sm:pb-[36px] -mt-[8px]">
          <span className="inline-flex items-center gap-[8px] rounded-[50px] bg-[#CAF476]/15 text-[#CAF476] ring-1 ring-[#CAF476]/40 text-[12px] sm:text-[13px] font-semibold uppercase tracking-[0.1em] px-[14px] py-[7px]">
            <span className="w-[7px] h-[7px] rounded-full bg-[#CAF476] animate-promoPulse" />
            {t("promoPopup.badge")}
          </span>

          <h2
            id="promo-popup-title"
            className="mt-[16px] pr-[92px] text-[26px] sm:text-[31px] font-[400] leading-[112%] tracking-[-0.6px]"
          >
            {t("promoPopup.title")}
          </h2>

          <p className="mt-[10px] text-[15px] sm:text-[16px] leading-[150%] text-white/70">
            {t("promoPopup.text")}
          </p>

          <div className="mt-[22px] pt-[22px] border-t border-white/10">
            <span className="block text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">
              {t("promoPopup.priceCaption")}
            </span>
            <div className="mt-[8px] flex flex-wrap items-baseline gap-x-[14px] gap-y-[4px]">
              <span className="text-[38px] sm:text-[46px] font-semibold leading-none tracking-[-1px] text-[#CAF476] drop-shadow-[0_0_28px_rgba(202,244,118,0.35)]">
                {t("promoPopup.priceNew")}
              </span>
              <span className="text-[17px] sm:text-[19px] text-white/40">
                {t("promoPopup.priceOldPrefix")}{" "}
                <span className="line-through decoration-[#CAF476]/60 decoration-2">{t("promoPopup.priceOld")}</span>
              </span>
            </div>
          </div>

          <a
            href={VALUATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="group mt-[24px] flex items-center justify-center gap-[10px] w-full h-[54px] rounded-[50px] bg-[#CAF476] text-[#132219] text-[15px] sm:text-[17px] font-semibold text-center px-[16px] shadow-[0_14px_34px_-12px_rgba(202,244,118,0.75)] hover:shadow-[0_18px_40px_-10px_rgba(202,244,118,0.9)] hover:brightness-105 transition-all"
          >
            {t("promoPopup.cta")}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 transition-transform group-hover:translate-x-[3px]"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>

          <p className="mt-[14px] text-center text-[12px] sm:text-[13px] text-white/45 leading-[150%]">
            {t("promoPopup.note")}
          </p>

          <button
            onClick={dismiss}
            className="mt-[10px] w-full text-center text-[14px] sm:text-[15px] text-white/55 hover:text-white underline underline-offset-4 decoration-white/25 hover:decoration-white transition"
          >
            {t("promoPopup.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
