"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ArrowIcon = ({ className = "" }: { className?: string }) => (
  <svg
    width="18"
    height="12"
    viewBox="0 0 18 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M1 6h15.5M11 1l5 5-5 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const REMAX_LOGO_URL = "https://www.remax.ch/cfdok/logo.svg";

export default function Remax() {
  const pathname = usePathname();
  const firstSegment = pathname?.split("/")[1] ?? "";
  const pathLocale = (["de", "en", "fr", "it"].includes(firstSegment)
    ? firstSegment
    : "de") as "de" | "en" | "fr" | "it";

  const startHref = `/${pathLocale}/funnel`;

  return (
    <main className="font-sfpro bg-white text-[#132219] overflow-x-hidden">
      {/* ============ HERO ============ */}
      <section className="relative w-full min-h-[640px] md:min-h-[760px] lg:min-h-[835px] flex flex-col overflow-hidden isolate">
        <Image
          src="/images/HYPOTEQ_hypotheken_hero.png"
          alt="Modernes Wohnhaus"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover z-0"
        />
        <div className="absolute inset-0 bg-black/45 z-[1]" />

        {/* Co-branded logos */}
        <div className="relative z-10 w-full flex justify-center pt-[28px] md:pt-[46px]">
          <div className="flex items-center gap-[16px] md:gap-[24px]">
            <div className="relative h-[32px] w-[128px] md:h-[42px] md:w-[168px]">
              <Image
                src="/images/HYPOTEQ_layout_logo_white.png"
                alt="HYPOTEQ"
                fill
                priority
                className="object-contain"
              />
            </div>
            <span className="text-white/70 text-[20px] md:text-[28px] font-light">
              ×
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={REMAX_LOGO_URL}
              alt="RE/MAX"
              className="h-[32px] md:h-[42px] w-auto object-contain"
            />
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-12 py-[80px] md:py-[120px]">
          <div className="w-full max-w-[1178px] flex flex-col items-center gap-[28px] md:gap-[48px] text-center">
            <h1 className="text-white font-medium tracking-[-0.4px] md:tracking-[-0.8px] text-[40px] md:text-[64px] lg:text-[80px] leading-[1.1] md:leading-[1.2]">
              <span className="block">Du hast deine Immobilie gefunden.</span>
              <span className="block text-[#CAF476]">
                Wir finden deine Hypothek.
              </span>
            </h1>

            <p className="text-white text-[16px] md:text-[20px] lg:text-[24px] leading-[1.5] md:leading-[1.4] max-w-[1080px]">
              Exklusiv für Kundinnen und Kunden von RE/MAX. In nur 2 Minuten zur
              ersten Einschätzung, in wenigen Tagen zum verbindlichen
              Hypothekenangebot. Kostenlos, unabhängig und auf dich abgestimmt.
            </p>

            <Link href={startHref}>
              <button
                type="button"
                className="inline-flex items-center gap-[10px] rounded-[45px] border border-[#132219] bg-[#CAF476] px-[24px] py-[12px] text-[#132219] text-[18px] md:text-[20px] font-semibold hover:opacity-90 transition-all"
              >
                In 3 Schritten starten
                <ArrowIcon />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ SECTION: Schneller zur Hypothek ============ */}
      <section className="w-full px-6 md:px-12 py-[64px] md:py-[100px]">
        <div className="mx-auto max-w-[1142px] flex flex-col items-center text-center gap-[24px]">
          <h2 className="text-[#132219] font-medium text-[32px] md:text-[40px] lg:text-[48px] leading-[1.2] md:leading-[1.4]">
            Vom Kaufobjekt zur Finanzierung — ohne Umwege
          </h2>
          <p className="text-[#132219] font-light text-[16px] md:text-[20px] lg:text-[24px] leading-[1.4] max-w-[980px]">
            Du hast über RE/MAX dein neues Zuhause gefunden. Wir kümmern uns um
            die passende Hypothek — schnell, transparent und mit Zugang zu den
            attraktivsten Finanzierungspartnern der Schweiz.
          </p>
          <Link href={startHref}>
            <button
              type="button"
              className="inline-flex items-center gap-[10px] rounded-[45px] border border-[#132219] bg-[#CAF476] px-[24px] py-[10px] text-[#132219] text-[18px] md:text-[20px] font-semibold hover:opacity-90 transition-all"
            >
              Jetzt kostenlos starten
              <ArrowIcon />
            </button>
          </Link>
        </div>
      </section>

      {/* ============ SECTION: 3 numbered steps + image (image on RIGHT) ============ */}
      <section className="w-full px-6 md:px-12 py-[40px] md:py-[80px]">
        <div className="mx-auto max-w-[1320px] grid grid-cols-1 lg:grid-cols-2 items-center gap-[40px] lg:gap-[108px]">
          <ol className="flex flex-col gap-[32px] md:gap-[40px] list-none order-2 lg:order-1">
            <li className="flex gap-[20px] md:gap-[28px] max-w-[560px]">
              <span className="shrink-0 text-[#CAF476] font-medium text-[40px] md:text-[56px] leading-none tracking-[-0.02em]">
                01
              </span>
              <div className="flex flex-col gap-[8px] md:gap-[12px] pt-[4px] md:pt-[10px]">
                <h3 className="text-[#132219] text-[22px] md:text-[28px] lg:text-[32px] leading-[1.2] font-normal">
                  Eckdaten erfassen
                </h3>
                <p className="text-[#132219] text-[16px] md:text-[18px] lg:text-[20px] leading-[1.5]">
                  Gib in wenigen Minuten deine Angaben zu Objekt und Finanzen
                  ein und erhalte eine erste Einschätzung.
                </p>
              </div>
            </li>
            <li className="flex gap-[20px] md:gap-[28px] max-w-[560px]">
              <span className="shrink-0 text-[#CAF476] font-medium text-[40px] md:text-[56px] leading-none tracking-[-0.02em]">
                02
              </span>
              <div className="flex flex-col gap-[8px] md:gap-[12px] pt-[4px] md:pt-[10px]">
                <h3 className="text-[#132219] text-[22px] md:text-[28px] lg:text-[32px] leading-[1.2] font-normal">
                  Angebote vergleichen
                </h3>
                <p className="text-[#132219] text-[16px] md:text-[18px] lg:text-[20px] leading-[1.5]">
                  Wir prüfen deine Anfrage und identifizieren die attraktivsten
                  Angebote im Markt — abgestimmt auf dein Profil.
                </p>
              </div>
            </li>
            <li className="flex gap-[20px] md:gap-[28px] max-w-[560px]">
              <span className="shrink-0 text-[#CAF476] font-medium text-[40px] md:text-[56px] leading-none tracking-[-0.02em]">
                03
              </span>
              <div className="flex flex-col gap-[8px] md:gap-[12px] pt-[4px] md:pt-[10px]">
                <h3 className="text-[#132219] text-[22px] md:text-[28px] lg:text-[32px] leading-[1.2] font-normal">
                  Hypothek abschliessen
                </h3>
                <p className="text-[#132219] text-[16px] md:text-[18px] lg:text-[20px] leading-[1.5]">
                  Du erhältst ein verbindliches Angebot und wir begleiten dich
                  bis zur finalen Zusage und darüber hinaus.
                </p>
              </div>
            </li>
          </ol>

          <div className="relative w-full aspect-[629/523] rounded-[28px] overflow-hidden order-1 lg:order-2">
            <Image
              src="/images/HYPOTEQ_betterhome_keys.jpg"
              alt="Schlüsselübergabe"
              fill
              quality={85}
              sizes="(max-width: 1024px) 100vw, 629px"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* ============ SECTION: Wir kennen den Markt ============ */}
      <section className="w-full px-6 md:px-12 py-[64px] md:py-[100px]">
        <div className="mx-auto max-w-[1320px] grid grid-cols-1 md:grid-cols-2 gap-[20px] md:gap-[32px]">
          <h2 className="text-[#132219] font-medium text-[32px] md:text-[42px] lg:text-[50px] leading-[1.15] md:leading-[1.4] max-w-[613px]">
            Unabhängig. Mit Zugang zu den besten Konditionen.
          </h2>
          <p className="text-[#132219] font-light text-[16px] md:text-[20px] lg:text-[24px] leading-[1.5] md:leading-[1.4] max-w-[616px]">
            Dank unserer Marktkenntnis und unserem Netzwerk an Schweizer
            Finanzierungspartnern sicherst du dir die passende Hypothek — ohne
            selbst Angebote einholen und vergleichen zu müssen.
          </p>
        </div>
      </section>

      {/* ============ SECTION: CTA banner (lime green) ============ */}
      <section className="w-full bg-[#CAF476] px-6 md:px-12 py-[64px] md:py-[80px]">
        <div className="mx-auto max-w-[1142px] flex flex-col items-center text-center gap-[24px] md:gap-[30px]">
          <h2 className="text-[#132219] font-medium tracking-[-0.4px] md:tracking-[-0.6px] text-[36px] md:text-[48px] lg:text-[60px] leading-[1.15] md:leading-[1.2]">
            Bereit, deine Finanzierung zu sichern?
          </h2>
          <p className="text-black text-[16px] md:text-[20px] leading-[1.5] md:leading-[30px] max-w-[876px]">
            Zuerst vergleichen. Dann entscheiden. Kostenlos und unverbindlich —
            exklusiv für RE/MAX Kundinnen und Kunden.
          </p>
          <Link href={startHref}>
            <button
              type="button"
              className="inline-flex items-center gap-[8px] rounded-[45px] bg-black px-[24px] py-[10px] md:py-[8px] text-[#CAF476] text-[18px] md:text-[20px] font-semibold hover:opacity-90 transition-all"
            >
              Jetzt starten
              <ArrowIcon className="text-[#CAF476]" />
            </button>
          </Link>
        </div>
      </section>
    </main>
  );
}
