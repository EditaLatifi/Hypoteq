"use client";


import { useTranslation } from "@/hooks/useTranslation";
// Funksion për formatim CHF
function CHF(v: number) {
  return "CHF " + Math.round(v).toLocaleString("de-CH");
}

interface FunnelCalcProps {
  data: any;
  projectData?: any;
  propertyData?: any;
  borrowers?: any[];
}

const getRealRate = (modell: string) => {
  switch (modell) {
    case "saron":
      return 0.0085;
    case "1":
    case "2":
    case "3":
    case "4":
      return 0.0105;
    case "5":
    case "6":
    case "7":
    case "8":
    case "9":
    case "10":
      return 0.0140;
    case "mix":
      return (0.0105 + 0.0140) / 2;
    default:
      return 0.01;
  }
};

const STRESS_RATE = 0.05;

export default function FunnelCalc({ data, projectData, propertyData, borrowers }: FunnelCalcProps) {
  const { t } = useTranslation();
  const projektArt = projectData?.projektArt?.toLowerCase();
  const borrowerType = borrowers?.[0]?.type;
  const isJur = borrowerType === "jur";
  const nutzung = propertyData?.nutzung || data.nutzung;
  const isRendite = nutzung === "Rendite-Immobilie" || 
                    nutzung?.toLowerCase()?.includes("rendite") ||
                    nutzung?.toLowerCase()?.includes("investment");
  const isZweitwohnsitz = nutzung?.toLowerCase()?.includes("zweit") || nutzung?.toLowerCase()?.includes("ferien") || nutzung?.toLowerCase()?.includes("secondary");
  const isSelbstbewohnt = nutzung?.toLowerCase()?.includes("selbstbewohnt");
  const isVermietet = nutzung?.toLowerCase()?.includes("vermietet");

  // Neue Hypo & Natürliche Person
  if (!isJur && projektArt === "kauf") {
    // b. Rendite: no input here, handled in form
    if (isRendite) {
      return null;
    }
    // d. Vermietet: no input here, handled in form
    if (isVermietet) {
      return null;
    }
    // a. Selbstbewohnt: kalkulo si Hauptwohnsitz
    if (isSelbstbewohnt) {
      // ...kalkulo si Immobilienkauf Hauptwohnsitz (kodi ekziston më poshtë)...
    }
    // c. Zweitwohnsitz: kalkulo si Zweitwohnsitz
    if (isZweitwohnsitz) {
      // ...kalkulo si Immobilienkauf Zweitwohnsitz (kodi ekziston më poshtë)...
    }
  }
  // Kontroll për Neue Hypo & Juristische Person (vetëm inputet, pa kalkulator)
  if (isJur && projektArt === "kauf") {
    return (
      <div>
        {/* Inputet bazë */}
        <Input label={t("funnelCalc.ownFunds")} value={data.eigenmittel_bar || ""} />
        {/* Selbstbewohnt, Zweitwohnsitz, Rendite, Vermietet */}
        {isSelbstbewohnt && <Input label={t("funnelCalc.ownerOccupied")} value={nutzung} />}
        {isZweitwohnsitz && <Input label={t("funnelCalc.secondHome")} value={nutzung} />}
        {/* Rendite: vetëm Jährlicher Netto-Mietertrag */}
        {isRendite && <Input label={t("funnelCalc.netRentalIncome")} value={data.netto_mietertrag || ""} />}
        {/* Vermietet: Einkomen + Jährlicher Netto-Mietertrag */}
        {isVermietet && (
          <>
            <Input label={t("funnelCalc.income")} value={data.einkommen || ""} />
            <Input label={t("funnelCalc.netRentalIncome")} value={data.netto_mietertrag || ""} />
          </>
        )}
      </div>
    );
  }
  // Kontroll për Juristische Person & Selbstbewohnt, Rendite, Zweitwohnsitz, Vermietet
  if (isJur && isSelbstbewohnt) return null;
  if (isJur && isRendite) return null;
  if (isJur && isZweitwohnsitz) return null;
  if (isJur && isVermietet) return null;

  /* ------------------------------------------
     KAUF
  -------------------------------------------*/
  if (projektArt === "kauf") {
    const kaufpreis = Number(data.kaufpreis || 0);

    const eigenmittel = isJur
      ? Number(data.eigenmittel_bar || 0)
      : Number(data.eigenmittel_bar || 0) +
        Number(data.eigenmittel_saeule3 || 0) +
        Number(data.eigenmittel_pk || 0) +
        Number(data.eigenmittel_schenkung || 0);

    // Set thresholds based on residence type
    const minEigenmittelPct = isZweitwohnsitz ? 30 : 20;
    const maxBelehnungPct = isZweitwohnsitz ? 65 : 80;
    const tragbarkeitThreshold = 35;

    const hypothek = Math.max(kaufpreis - eigenmittel, 0);
    const belehnungPct = kaufpreis > 0 ? Math.round((hypothek / kaufpreis) * 100) : 0;

    /* ======================================
       HAS INPUTS → prevents early red color
       ====================================== */
    const hasInputs = kaufpreis > 0 || eigenmittel > 0;

    const eigenmittelPct = kaufpreis > 0 ? Math.round((eigenmittel / kaufpreis) * 100) : 0;

    let isNegative = false;

    /* For Juristische Personen */
    if (isJur) {
      isNegative = hasInputs && eigenmittelPct < minEigenmittelPct;
    } else {
      /* NATÜRLICHE PERSON */
      const einkommen = Number(data.brutto || 0) + Number(data.bonus || 0);
      const tragbarkeitPct =
        einkommen > 0
          ? ((hypothek * STRESS_RATE + kaufpreis * 0.008) / einkommen) * 100
          : 0;

      isNegative = hasInputs && (eigenmittelPct < minEigenmittelPct || belehnungPct > maxBelehnungPct || tragbarkeitPct > tragbarkeitThreshold);
    }

    /* ------------------------------------------
       JURISTISCHE PERSON VIEW
    -------------------------------------------*/
    if (isJur) {
      return (
        <BoxWrapper>
          <TopBox
            title={isNegative ? t("funnelCalc.notEligible") : t("funnelCalc.calculation")}
            subtitle={t("funnelCalc.estimatedFinancingNeed")}
            value={CHF(hypothek)}
            error={isNegative}
          />

          <TwoBoxGrid
            leftLabel={t("funnelCalc.ownFunds")}
            leftValue={CHF(eigenmittel)}
            rightLabel={t("funnelCalc.mortgage")}
            rightValue={CHF(hypothek)}
          />
        </BoxWrapper>
      );
    }

    /* ------------------------------------------
       NATÜRLICHE PERSON VIEW
    -------------------------------------------*/
    // For Rendite objects, hide Tragbarkeit
    if (isRendite) {
      return (
        <BoxWrapper>
          <TopBox
            title={isNegative ? t("funnelCalc.notEligible") : t("funnelCalc.financingPossible")}
            subtitle={t("funnelCalc.estimatedMortgageNeed")}
            value={CHF(hypothek)}
            error={isNegative}
          />

          <TwoBoxGrid
            leftLabel={t("funnelCalc.ownFunds")}
            leftValue={`${eigenmittelPct}%`}
            rightLabel={t("funnelCalc.mortgage")}
            rightValue={CHF(hypothek)}
          />
        </BoxWrapper>
      );
    }
    
    return (
      <BoxWrapper>
        <TopBox
          title={isNegative ? t("funnelCalc.notEligible") : t("funnelCalc.financingPossible")}
          subtitle={t("funnelCalc.estimatedMortgageNeed")}
          value={CHF(hypothek)}
          error={isNegative}
        />

        <TwoBoxGrid
          leftLabel={t("funnelCalc.ownFunds")}
          leftValue={`${eigenmittelPct}%`}
          rightLabel={t("funnelCalc.affordability")}
          rightValue={`${(
            ((hypothek * STRESS_RATE + kaufpreis * 0.008) /
              (Number(data.brutto || 0) + Number(data.bonus || 0) || 1)) *
            100
          ).toFixed(0)}%`}
        />
      </BoxWrapper>
    );
  }

  /* ------------------------------------------
     ABLÖSUNG
  -------------------------------------------*/
  if (projektArt === "abloesung") {
    const betrag = Number(data.abloesung_betrag || 0);
    const erhoehung =
      data.erhoehung === "Ja" ? Number(data.erhoehung_betrag || 0) : 0;

    const hypothek = betrag + erhoehung;

    const kaufpreis = Number(data.kaufpreis || 0);

    const hasInputs = hypothek > 0 || kaufpreis > 0;

    let isNegative = false;

    // Set thresholds based on residence type
    const minEigenmittelPct = isZweitwohnsitz ? 30 : 20;
    const maxBelehnungPct = isZweitwohnsitz ? 65 : 80;
    const tragbarkeitThreshold = 35;

    if (isJur) {
      const eigenmittelPct =
        kaufpreis > 0
          ? Math.round(((kaufpreis - hypothek) / kaufpreis) * 100)
          : 0;

      isNegative = hasInputs && eigenmittelPct < minEigenmittelPct;
    } else {
      const einkommen = Number(data.brutto || 0);

      const zinssatz = getRealRate(data.modell);
      const zinsen = (hypothek * zinssatz) / 12;
      const unterhalt = (kaufpreis ? kaufpreis * 0.008 : 0) / 12;

      // Use correct max Belehnung for Zweitwohnsitz
      const zweiteHypothek = kaufpreis > 0 ? Math.max(hypothek - kaufpreis * (maxBelehnungPct / 100), 0) : 0;

      const amortisation = zweiteHypothek > 0 ? zweiteHypothek / 15 / 12 : 0;

      const total = zinsen + unterhalt + amortisation;

      const belehnungPct = kaufpreis > 0 ? Math.round((hypothek / kaufpreis) * 100) : 0;
      const tragbarkeitPct = einkommen > 0 ? Math.round(((total * 12) / einkommen) * 100) : 0;

      isNegative = hasInputs && (belehnungPct > maxBelehnungPct || tragbarkeitPct > tragbarkeitThreshold);
    }

    /* ------------------------------------------
       JURISTISCHE PERSON
    -------------------------------------------*/
    if (isJur) {
      return (
        <BoxWrapper>
          <TopBox
            title={isNegative ? t("funnelCalc.notEligible") : t("funnelCalc.calculation")}
            subtitle={t("funnelCalc.estimatedFinancingNeed")}
            value={CHF(hypothek)}
            error={isNegative}
          />

          <TwoBoxGrid
            leftLabel={t("funnelCalc.mortgage")}
            leftValue={CHF(hypothek)}
            rightLabel={t("funnelCalc.increase")}
            rightValue={CHF(erhoehung)}
          />
        </BoxWrapper>
      );
    }

    /* ------------------------------------------
       NATÜRLICHE PERSON
    -------------------------------------------*/
    const einkommen = Number(data.brutto || 0) + Number(data.bonus || 0);
    
    const zinssatz = getRealRate(data.modell || "saron");
    const zinsen = hypothek * zinssatz;
    const unterhalt = kaufpreis ? kaufpreis * 0.008 : 0;
    const zweiteHypothek = kaufpreis > 0 ? Math.max(hypothek - kaufpreis * 0.8, 0) : 0;
    const amortisation = zweiteHypothek > 0 ? zweiteHypothek / 15 : 0;
    const totalJaehrlich = zinsen + unterhalt + amortisation;
    
    const tragbarkeitPct = einkommen > 0 ? (totalJaehrlich / einkommen) * 100 : 0;

    // For Rendite objects, hide Tragbarkeit
    if (isRendite) {
      return (
        <BoxWrapper>
          <TopBox
            title={isNegative ? t("funnelCalc.notEligible") : t("funnelCalc.financingPossible")}
            subtitle={t("funnelCalc.estimatedMortgageNeed")}
            value={CHF(hypothek)}
            error={isNegative}
          />

          <TwoBoxGrid
            leftLabel={t("funnelCalc.redemption")}
            leftValue={CHF(betrag)}
            rightLabel={t("funnelCalc.increase")}
            rightValue={CHF(erhoehung)}
          />
        </BoxWrapper>
      );
    }

    return (
      <BoxWrapper>
        <TopBox
          title={isNegative ? t("funnelCalc.notEligible") : t("funnelCalc.financingPossible")}
          subtitle={t("funnelCalc.estimatedMortgageNeed")}
          value={CHF(hypothek)}
          error={isNegative}
        />

        <TwoBoxGrid
          leftLabel={t("funnelCalc.mortgage")}
          leftValue={CHF(hypothek)}
          rightLabel={t("funnelCalc.affordability")}
          rightValue={`${tragbarkeitPct.toFixed(0)}%`}
        />
      </BoxWrapper>
    );
  }

  return null;
}

/* UI COMPONENTS */
function BoxWrapper({ children }: any) {
  return (
    <div className="w-full max-w-[444px] border border-black rounded-[10px] bg-white flex flex-col gap-[12px] p-[12px]">
      {children}
    </div>
  );
}

function TopBox({ title, subtitle, value, error = false }: any) {
  return (
    <div
      className={`w-full border border-black rounded-[10px]
      flex flex-col items-center gap-[12px] py-[14px] px-[12px]
      ${error ? "bg-[#FF9A9A]" : "bg-[#CAF476]"}`}
    >
      <p className="text-center text-[16px] font-medium text-[#132219]">
        {title}
        <br />
        {subtitle}
      </p>

      <div className="text-[38px] font-semibold">{value}</div>
    </div>
  );
}

function TwoBoxGrid({ leftLabel, leftValue, rightLabel, rightValue }: any) {
  return (
    <div className="w-full grid grid-cols-2 gap-[12px]">
      <SmallBox label={leftLabel} value={leftValue} />
      <SmallBox label={rightLabel} value={rightValue} />
    </div>
  );
}

function SmallBox({ label, value }: any) {
  return (
    <div className="bg-[#CAF476] border border-black rounded-[10px]
    flex flex-col items-center py-[14px] px-[12px] gap-[12px]">
      <p className="text-[20px] font-medium">{label}</p>
      <div className="border-t border-black w-full" />
      <p
        className="text-[32px] font-bold break-words overflow-x-auto w-full text-center sm:text-[28px] md:text-[32px] lg:text-[32px]"
        style={{ wordBreak: 'break-word' }}
      >
        {value}
      </p>
    </div>
  );
}

// Komponent i thjeshtë për input
function Input({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontWeight: "bold" }}>{label}</label>
      <input type="text" value={value} readOnly style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #ccc" }} />
    </div>
  );
}
