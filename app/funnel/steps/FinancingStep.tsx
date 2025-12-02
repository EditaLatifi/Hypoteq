"use client";

import FunnelCalc from "@/components/funnelCalc";
import { useTranslation } from "@/hooks/useTranslation";

function FinancingStep({
  data,
  setData,
  projectData,
  propertyData,
  customerType,
  saveStep,
    borrowers, 
  back,
}: any) {
  const { t } = useTranslation();
  console.log("🔥 FinancingStep Debug:", {
  customerType,
  borrowers,
  projectArt: projectData?.projektArt,
  nutzung: propertyData?.nutzung
});

  /* ==========================
      LOGIC CHECKS
  =========================== */
/* ==========================
   RREGULLIMI LOGJIK
   ========================== */

const normalizedCustomer = (customerType || "").toLowerCase();
const isDirect = normalizedCustomer === "direct";
const isPartner = normalizedCustomer === "partner";

  const projectArt = projectData?.projektArt?.toLowerCase();
  const isKauf = projectArt === "kauf";
  const isAblösung = projectArt === "abloesung";

  const borrowerType = borrowers?.[0]?.type || "nat";
  const isJur = borrowerType === "jur";
  const isNat = borrowerType === "nat";

  // Check if Rendite object
  const isRendite = propertyData?.nutzung === "Rendite-Immobilie" || 
                    propertyData?.nutzung?.toLowerCase()?.includes("rendite") ||
                    propertyData?.nutzung?.toLowerCase()?.includes("investment");
                    
  /* ==========================
   SHFAQJA E SEKSIONEVE
   ========================== */

const showNeukauf = isKauf;           // Mjafton
const showAblosung = isAblösung;     // Mjafton

  /* ==========================
      HANDLERS
  =========================== */
  const handleChange = (key: string, value: any) => {
    setData((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  };
  const formatCHF = (value: string | number) => {
  if (!value) return "";
  const num = typeof value === "string" ? Number(value.replace(/'/g, "")) : value;
  return num.toLocaleString("de-CH"); // Formats 100000 → 100'000
};


const ToggleButton = ({ active, children, onClick }: any) => {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-3
        px-6 py-2.5 rounded-full border text-sm transition-all
        ${active ? "bg-[#CAF476] border-[#132219] text-[#132219]" : "bg-white border-[#C8C8C8] text-[#132219]"}
      `}
      style={{ minHeight: "40px" }}
    >
      {/* Full Circle Indicator */}
      <span
        className={`w-4 h-4 rounded-full flex-shrink-0
          ${active ? "bg-[#132219]" : "bg-[#132219]"} 
        `}
      ></span>
      {children}
    </button>
  );
};


  const inputStyle =
    "px-5 py-2 border border-[#132219] rounded-full text-sm w-full";

  return (
    <div className="pt-[150px] md:pt-0 w-full max-w-[1400px] mx-auto px-4 md:px-6 lg:pl-20 -mt-10">

      {/* ====================================================== */}
      {/* NEUKAUF (Direct + Natürliche/Juristische Person) */}
      {/* ====================================================== */}
      {showNeukauf && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 lg:gap-10">

          {/* LEFT SIDE */}
          <div className="space-y-6 lg:space-y-10">
            <h1 className="text-3xl lg:text-4xl font-semibold">{t("funnel.newPurchase" as any)}</h1>

     {/* Kaufpreis */}
<div>
<input
  type="text"
  placeholder={t("funnel.amount" as any)}
  className={inputStyle}
  value={data.kaufpreis ? `CHF ${formatCHF(data.kaufpreis)}` : ""}
  onChange={(e) => {
    const rawValue = e.target.value.replace(/CHF\s?|'/g, "");
    const numericValue = rawValue.replace(/\D/g, "");
    handleChange("kaufpreis", numericValue);
  }}
/>

</div>

{/* Eigenmittel */}
<div>
  <label className="font-medium">{t("funnel.ownFunds" as any)}</label>

  {/* Juristische Person → Only 1 field */}
  {isJur ? (
    <div className="mt-3">
      <input
        type="text"
        placeholder={t("funnel.ownFunds" as any)}
        className={inputStyle}
        value={
          data.eigenmittel_bar
            ? `CHF ${formatCHF(data.eigenmittel_bar)}`
            : ""
        }
        onChange={(e) => {
          const raw = e.target.value.replace(/CHF\s?|'/g, "");
          const numeric = raw.replace(/\D/g, "");
          handleChange("eigenmittel_bar", numeric);
        }}
      />
    </div>
  ) : (
    /* Natürliche Person → Full version */
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
      {[  
        { key: "eigenmittel_bar", placeholder: t("funnel.cash" as any) },
        { key: "eigenmittel_saeule3", placeholder: t("funnel.pillar3" as any) },
        { key: "eigenmittel_pk", placeholder: t("funnel.pensionFund" as any) },
        { key: "eigenmittel_schenkung", placeholder: t("funnel.donation" as any) },
      ].map(({ key, placeholder }) => (
        <input
          key={key}
          type="text"
          placeholder={placeholder}
          className={inputStyle}
          value={data[key] ? `CHF ${formatCHF(data[key])}` : ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/CHF\s?|'/g, "");
            const numeric = raw.replace(/\D/g, "");
            handleChange(key, numeric);
          }}
        />
      ))}

      {/* Total Eigenmittel */}
      <div className="col-span-1 md:col-span-2">
        <input
          type="text"
          disabled
          placeholder={t("funnel.amount" as any)}
          className={`${inputStyle} bg-[#F5F5F5] text-[#555] cursor-not-allowed`}
          value={(() => {
            const total =
              Number(data.eigenmittel_bar || 0) +
              Number(data.eigenmittel_saeule3 || 0) +
              Number(data.eigenmittel_pk || 0) +
              Number(data.eigenmittel_schenkung || 0);
            return total ? `CHF ${formatCHF(total)}` : "";
          })()}
        />
      </div>
    </div>
  )}
</div>


{/* PK-Verpfändung + Hypothekarlaufzeiten */}
<div className="flex flex-col md:flex-row gap-4 md:gap-[45px]">

{/* PK-Verpfändung – hide for juristische Personen and Rendite */}
{!isJur && !isRendite && (
  <div className="flex-1">
    <label className="font-medium">{t("funnel.pkPledge" as any)}</label>
    <div className="flex gap-4 mt-3">
      {[t("funnel.yes" as any), t("funnel.no" as any)].map((opt) => (
        <ToggleButton
          key={opt}
          active={data.pkVorbezug === opt}
          onClick={() => handleChange("pkVorbezug", opt)}
        >
          {opt}
        </ToggleButton>
      ))}
    </div>
  </div>
)}


{/* Hypothekarlaufzeiten */}
<div className="flex-1">
  <label className="font-medium">{t("funnel.hypothekarlaufzeiten" as any)}</label>

  <select
    className={`${inputStyle} mt-3 appearance-none pr-10`}
    value={data.modell || ""}
    onChange={(e) => handleChange("modell", e.target.value)}
  >
    <option value="">{t("funnel.pleaseSelect" as any)}</option>

    <option value="saron">{t("funnel.saron" as any)}</option>
    <option value="1">1 {t("funnel.years" as any)}</option>
    <option value="2">2 {t("funnel.years" as any)}</option>
    <option value="3">3 {t("funnel.years" as any)}</option>
    <option value="4">4 {t("funnel.years" as any)}</option>
    <option value="5">5 {t("funnel.years" as any)}</option>
    <option value="6">6 {t("funnel.years" as any)}</option>
    <option value="7">7 {t("funnel.years" as any)}</option>
    <option value="8">8 {t("funnel.years" as any)}</option>
    <option value="9">9 {t("funnel.years" as any)}</option>
    <option value="10">10 {t("funnel.years" as any)}</option>

    <option value="mix">{t("funnel.mix" as any)}</option>
  </select>
</div>

</div>


   {/* Einkommen – hide for juristische Personen */}
{!isJur && (
  <div>
    <label className="font-medium">
      {t("funnel.income" as any)}<br />
      {t("funnel.incomeDescription" as any)}
    </label>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
      <div className="col-span-1 md:col-span-2">
<input
  type="text"
  placeholder={t("funnel.grossIncome" as any)}
  className={inputStyle}
  value={data.brutto ? `CHF ${formatCHF(data.brutto)}` : ""}
  onChange={(e) => {
    const raw = e.target.value.replace(/CHF\s?|'/g, "");
    const numeric = raw.replace(/\D/g, ""); 
    handleChange("brutto", numeric);
  }}
/>

      </div>
    </div>
  </div>
)}


    {/* Steueroptimierung – hidden for juristische Personen and Partners */}
{!isJur && !isPartner && (
  <div>
    <label className="font-medium">
      {t("funnel.taxOptimization" as any)}
    </label>

    <div className="flex gap-4 mt-3">
      {[t("funnel.yes" as any), t("funnel.no" as any)].map((opt) => (
        <ToggleButton
          key={opt}
          active={data.steueroptimierung === opt}
          onClick={() => handleChange("steueroptimierung", opt)}
        >
          {opt}
        </ToggleButton>
      ))}
    </div>
  </div>
)}


            {/* Kaufdatum */}
            <div>
              <label className="font-medium">{t("funnel.purchaseDate" as any)}</label>
              <input
                type="date"
                placeholder="DD.MM.YYYY"
                className={inputStyle}
                value={data.kaufdatum ? (() => {
                  const parts = data.kaufdatum.split(".");
                  if (parts.length === 3) {
                    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
                  }
                  return data.kaufdatum;
                })() : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split("-");
                    const swissDate = `${d}.${m}.${y}`;
                    handleChange("kaufdatum", swissDate);
                  }
                }}
              />
            </div>

            {/* Kommentar */}
            <div>
              <label className="font-medium">{t("funnel.commentLabel" as any)}</label>
              <textarea
                className="w-full px-5 py-2 border border-[#132219] rounded-2xl text-sm"
                rows={4}
                value={data.kommentar || ""}
                onChange={(e) => handleChange("kommentar", e.target.value)}
              />
            </div>
          </div>

          {/* RIGHT SIDE – Calculator */}
          {!isJur && (
            <div className="w-full flex justify-center lg:justify-start">
              <div className="w-[444px] max-w-full">
<FunnelCalc data={data} projectData={projectData} propertyData={propertyData} borrowers={borrowers} />

            </div>
          </div>
          )}
        </div>
      )}

      {/* ====================================================== */}
      {/* ABLÖSUNG */}
      {/* ====================================================== */}
      {isAblösung && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 px-6 md:px-12">

          <div className="space-y-6 lg:space-y-10">
            <h1 className="text-3xl lg:text-4xl font-semibold">{t("funnel.redemption" as any)}</h1>

            {/* Hypothekarbetrag */}
            <div>
              <label className="font-medium">{t("funnel.hypothekarbetrag" as any)}</label>
      <input
  type="text"
  placeholder={t("funnel.amount" as any)}
  className={inputStyle}
  value={data.abloesung_betrag ? `CHF ${formatCHF(data.abloesung_betrag)}` : ""}
  onChange={(e) => {
    const raw = e.target.value.replace(/CHF\s?|'/g, ""); // hiq CHF, hapësira, '
    const numeric = raw.replace(/\D/g, ""); // vetëm numra
    handleChange("abloesung_betrag", numeric);
  }}
/>

            </div>

            {/* Erhöhung */}
            <div className="flex flex-col">
              <label className="font-medium mb-4">
                {t("funnel.mortgageIncreaseQuestion" as any)}
              </label>

              <div className="flex gap-4 mb-[13px]">
                {[t("funnel.yes" as any), t("funnel.no" as any)].map((opt) => (
                  <ToggleButton
                    key={opt}
                    active={data.erhoehung === opt}
                    onClick={() => handleChange("erhoehung", opt)}
                  >
                    {opt}
                  </ToggleButton>
                ))}
              </div>

              {data.erhoehung === "Ja" && (
       <input
  type="text"
  placeholder={t("funnel.amount" as any)}
  className={`${inputStyle} mt-[4px]`}
  value={data.erhoehung_betrag ? `CHF ${formatCHF(data.erhoehung_betrag)}` : ""}
  onChange={(e) => {
    const raw = e.target.value.replace(/CHF\s?|'/g, "");
    const numeric = raw.replace(/\D/g, "");
    handleChange("erhoehung_betrag", numeric);
  }}
/>

              )}
            </div>

   {/* Einkommen – hide for juristische Personen */}
{!isJur && (
  <div>
    <label className="font-medium">
      {t("funnel.income" as any)}<br />
      {t("funnel.incomeDescription" as any)}
    </label>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
      <div className="col-span-1 md:col-span-2">
<input
  type="text"
  placeholder={t("funnel.grossIncome" as any)}
  className={inputStyle}
  value={data.brutto ? `CHF ${formatCHF(data.brutto)}` : ""}
  onChange={(e) => {
    const raw = e.target.value.replace(/CHF\s?|'/g, "");
    const numeric = raw.replace(/\D/g, ""); 
    handleChange("brutto", numeric);
  }}
/>

      </div>
    </div>
  </div>
)}

    {/* Steueroptimierung – hidden for juristische Personen and Partners */}
{!isJur && !isPartner && (
  <div>
    <label className="font-medium">
      {t("funnel.taxOptimization" as any)}
    </label>

    <div className="flex gap-4 mt-3">
      {[t("funnel.yes" as any), t("funnel.no" as any)].map((opt) => (
        <ToggleButton
          key={opt}
          active={data.steueroptimierung === opt}
          onClick={() => handleChange("steueroptimierung", opt)}
        >
          {opt}
        </ToggleButton>
      ))}
    </div>
  </div>
)}


            {/* Kaufdatum */}
            <div>
              <label className="font-medium">{t("funnel.purchaseDate" as any)}</label>
              <input
                type="date"
                placeholder="DD.MM.YYYY"
                className={inputStyle}
                value={data.abloesedatum ? (() => {
                  const parts = data.abloesedatum.split(".");
                  if (parts.length === 3) {
                    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
                  }
                  return data.abloesedatum;
                })() : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split("-");
                    const swissDate = `${d}.${m}.${y}`;
                    handleChange("abloesedatum", swissDate);
                  }
                }}
              />
            </div>

            {/* Kommentar */}
            <div>
              <label className="font-medium">{t("funnel.comment" as any)}</label>
              <textarea
                className="w-full px-5 py-2 border border-[#132219] rounded-2xl text-sm"
                rows={4}
                value={data.kommentar || ""}
                onChange={(e) => handleChange("kommentar", e.target.value)}
              />
            </div>
          </div>

          <div className="w-full flex lg:justify-end justify-center">
            {!isJur && (
              <div className="max-w-[380px] w-full lg:ml-auto">
<FunnelCalc data={data} projectData={projectData} propertyData={propertyData} borrowers={borrowers} />

            </div>
            )}
          </div>

        </div>
      )}

      {/* NAVIGATION */}
      <div className="flex justify-between mt-8 lg:mt-14 px-4 lg:px-6 md:px-12">
        <button onClick={back} className="px-4 lg:px-6 py-2 border border-[#132219] rounded-full text-sm lg:text-base">
          {t("funnel.back" as any)}
        </button>

        <button
          onClick={saveStep}
          className="px-4 lg:px-6 py-2 bg-[#CAF476] text-[#132219] rounded-full text-sm lg:text-base"
        >
          {t("funnel.continue" as any)}
        </button>
      </div>
    </div>
  );
}

export default FinancingStep;
