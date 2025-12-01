"use client";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

export default function Benefits() {
  const pathname = usePathname();
  const pathLocale = (pathname?.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
  const { t } = useTranslation(pathLocale);
  return (
    <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image with zoom and position */}
      <Image
        src="/images/HYPOTEQ_home_benefits_main.png"
        alt="benefits background"
        fill
        priority
        className="object-cover "
      />

      {/* Overlay gradient */}
      <div className="absolute inset-0 "></div>

      {/* Content */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center text-center gap-[24px] md:gap-[28px] lg:gap-[32px] px-6">
<div className="w-full max-w-[90%] md:max-w-[700px] lg:max-w-[828px] h-auto text-center text-white text-[48px] md:text-[64px] lg:text-[80px] font-sfpro leading-[100%] md:leading-[100%]">
  {t("benefits.title")}
</div>


     {/* Button */}
<div className="h-10 px-5 bg-white/20 rounded-[70px] outline outline-1 outline-offset-[-1px] outline-white/40 backdrop-blur-[6.5px] inline-flex justify-center items-center gap-[10px] cursor-pointer hover:bg-white/30 transition">
  <span className="text-white font-['Inter'] text-[14px] font-semibold font-sfpro leading-normal">
    {t("buttons.sendRequest")}
  </span>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="8"
    height="8"
    viewBox="0 0 12 12"
    fill="none"
  >
    <path
      d="M4.5 2L8 6L4.5 10"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
</div>

      </div>

      {/* Bottom section with same structure as Figma */}
      <div className="absolute bottom-[20px] md:bottom-[28px] lg:bottom-[32px] left-0 right-0 flex flex-col md:flex-row justify-between items-start md:items-end gap-[24px] md:gap-0 px-[28px] md:px-[60px] lg:px-[116px] text-white">
    {/* Offer */}
<div className="flex flex-col w-full md:w-[160px] lg:w-[177px] items-start gap-[6px] md:gap-[7px] lg:gap-[8px] flex-shrink-0">
 <p className="text-white font-['SF_Pro_Display'] text-[16px] md:text-[17px] lg:text-[18px] font-light leading-[100%] self-stretch">
  {t("benefits.todaysBestOffer")}
</p>


  <p className="text-white font-['SF_Pro_Display'] text-[32px] md:text-[36px] lg:text-[40px] font-normal leading-[100%]">
    0.19%
  </p>

  <p className="text-white font-['SF_Pro_Display'] text-[20.139px] font-light leading-[100%]">
    {t("benefits.compareText")}
  </p>
</div>


        {/* Logos & text */}
        <div className="flex items-center gap-6">
          <span className="text-[24px] font-normal leading-[100%] text-right">
            {t("benefits.collaboratingWith")}
          </span>

          <div className="flex items-center">
            {[
              { src: "/images/rb.png", alt: "R Bank" },
              { src: "/images/banca.png", alt: "Banca Migros" },
              { src: "/images/kb.png", alt: "KB Bank" },
              { src: "/images/gen.png", alt: "Generali" },
              { src: "/images/ubs.png", alt: "UBS" },
            ].map((logo, i) => (
              <div
                key={i}
                className={`w-[81px] h-[81px] rounded-full border border-white/40 bg-white/20 backdrop-blur-[8.7px] flex items-center justify-center overflow-hidden ${
                  i !== 0 ? "-ml-6" : ""
                }`}
              >
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={54}
                  height={54}
                  className="object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
