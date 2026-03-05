"use client";


import { useFunnelStore } from "@/src/store/funnelStore";
import { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import salesforceApi from "@/components/salesforceApi";

export default function DirectSummaryStep({ back, saveStep }: any) {
  const { t } = useTranslation();
  const { project, property, borrowers, financing, customerType, client, documents, email } = useFunnelStore();


  // Collect all funnel data for Salesforce
  const funnelData = {
    ...client,
    ...project,
    ...property,
    borrowers,
    ...financing,
    documents,
    email,
    customerType,
  };

  // Trigger Salesforce sync on application submit
  const handleSubmitApplication = async () => {
    try {
      console.log("🔎 FINAL PAYLOAD TO SALESFORCE:", JSON.stringify(funnelData, null, 2));
      await salesforceApi.login();
      await syncFunnelStepsToSalesforce(funnelData, salesforceApi);
      alert("Application sent to Salesforce successfully!");
    } catch (error) {
      alert("Failed to send application to Salesforce: " + error);
    }
  };

  useEffect(() => {
    console.log("📌 DirectSummaryStep - project from store:", project);
  }, [project]);

  /* ================= HELPERS ================= */
  const format = (v: any) => (v ? v : "—");

  const CHF = (v: any) =>
    v ? `${parseFloat(v).toLocaleString("de-CH")} CHF` : "—";

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    if (dateStr.includes(".")) return dateStr;

    if (dateStr.includes("-")) {
      const [y, m, d] = dateStr.split("-");
      return `${d}.${m}.${y}`;
    }

    return dateStr;
  };

  // Check if juristische Person or partner
  const isJur = borrowers?.[0]?.type === "jur";
  const isPartner = customerType === "partner";

  useEffect(() => {
    console.log("📌 DirectSummaryStep - isJur:", isJur, "borrowers:", borrowers);
  }, [isJur, borrowers]);

  /* ================= CARD COMPONENT ================= */
  const CardSection = ({ title, children }: any) => (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 lg:p-10 shadow-sm">
      <h3 className="text-xl md:text-2xl lg:text-[26px] font-semibold tracking-tight mb-6 md:mb-7 lg:mb-8">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] lg:grid-cols-[280px_1fr] gap-y-4 md:gap-y-6 lg:gap-y-7 gap-x-8 md:gap-x-12 lg:gap-x-16">
        {children}
      </div>
    </div>
  );

  // fallback nëse projektArt nuk është zgjedhur
  const projectLabel =
    project.projektArt === "kauf"
      ? t("funnel.newPurchase" as any)
      : project.projektArt === "abloesung"
      ? t("funnel.redemption" as any)
      : t("funnel.notSelected" as any);


  // Show all borrower names (for case name)
  const borrowerLabel =
    borrowers && borrowers.length > 0
      ? borrowers
          .map((b: any) =>
            b.firmenname
              ? b.firmenname
              : [b.vorname, b.name].filter(Boolean).join(" ")
          )
          .filter(Boolean)
          .join(" & ")
      : "—";

  // Check if it's a Rendite object (investment property)
  const isRendite = property.nutzung === "Rendite-Immobilie" || 
                    property.nutzung?.toLowerCase()?.includes("rendite") ||
                    property.nutzung?.toLowerCase()?.includes("investment");

  /* ================= CALCULATE TOTAL EIGENMITTEL ================= */
  const totalEigenmittel = financing
    ? Number(financing.eigenmittel_bar || 0) +
      Number(financing.eigenmittel_saeule3 || 0) +
      Number(financing.eigenmittel_pk || 0) +
      Number(financing.eigenmittel_schenkung || 0)
    : 0;
/* ================= MAP HYPOTHEKARLAUFZEITEN ================= */
const laufzeitMap = {
  saron: "Saron",
  "1": t("funnel.oneYearLabel" as any),
  "2": t("funnel.twoYearsLabel" as any),
  "3": t("funnel.threeYearsLabel" as any),
  "4": t("funnel.fourYearsLabel" as any),
  "5": t("funnel.fiveYearsLabel" as any),
  "6": t("funnel.sixYearsLabel" as any),
  "7": t("funnel.sevenYearsLabel" as any),
  "8": t("funnel.eightYearsLabel" as any),
  "9": t("funnel.nineYearsLabel" as any),
  "10": t("funnel.tenYearsLabel" as any),
  mix: "Mix",
} as const;

const laufzeitLabel =
  laufzeitMap[financing?.modell as keyof typeof laufzeitMap] || "—";

 
  return (
<div className="w-full max-w-[1100px] mx-auto text-[#132219] py-12 md:py-16 lg:py-20 px-4 md:px-5 lg:px-6 -mt-10 md:-mt-12 lg:-mt-16">

      {/* ================= HEADER ================= */}
      <div className="pb-6 md:pb-7 lg:pb-8 border-b border-gray-200">
        <h2 className="text-3xl md:text-[36px] lg:text-[40px] font-semibold tracking-tight">
          {t("funnel.summary" as any)}
        </h2>
      </div>

      <div className="flex flex-col gap-8 md:gap-10 lg:gap-12 mt-8 md:mt-10 lg:mt-12">

        {/* ================= SECTION: Allgemeines ================= */}
        <CardSection title={t("funnel.general" as any)}>
          <label className="text-[18px] font-light opacity-70">
            {t("funnel.yourProject" as any)}
          </label>
          <div className="text-[20px] font-medium">{projectLabel}</div>

          <label className="text-[18px] font-light opacity-70">{t("funnel.kreditnehmer" as any)}</label>
          <div className="text-[20px] font-medium">{borrowerLabel}</div>
        </CardSection>

        {/* ================= SECTION: Finanzierung ================= */}
        <CardSection title={t("funnel.finanzierung" as any)}>
          <label className="text-[18px] font-light opacity-70">
            {t("funnel.propertyType" as any)}
          </label>
          <div className="text-[20px] font-medium">
            {property.artImmobilie ? property.artImmobilie.charAt(0).toUpperCase() + property.artImmobilie.slice(1) : "—"}
          </div>

          <label className="text-[18px] font-light opacity-70">
            {t("funnel.propertyKind" as any)}
          </label>
          <div className="text-[20px] font-medium">
            {property.artLiegenschaft ? property.artLiegenschaft.charAt(0).toUpperCase() + property.artLiegenschaft.slice(1) : "—"}
          </div>

          <label className="text-[18px] font-light opacity-70">{t("funnel.propertyUsage" as any)}</label>
          <div className="text-[20px] font-medium">{format(property.nutzung)}</div>

          <label className="text-[18px] font-light opacity-70">
            {t("funnel.renovations" as any)}
          </label>
          <div className="text-[20px] font-medium">
            {property.renovation === "ja"
              ? `${t("funnel.yes" as any)}, ${CHF(property.renovationsBetrag)}`
              : t("funnel.no" as any)}
          </div>

          <label className="text-[18px] font-light opacity-70">
            {t("funnel.propertyReservedQuestion" as any)}
          </label>
          <div className="text-[20px] font-medium">
            {property.reserviert === "ja" ? t("funnel.yes" as any) : t("funnel.no" as any)}
          </div>

          <label className="text-[18px] font-light opacity-70">
            {t("funnel.financingOffersQuestion" as any)}
          </label>
          <div className="text-[20px] font-medium leading-snug">
            {property.finanzierungsangebote === "ja"
              ? (
                <div className="space-y-2">
                  <div>{t("funnel.yes" as any)}</div>
                  {(property.angebote && property.angebote.length > 0) ? (
                    property.angebote.map((offer: any, idx: number) => (
                      <div key={idx} className="text-[16px] opacity-80">
                        {offer.bank || '—'}
                        {offer.zins
                          ? `, ${!isNaN(parseFloat(offer.zins)) ? parseFloat(offer.zins).toFixed(2) : offer.zins}%`
                          : ''}
                        {offer.laufzeit ? `, ${offer.laufzeit}` : ''}
                      </div>
                    ))
                  ) : (
                    <div className="text-[16px] opacity-80">
                      {property.bank || '—'}
                      {property.zins
                        ? `, ${!isNaN(parseFloat(property.zins)) ? parseFloat(property.zins).toFixed(2) : property.zins}%`
                        : ''}
                      {property.laufzeit ? `, ${property.laufzeit}` : ''}
                    </div>
                  )}
                </div>
              )
              : t("funnel.no" as any)}
          </div>

          <label className="text-[18px] font-light opacity-70">
            {t("funnel.borrowerDetails" as any)}
          </label>
          <div className="text-[20px] font-medium leading-snug space-y-2">
            {property.kreditnehmer && property.kreditnehmer.length > 0 ? (
              property.kreditnehmer.map((k: any, idx: number) => (
                <div key={idx}>
                  {borrowers[0]?.type === "jur"
                    ? k.firmenname
                    : `${k.vorname} ${k.name}, ${formatDate(k.geburtsdatum)}`}
                </div>
              ))
            ) : "—"}
          </div>
        </CardSection>

        {/* ================= SECTION: Kalkulator ================= */}
        <CardSection title={t("funnel.calculatorOverview" as any)}>
          <label className="text-[18px] font-light opacity-70">
            {t("funnel.purchasePrice" as any)}
          </label>
          <div className="text-[20px] font-medium">{CHF(financing.kaufpreis)}</div>

          <label className="text-[18px] font-light opacity-70">{t("funnel.totalOwnFunds" as any)}</label>
          <div className="text-[20px] font-medium">
            {totalEigenmittel > 0 ? CHF(totalEigenmittel) : "—"}
          </div>

          {/* Show Ablösung and Erhöhung for Ablösung projects */}
          {project.projektArt === "abloesung" && (
            <>
              <label className="text-[18px] font-light opacity-70">{t("funnel.redemptionAmount" as any)}</label>
              <div className="text-[20px] font-medium">{CHF(financing.abloesung_betrag)}</div>

              {financing.erhoehung === "Ja" && (
                <>
                  <label className="text-[18px] font-light opacity-70">{t("funnel.increaseAmount" as any)}</label>
                  <div className="text-[20px] font-medium">{CHF(financing.erhoehung_betrag)}</div>
                </>
              )}
            </>
          )}

          {!isJur && !isRendite && (
            <>
              <label className="text-[18px] font-light opacity-70">{t("funnel.pkPledge" as any)}</label>
              <div className="text-[20px] font-medium">{format(financing.pkVorbezug)}</div>
            </>
          )}

   <label className="text-[18px] font-light opacity-70">
  {t("funnel.mortgageDuration" as any)}
</label>
<div className="text-[20px] font-medium">{laufzeitLabel}</div>


          {!isJur && (
            <>
              <label className="text-[18px] font-light opacity-70">{t("funnel.incomeDetails" as any)}</label>
              <div className="text-[20px] font-medium">
                {CHF(financing.brutto)}
                {financing.bonus ? ` ${t("funnel.withBonus" as any)}` : ""}
              </div>
            </>
          )}

          {!isJur && !isPartner && project.projektArt !== "abloesung" && (
            <>
              <label className="text-[18px] font-light opacity-70">
                {t("funnel.taxOptimization" as any)}
              </label>
              <div className="text-[20px] font-medium">{format(financing.steueroptimierung)}</div>
            </>
          )}

          {/* Annual Net Rental Income */}
          <label className="text-[18px] font-light opacity-70">
            {t("funnel.annualNetRentalIncome" as any)}
          </label>
          <div className="text-[20px] font-medium">{CHF(financing.jaehrlicher_netto_mietertrag)}</div>



          {/* Show correct date label and value depending on project type */}
          {project.projektArt === "kauf" && (
            <>
              <label className="text-[18px] font-light opacity-70">
                {t("funnel.purchaseDate" as any)}
              </label>
              <div className="text-[20px] font-medium">{formatDate(financing.kaufdatum)}</div>
            </>
          )}
          {project.projektArt === "abloesung" && (
            <>
              <label className="text-[18px] font-light opacity-70">
                {t("funnel.redemptionDate" as any)}
              </label>
              <div className="text-[20px] font-medium">{formatDate(financing.abloesedatum)}</div>
            </>
          )}

          {/* Warning if purchase date is less than 30 days ago */}
          {(() => {
            if (!financing.kaufdatum) return null;
            const today = new Date();
            let kaufDate: Date | null = null;
            if (financing.kaufdatum.includes("-")) {
              // yyyy-mm-dd
              const [y, m, d] = financing.kaufdatum.split("-");
              kaufDate = new Date(Number(y), Number(m) - 1, Number(d));
            } else if (financing.kaufdatum.includes(".")) {
              // dd.mm.yyyy
              const [d, m, y] = financing.kaufdatum.split(".");
              kaufDate = new Date(Number(y), Number(m) - 1, Number(d));
            }
            if (!kaufDate) return null;
            const diffDays = Math.floor((today.getTime() - kaufDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 30) {
              return (
                <div className="text-red-600 text-[15px] mt-2">
                  {t("funnel.purchaseDateWarning" as any) || "Warning: Financing cannot be guaranteed if the purchase date is less than 30 days ago."}
                </div>
              );
            }
            return null;
          })()}

          <label className="text-[18px] font-light opacity-70">{t("funnel.comment" as any)}</label>
          <div className="text-[20px] font-medium">{format(financing.kommentar)}</div>
        </CardSection>
      </div>

      {/* ================= BUTTONS ================= */}
      <div className="flex justify-between pt-16">
        <button
          onClick={back}
          className="px-6 py-2 rounded-full border border-[#132219]"
        >
          {t("funnel.back" as any)}
        </button>

        <button
          onClick={saveStep}
          className="px-10 py-2 rounded-full bg-[#CAF476] text-[#132219] font-semibold"
        >
          {t("funnel.continue" as any)}
        </button>
      </div>
    </div>
  );
}
