"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";


<Image
  src="/images/123.png"
  alt="House background"
  fill
  className="object-cover rounded-[10px]"
/>;

export default function Calculator() {
const pathname = usePathname();
const pathLocale = (pathname.split("/")[1] || "de") as "de" | "en" | "fr" | "it";
const { t } = useTranslation(pathLocale);

const [propertyPrice, setPropertyPrice] = useState(0);
const [ownFunds, setOwnFunds] = useState(0);
const [income, setIncome] = useState(0);
const [existingMortgage, setExistingMortgage] = useState(0);  
const [newMortgage, setNewMortgage] = useState(0);      

const [residenceType, setResidenceType] = useState<"haupt" | "zweit">("haupt");

const [loanType, setLoanType] = useState<"purchase" | "refinancing" | null>("purchase");

  const [interestOption, setInterestOption] = useState("SARON 0.85%");
  const params =
    residenceType === "haupt"
      ? {
          maxBelehnung: 0.8, 
          firstMortgageLimit: 0.6667,
          stressRate: 0.05, 
          maintenanceRate: 0.008, 
          amortizationYears: 15, 
          tragbarkeitThreshold: 0.35,
        }
      : {
          maxBelehnung: 0.65, 
          firstMortgageLimit: 0, 
          stressRate: 0.05,
          maintenanceRate: 0.008,
          amortizationYears: 0,
          tragbarkeitThreshold: 0.35,
        };
const dynamicMaxMortgage = residenceType
  ? propertyPrice * params.maxBelehnung 
  : propertyPrice * 0.8; 

const effectiveRate = useMemo(() => {
  if (interestOption.startsWith("SARON")) return 0.0085; 
  if (interestOption.startsWith("5Y"))   return 0.0105;  
  if (interestOption.startsWith("10Y"))  return 0.0140;  
  return 0.0105;
}, [interestOption]);

const interestOptions = [
  t("calculator.interestOption1" as any),
  t("calculator.interestOption2" as any),
  t("calculator.interestOption3" as any)
]; 
const mortgageNeed =
  loanType === "purchase"
    ? Math.max(0, propertyPrice - ownFunds)
    : Math.max(0, newMortgage);

const maxMortgageAllowed = (params?.maxBelehnung ?? 0) * propertyPrice;
const totalMortgage = Math.min(mortgageNeed, maxMortgageAllowed);
const firstLimitAbs =
  residenceType === "haupt" ? params.firstMortgageLimit * propertyPrice : Infinity;

const firstMortgage = Math.min(totalMortgage, firstLimitAbs);
const secondMortgage =
  residenceType === "haupt" ? Math.max(0, totalMortgage - firstMortgage) : 0;
const actualMortgage = totalMortgage;
const maxMortgage = propertyPrice * (params?.maxBelehnung ?? 0);
const interestOld = existingMortgage * effectiveRate;
const maintenanceOld = propertyPrice * params.maintenanceRate;
const amortizationOld =
  residenceType === "haupt" &&
  existingMortgage > propertyPrice * params.firstMortgageLimit
    ? (existingMortgage - propertyPrice * params.firstMortgageLimit) / params.amortizationYears
    : 0;

let monthlyOld = 0;
if (loanType === "refinancing") {
  const oldInterestYear = existingMortgage * effectiveRate;
  const oldAmortYear =
    residenceType === "haupt" && existingMortgage > firstLimitAbs && params.amortizationYears > 0
      ? (existingMortgage - firstLimitAbs) / params.amortizationYears
      : 0;

  const oldMaintenanceYear = propertyPrice * params.maintenanceRate;

  monthlyOld = (oldInterestYear + oldAmortYear + oldMaintenanceYear) / 12;
}
const maxBelehnungAllowed = params.maxBelehnung; 
const interestYearStress   = actualMortgage * params.stressRate;  
const maintenanceYear = propertyPrice * params.maintenanceRate;
const belehnungPurchase = propertyPrice > 0 ? actualMortgage / propertyPrice : 0;
const belehnungRefi     = propertyPrice > 0 ? newMortgage / propertyPrice   : 0;
const belehnung         = loanType === "refinancing" ? belehnungRefi : belehnungPurchase;
const amortizationYear =
  loanType === "purchase" &&
  residenceType === "haupt" &&
  belehnung > 0.6667 &&
  secondMortgage > 0
    ? secondMortgage / params.amortizationYears
    : 0;

const tragbarkeitCHF       = interestYearStress + maintenanceYear + amortizationYear;
const minIncomeRequired = tragbarkeitCHF > 0 ? tragbarkeitCHF / params.tragbarkeitThreshold : 0;
const tragbarkeitPercent   = income > 0 ? tragbarkeitCHF / income : 0;
const interestYearEffective = actualMortgage * effectiveRate;
const monthlyCost = (interestYearEffective + amortizationYear + maintenanceYear) / 12;
const minOwnFunds = loanType === "purchase" ? propertyPrice * 0.20 : 0; 
const isBelehnungOK     = belehnung <= params.maxBelehnung; 
const isTragbarkeitOK = Math.round(tragbarkeitPercent * 1000) <= Math.round(params.tragbarkeitThreshold * 1000);

const isEquityOK =
  loanType === "purchase"
    ? ownFunds > 0   // mjafton të ketë fonde
    : true;
const isEligible = isBelehnungOK && isTragbarkeitOK;

const minVisualMax = 100000; 
const sliderMaxExisting = Math.max(propertyPrice, minVisualMax);
const sliderMaxNew = Math.max(dynamicMaxMortgage, minVisualMax);


const infoTitle = isEligible
  ? loanType === "purchase"
    ? t("calculator.financingPossiblePurchase" as any)
    : t("calculator.financingPossibleRefi" as any)
  : t("calculator.financingNotPossible" as any);       


  // -------------- Formatting --------------
  const formatCHF = (num: number) =>
    "CHF " + Math.round(num).toLocaleString("de-CH");
  const formatPercent = (num: number) =>
    (num * 100).toFixed(1).replace(".", ",") + "%";
const minRefinanceMortgage = existingMortgage;   
const [openDropdown, setOpenDropdown] = useState(false);


  // -------------- UI --------------
  return (
<section id="calculator" className="max-w-[1320px] mx-auto flex flex-col items-center bg-white py-12 px-[116px]mb-[120px] font-sans text-[#132219]">
<div className="flex flex-col lg:flex-row justify-between items-start w-full max-w-[1579px] mx-auto gap-[60px] lg:gap-[80px] lg:items-stretch">

        <div className="flex flex-col w-full max-w-[536px] px-4 gap-[48px]">
<div className="flex flex-col lg:flex-row items-start justify-between w-full mt-[60px] mb-[100px]">
  <h1
    className="
      text-[40px] sm:text-[52px] lg:text-[72px]
      font-[500]
      leading-[110%] lg:leading-[100%]
      tracking-[-0.72px]
      text-[#132219]
      max-w-full lg:max-w-[536px]
      text-left
    "
    style={{ fontFamily: "'SF Pro Display', sans-serif" }}
  >
    {t("calculator.title")}
  </h1>
</div>

{/* INPUT BLOCK — spacing 28px uniform */}
<div className="flex flex-col gap-[28px] mt-[16px]">

  {/* Toggle buttons */}
  <div className="flex gap-[12px]">
    <ToggleButton
      label={t("calculator.purchase") || "Immobilienkauf"}
      active={loanType === "purchase"}
      onClick={() => setLoanType("purchase")}
    />
    <ToggleButton
      label={t("calculator.refinancing") || "Refinanzierung"}
      active={loanType === "refinancing"}
      onClick={() => setLoanType("refinancing")}
    />
  </div>

  {/* Sub toggles */}
  {loanType && (
    <div className="flex w-full border border-[#132219] rounded-full p-[3px]">
      <SubToggle
        label={t("calculator.primaryResidence") || "Hauptwohnsitz"}
        active={residenceType === "haupt"}
        onClick={() => setResidenceType("haupt")}
      />
      <SubToggle
        label={t("calculator.secondaryResidence") || "Zweitwohnsitz"}
        active={residenceType === "zweit"}
        onClick={() => setResidenceType("zweit")}
      />
    </div>
  )}

  {/* Sliders */}
  <SliderInput
    label={t("calculator.purchasePrice") || "Kaufpreis"}
    value={propertyPrice}
    setValue={setPropertyPrice}
    min={0}
    max={2000000}
  />

  {loanType === "refinancing" && (
    <>
      <SliderInput
        label={t("calculator.existingMortgage") || "Bisherige Hypothek"}
        value={existingMortgage}
        setValue={(v: number) => setExistingMortgage(Math.min(v, propertyPrice))}
        min={0}
        max={sliderMaxExisting}
      />
      <SliderInput
        label={t("calculator.newMortgage") || "Neue Hypothek"}
        value={newMortgage}
        setValue={(v: number) => setNewMortgage(Math.min(v, dynamicMaxMortgage))}
        min={0}
        max={sliderMaxNew}
      />
    </>
  )}

  {loanType === "purchase" && (
    <SliderInput
      label={t("calculator.ownFunds") || "Eigenmittel"}
      value={ownFunds}
      setValue={setOwnFunds}
      min={0}
      max={propertyPrice}
      minRequired={minOwnFunds}
    />
  )}

  <SliderInput
    label={t("calculator.grossIncome") || "Brutto-Haushaltseinkommen"}
    value={income}
    setValue={setIncome}
    min={0}
    max={500000}
    minRequired={minIncomeRequired}
  />
{/* === INTEREST DROPDOWN WITH LABEL === */}
<div className="flex flex-col gap-[6px] mt-[10px] w-full">

  {/* LABEL ABOVE DROPDOWN */}
  <label className="text-[16px] font-medium text-[#132219]">
    {t("calculator.selectInterest") || "Zins-Laufzeit wählen:"}
  </label>

  <div className="relative w-full mt-[4px]">
    <button
      onClick={() => setOpenDropdown((prev) => !prev)}
      className="
        w-full h-[40px] 
        bg-white 
        border border-[#132219] 
        rounded-[50px]
        flex items-center justify-between
        px-[16px]
        text-[16px] font-medium
      "
    >
      <span className="text-[#132219]">{interestOption}</span>

      {/* Arrow icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        className={`transition-transform duration-300 ${
          openDropdown ? "rotate-180" : "rotate-0"
        }`}
      >
        <path
          d="M5 7L10 12L15 7"
          stroke="#132219"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>

    {openDropdown && (
      <div
        className="
          absolute left-0 top-[45px] w-full 
          bg-white border border-[#132219]
          rounded-[10px]
          shadow-lg z-10
          py-2
        "
      >
        {interestOptions.map((option) => (
          <button
            key={option}
            className="
              w-full text-left px-4 py-2 
              text-[16px] text-[#132219] 
              hover:bg-[#F4F4F4]
            "
            onClick={() => {
              setInterestOption(option);
              setOpenDropdown(false);
            }}
          >
            {option}
          </button>
        ))}
      </div>
    )}
  </div>
</div>
</div>


   
        </div>
<div className="flex flex-col items-start w-full max-w-[628px] mt-[3px]">

  {/* InfoBox → gap 36px */}




           <div className="px-4 flex flex-col items-start w-full max-w-[628px] px-4 mt-[70px] gap-[34px]">
          <p
            className="text-[#132219] text-[22px] font-[300] leading-[150%] mb-[60px]"
            style={{ fontFamily: "'SF Pro Display', sans-serif" }}
          >
  {t("calculator.helperText") || "Bewege einfach die Regler für Kaufpreis, Eigenmittel, Zinssatz und Laufzeit – und sieh sofort, wie sich deine monatlichen Kosten, Zinsen und die Gesamtlaufzeit verändern. Smart, transparent und in Sekunden."}
          </p>
    <InfoBox
      title={infoTitle}
      value={formatCHF(actualMortgage)} 
      red={!isEligible}
      loanType={loanType}
    />
  </div>

<div className="px-4 grid grid-cols-2 gap-[10px] w-full mt-[20px] mb-[10px]">

  {/* PURCHASE → Eigenmittel + Tragbarkeit */}
  {loanType === "purchase" && (
    <>
      <ProgressBox
        title={t("calculator.ownFunds") || "Eigenmittel"}
        value={formatPercent(propertyPrice > 0 ? ownFunds / propertyPrice : 0)}
        current={formatCHF(ownFunds)}
        total={formatCHF(propertyPrice)}
        loanType={loanType}
      />

      <ProgressBox
        title={t("calculator.affordability") || "Tragbarkeit"}
        value={formatPercent(tragbarkeitPercent)}
        current={formatCHF(tragbarkeitCHF)}
        total={formatCHF(income)}
        loanType={loanType}
        red={!isTragbarkeitOK}
      />
    </>
  )}

  {/* REFINANCING → Belehnung + Tragbarkeit */}
  {loanType === "refinancing" && (
    <>
      <ProgressBox
        title={t("calculator.loanToValue") || "Belehnung"}
        value={formatPercent(belehnungRefi)}
        current={formatCHF(newMortgage)}
        total={formatCHF(propertyPrice)}
        loanType={loanType}
        red={!isBelehnungOK}
      />

      <ProgressBox
        title={t("calculator.affordability") || "Tragbarkeit"}
        value={formatPercent(tragbarkeitPercent)}
        current={formatCHF(tragbarkeitCHF)}
        total={formatCHF(income)}
        loanType={loanType}
        red={!isTragbarkeitOK}
      />
    </>
  )}

</div>


    {/* === 4 Kosten Boxes Nën Tragbarkeit/Eigenmittel === */}
<div className="px-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[10px] w-full mt-[16px]">

    {loanType === "refinancing" ? (
      <>
        <SmallBox title={t("calculator.previousMonthlyCost") || "Bisherige monatliche Kosten"} value={formatCHF(monthlyOld)} />
        <SmallBox title={t("calculator.totalMonthlyCost") || "Monatliche Gesamtkosten"} value={formatCHF(monthlyCost)} highlight />
        <SmallBox title={t("calculator.interest") || "Zinsen"} value={formatCHF(interestYearEffective / 12)} />
        <SmallBox title={t("calculator.maintenanceCosts") || "Unterhalt / Nebenkosten"} value={formatCHF(maintenanceYear / 12)} />
      </>
    ) : (
      <>
        <SmallBox title={t("calculator.amortization") || "Amortisation"} value={formatCHF(amortizationYear / 12)} />
        <SmallBox title={t("calculator.secondaryCosts") || "Nebenkosten"} value={formatCHF(maintenanceYear / 12)} />
        <SmallBox title={t("calculator.interestCosts") || "Zinskosen"} value={formatCHF(interestYearEffective / 12)} />
        <SmallBox title={t("calculator.monthlyCosts") || "Monatliche Kosten"} value={formatCHF(monthlyCost)} highlight />
      </>
    )}

  </div>


</div>

      </div>

{/* Butoni → 28px distancë nga kutia sipër */}
<Link href={`/${pathLocale}/funnel`} className="px-4 w-full col-span-2 block">
  <button className="w-full h-[41px] mt-[28px] rounded-full bg-[#132219] text-white text-[18px] font-sfpro font-medium text-center leading-normal hover:opacity-90 transition">
    {t("calculator.continueMortgage") || "Mein Projekt fortsetzen"}
  </button>
</Link>

{/* TWO CTA CARDS */}
<section className="px-4 flex flex-col md:flex-row justify-between items-start gap-[24px] w-full max-w-[1280px] mx-auto mt-[60px] md:mt-[100px] mb-[200px] md:mb-[100px] px-1">

  {/* Left Card */}
  <div className="relative flex flex-col justify-between items-start w-full md:w-[628px] h-[260px] md:h-[293px] p-[20px] md:p-[24px] rounded-[10px] border border-[#132219] overflow-hidden bg-[linear-gradient(90deg,#FFF4DE_0%,#FCEAC5_100%)]">
    <div className="relative z-10 flex flex-col gap-[10px] md:gap-[16px] w-full max-w-[536px]">
      <h3 className="text-[#132219] text-[28px] sm:text-[32px] md:text-[40px] font-[500] leading-[140%] tracking-[-0.4px]">
       {t("calculator.ctaCard1Title") || "Finde deine Hypothek!"}
      </h3>
      <p className="text-[#132219] text-[16px] sm:text-[18px] md:text-[20px] font-[300] leading-[140%]">
{t("calculator.ctaCard1Text") || "In nur 3 Schritte zu deiner optimalen Finanzierung – einfach, digital, transparent.Wir vergleichen Angebote in Echtzeit und zeigen dir sofort, was wirklich passt."}
<br/>  <strong>{t("calculator.ctaCard1Strong") || "Schnell, sicher, ohne Umwege."}</strong>
      </p>
    </div>
< Link href={`/${pathLocale}/funnel`} className="w-full">
    <button className="relative z-10 bg-white border border-[#132219] rounded-full px-[20px] md:px-[24px] py-[6px] md:py-[8px] text-[14px] sm:text-[16px] font-[600] text-[#132219] hover:scale-[1.03] transition-transform">
  {t("calculator.requestMortgage") || "Hypothek anfragen"}
    </button>
</Link>
    <Image src="/images/00.jpg" alt="House background" fill className="object-cover rounded-[10px] z-0" />
  </div>

{/* Right Card */}
<div
  className="
    relative flex flex-col justify-start items-start 
    w-full md:w-[629px] 
    h-[380px]
    p-[24px]
    rounded-[10px] border border-[#000000]
    overflow-hidden
  "
  style={{ background: "url('/images/0101.png') center/cover no-repeat, #132219" }}
>
  {/* Headline */}
  <h3
    className="
      text-[#CAF476]
      text-[36px]
      font-[500]
      leading-[140%]
      tracking-[-0.36px]
      font-sfpro
      mb-[16px]
      max-w-[536px]
    "
    style={{ fontFamily: '"SF Pro Display", sans-serif' }}
  >
    {t("calculator.ctaCard2Title") || "15 Minuten, die Klarheit schaffen"}
  </h3>

  {/* Subtext */}
  <p
    className="
       text-[#CAF476]
      text-[20px]
      font-[300]
      leading-[140%]
      tracking-[-0.2px]
      font-sfpro
      max-w-[536px]
      mb-[24px]
    "
    style={{ fontFamily: '"SF Pro Display", sans-serif' }}
  >
    {t("calculator.ctaCard2Text") || "Unsere Expert:innen erklären dir den Finanzierungsprozess, zeigen dir passende Optionen – und begleiten dich bei der Entscheidungsfindung."}
  </p>
< Link href={`/${pathLocale}/contact`} className="w-full">
  {/* Button */}
  <button
    className="
      flex justify-center items-center 
      gap-[10px]
      px-[24px] py-[8px]
      rounded-[58px]
      border border-[#000000]
      bg-[#CAF476]
      text-[#132219]
      text-[16px]
      font-[600]
      font-sfpro
      hover:bg-[#D6FA8A]
      transition
       mt-[24px]
    "
    style={{ fontFamily: '"SF Pro Display", sans-serif' }}
  >
{t("calculator.ctaCard2Button") || "Jetzt kostenloses Infogespräch buchen."}
  </button>
  </Link>
</div>


</section>

    </section>
  );
}


function ToggleButton({ label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-[40px] rounded-full border border-[#132219] text-[18px] font-medium transition-all duration-300 ${
        active
          ? "bg-[linear-gradient(270deg,#CAF476_0%,#E3F4BF_100%)]"
          : "bg-white opacity-80"
      }`}
    >
      {label}
    </button>
  );
}

function SubToggle({ label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex justify-center items-center h-[40px] rounded-[48px] text-[18px] font-semibold transition-all duration-300 ${
        active
          ? "bg-[#132219] text-[#CAF47E]"
          : "bg-transparent text-[#132219] opacity-70"
      }`}
    >
      {label}
    </button>
  );
}

function SliderInput({ label, value, setValue, min, max, minRequired }: any) {
  const percentage = ((value - min) / (max - min)) * 100;
  const animationRef = useRef<number | null>(null);

  // ✅ Gjithmonë ndjek minRequired
  useEffect(() => {
    if (minRequired === undefined) return;

    const startValue = value;
    const endValue = Math.min(Math.max(minRequired, min), max); // kufizo brenda range-it
    const duration = 400;
    const startTime = performance.now();

    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const newVal = startValue + (endValue - startValue) * eased;
      setValue(Math.round(newVal));
      if (progress < 1) animationRef.current = requestAnimationFrame(animate);
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);
  }, [minRequired, min, max]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
<div className="flex flex-col gap-[6px] relative">
      {/* Label */}
      <div className="flex justify-between items-center">
        <label className="text-[16px] font-medium">{label}</label>
        <div className="w-[16px] h-[16px] flex items-center justify-center rounded-full bg-[#626D64]">
          <span className="text-white text-[10px] font-medium">?</span>
        </div>
      </div>

      {/* Input Field */}
      <div className="flex items-center justify-between border border-[#A8A8A8] rounded-full px-5 py-2">
        <input
          type="text"
          value={value.toLocaleString("de-CH")}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            const parsed = Number(raw);
            if (!isNaN(parsed)) {
              const bounded = Math.max(min, Math.min(parsed, max));
              setValue(bounded);
            }
          }}
          className="bg-transparent text-[18px] font-medium w-[120px] outline-none"
        />
        <span className="text-[18px] font-semibold">CHF</span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const newVal = Number(e.target.value);
          // Mos lejo poshtë minimumit
          if (minRequired !== undefined && newVal < minRequired) {
            setValue(minRequired);
          } else {
            setValue(newVal);
          }
        }}
  className="w-full h-[4px] rounded-full appearance-none cursor-pointer transition-[background] duration-300 ease-out mt-[6px]"
        style={{
background: `linear-gradient(to right, #132219 ${Math.max(percentage, 3)}%, #D9D9D9 ${Math.max(percentage, 3)}%)`,

          transition: "all 0.3s ease-out",
        }}
      />

 {minRequired !== undefined ? (
  <div className="flex justify-end text-[13px] text-[#4b4b4b] italic pr-2 mt-[-4px] h-[18px]">
    Minimum : {Math.round(minRequired).toLocaleString("de-CH")} CHF
  </div>
) : (
  <div className="h-[18px]" />   // placeholder për të mbajtur të njëjtën lartësi
)}

    </div>
  );
}

function InfoBox({ title, value, red = false, loanType }: any) {
  const bgColor = red
    ? "bg-[linear-gradient(270deg,#FCA5A5_0%,#FECACA_100%)]"
    : "bg-[linear-gradient(270deg,#CAF476_0%,#E3F4BF_100%)]";

  return (
    <div
      className={`flex flex-col justify-between w-full h-[185px] 
      border border-[#132219] rounded-[10px] 
      px-[16px] py-[12px] ${bgColor}`}
    >
      <div className="flex justify-between items-start">
        <p className="text-[16px] font-medium leading-tight">{title}</p>

        <div className="w-[20px] h-[20px] rounded-full border border-[#132219] bg-[#CAF47E] flex items-center justify-center">
          <CheckIcon />
        </div>
      </div>

      <h2 className="text-[40px] font-semibold tracking-tight leading-none">
        {value}
      </h2>
    </div>
  );
}


function ProgressBox({ title, value, current, total, loanType, red = false }: any) {
  return (
    <div
      className="
      flex-1 h-[185px]
      flex flex-col justify-between 
      rounded-[10px] border border-[#132219] 
      px-[16px] py-[15px]
      bg-[linear-gradient(270deg,#CAF476_0%,#E3F4BF_100%)]
      "
    >
      <div className="flex justify-between items-start">
        <h3 className="text-[20px]">{title}</h3>
        <div className="w-[20px] h-[20px] rounded-full border border-[#132219] bg-[#CAF47E] flex items-center justify-center">
          <CheckIcon />
        </div>
      </div>

      <h2 className="text-[40px] font-semibold leading-none">{value}</h2>
    </div>
  );
}
interface SmallBoxProps {
  title: string;
  value: string;
  highlight?: boolean;
}

function SmallBox({ title, value, highlight = false }: SmallBoxProps) {
  const [currency, amount] = value.split(" ");

  return (
    <div
      className={`
        relative flex flex-col justify-between
        w-[147px] h-[127px]
        p-[8px_12px]
        rounded-[10px] border border-[#132219]
        bg-white overflow-hidden
      `}
    >
      {/* highlight bar poshtë */}
      {highlight && (
        <div className="absolute bottom-0 left-0 w-full h-[4px] bg-[linear-gradient(270deg,#CAF476_0%,#E3F4BF_100%)]" />
      )}

      <p className="text-[14px] font-medium text-[#132219] leading-none">
        {title}
      </p>

      <div className="flex items-end gap-[3px] mt-[4px]">
        <span className="text-[20px] font-semibold">{currency}</span>
        <span className="text-[20px] font-semibold">{amount}</span>
      </div>
    </div>
  );
}


function CheckIcon({ red = false, loanType }: any) {
  const strokeColor = !loanType
    ? "#6E6E6E" 
    : red
    ? "#7F1D1D" 
    : "#132219"; 

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="8"
      height="6"
      viewBox="0 0 10 8"
      fill="none"
    >
      <path
        d="M0.5 3.78129L3.31254 6.59383L9.50012 0.40625"
        stroke={strokeColor}
        strokeWidth="1"
      />
    </svg>
  );
}
