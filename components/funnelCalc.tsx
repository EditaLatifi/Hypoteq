"use client";

import { useTranslation } from "@/hooks/useTranslation";

// Format CHF
function CHF(v: number) {
  return "CHF " + Math.round(v).toLocaleString("de-CH");
}

interface FunnelCalcProps {
  data: any;
  projectData?: any;
  propertyData?: any;
  borrowers?: any[];
}

// Product interest rates (for monthly cost display only)
const getRealRate = (modell: string) => {
  switch (modell) {
    case "saron":
      return 0.0085;
    case "1":
      return 0.0097;
    case "2":
      return 0.0102;
    case "3":
      return 0.0113;
    case "4":
      return 0.0122;
    case "5":
      return 0.0130;
    case "6":
      return 0.0136;
    case "7":
      return 0.0142;
    case "8":
      return 0.0149;
    case "9":
      return 0.0155;
    case "10":
      return 0.0160;
    case "mix":
      return (0.0113 + 0.0160) / 2;
    default:
      return 0.0085;
  }
};

// CRITICAL: Stress rate MUST be 0.05 for ALL affordability calculations
const STRESS_RATE = 0.05;
const MAINTENANCE_RATE = 0.008;
const AFFORDABILITY_THRESHOLD = 0.35;

export default function FunnelCalc({ data, projectData, propertyData, borrowers }: FunnelCalcProps) {
  const { t } = useTranslation();
  
  const projektArt = projectData?.projektArt?.toLowerCase();
  const borrowerType = borrowers?.[0]?.type;
  const isJur = borrowerType === "jur";
  const nutzung = propertyData?.nutzung || data.nutzung;
  
  // Determine property usage type
  const isRendite = nutzung === "Rendite-Immobilie" || 
                    nutzung?.toLowerCase()?.includes("rendite") ||
                    nutzung?.toLowerCase()?.includes("investment");
  
  // ❌ DO NOT apply calculator for investment/rental properties
  if (isRendite) {
    return null;
  }
  
  const isZweitwohnsitz = nutzung?.toLowerCase()?.includes("zweit") || 
                          nutzung?.toLowerCase()?.includes("ferien") || 
                          nutzung?.toLowerCase()?.includes("secondary");
  
  // Determine if primary residence (Hauptwohnsitz)
  const isPrimaryResidence = !isZweitwohnsitz;
  
  // Set parameters based on residence type (EXACT same as Homepage)
  const ltvLimit = isPrimaryResidence ? 0.8 : 0.65;
  const minEquityPct = isPrimaryResidence ? 0.2 : 0.35;
  const firstMortgageLimit = isPrimaryResidence ? 0.6667 : 0;
  const amortizationYears = isPrimaryResidence ? 15 : 0;

  /* ==========================================
     PURCHASE (KAUF)
  ========================================== */
  if (projektArt === "kauf") {
    const propertyPrice = Number(data.kaufpreis || 0);
    
    const ownFunds = isJur
      ? Number(data.eigenmittel_bar || 0)
      : Number(data.eigenmittel_bar || 0) +
        Number(data.eigenmittel_saeule3 || 0) +
        Number(data.eigenmittel_pk || 0) +
        Number(data.eigenmittel_schenkung || 0);
    
    // Total mortgage = property price - own funds
    const totalMortgage = Math.max(0, propertyPrice - ownFunds);
    
    // --- EXPLICIT LTV CALCULATION ---
    const ltv = propertyPrice > 0 ? totalMortgage / propertyPrice : 0;
    const ltvOk = ltv <= ltvLimit;
    
    // --- EQUITY CHECK ---
    const equityRatio = propertyPrice > 0 ? ownFunds / propertyPrice : 0;
    const equityOk = equityRatio >= minEquityPct;
    
    // --- AFFORDABILITY CALCULATION (Natural persons only) ---
    let affordability = 0;
    let affordabilityOk = true;
    
    if (!isJur) {
      const grossIncome = Number(data.brutto || 0) + Number(data.bonus || 0);
      
      let affordabilityCHF = 0;
      if (isPrimaryResidence) {
        // Primary residence: includes amortisation
        affordabilityCHF = totalMortgage * (STRESS_RATE + MAINTENANCE_RATE + ((0.8 - 0.6667) / 15));
      } else {
        // Secondary residence: no amortisation
        affordabilityCHF = totalMortgage * (STRESS_RATE + MAINTENANCE_RATE);
      }
      
      affordability = grossIncome > 0 ? affordabilityCHF / grossIncome : 0;
      affordabilityOk = affordability <= AFFORDABILITY_THRESHOLD;
    }
    
    // --- TOP BOX AGGREGATOR ONLY ---
    const eligible = ltvOk && equityOk && affordabilityOk;
    
    // Has inputs check (to prevent red color on empty form)
    const hasInputs = propertyPrice > 0 || ownFunds > 0;
    
    /* JURISTISCHE PERSON VIEW */
    if (isJur) {
      return (
        <BoxWrapper>
          <TopBox
            title={hasInputs && !eligible ? t("funnelCalc.notEligible") : t("funnelCalc.calculation")}
            subtitle={t("funnelCalc.estimatedFinancingNeed")}
            value={CHF(totalMortgage)}
            error={hasInputs && !eligible}
          />
          
          <TwoBoxGrid
            leftLabel={t("funnelCalc.ownFunds")}
            leftValue={CHF(ownFunds)}
            leftError={hasInputs && !equityOk}
            rightLabel={t("funnelCalc.mortgage")}
            rightValue={CHF(totalMortgage)}
            rightError={hasInputs && !ltvOk}
          />
        </BoxWrapper>
      );
    }
    
    /* NATÜRLICHE PERSON VIEW */
    return (
      <BoxWrapper>
        <TopBox
          title={hasInputs && !eligible ? t("funnelCalc.notEligible") : t("funnelCalc.financingPossible")}
          subtitle={t("funnelCalc.estimatedMortgageNeed")}
          value={CHF(totalMortgage)}
          error={hasInputs && !eligible}
        />
        
        <TwoBoxGrid
          leftLabel={t("funnelCalc.ownFunds")}
          leftValue={`${(equityRatio * 100).toFixed(1).replace(".", ",")}%`}
          leftError={hasInputs && !equityOk}
          rightLabel={t("funnelCalc.affordability")}
          rightValue={`${(affordability * 100).toFixed(1).replace(".", ",")}%`}
          rightError={hasInputs && !affordabilityOk}
        />
      </BoxWrapper>
    );
  }

  /* ==========================================
     REFINANCING (ABLÖSUNG)
  ========================================== */
  if (projektArt === "abloesung") {
    const existingMortgage = Number(data.abloesung_betrag || 0);
    const mortgageIncrease = data.erhoehung === "Ja" ? Number(data.erhoehung_betrag || 0) : 0;
    
    // Total mortgage = existing + increase
    const totalMortgage = existingMortgage + mortgageIncrease;
    
    // Property value for LTV calculation (only if actually provided)
    const propertyValue = Number(data.immobilienwert || 0) || Number(data.kaufpreis || 0);

    // --- EXPLICIT LTV CALCULATION ---
    // Skip LTV check if no property value is provided (refinancing may not have one)
    const ltv = propertyValue > 0 ? totalMortgage / propertyValue : 0;
    const ltvOk = propertyValue > 0 ? ltv <= ltvLimit : true;
    
    // --- AFFORDABILITY CALCULATION (Natural persons only) ---
    let affordability = 0;
    let affordabilityOk = true;
    
    if (!isJur) {
      const grossIncome = Number(data.brutto || 0) + Number(data.bonus || 0);
      
      let affordabilityCHF = 0;
      if (isPrimaryResidence) {
        // Primary residence: includes amortisation
        affordabilityCHF = totalMortgage * (STRESS_RATE + MAINTENANCE_RATE + ((0.8 - 0.6667) / 15));
      } else {
        // Secondary residence: no amortisation
        affordabilityCHF = totalMortgage * (STRESS_RATE + MAINTENANCE_RATE);
      }
      
      affordability = grossIncome > 0 ? affordabilityCHF / grossIncome : 0;
      affordabilityOk = affordability <= AFFORDABILITY_THRESHOLD;
    }
    
    // --- TOP BOX AGGREGATOR ONLY ---
    const eligible = ltvOk && affordabilityOk;
    
    // Has inputs check
    const hasInputs = totalMortgage > 0 || propertyValue > 0;
    
    /* JURISTISCHE PERSON VIEW */
    if (isJur) {
      return (
        <BoxWrapper>
          <TopBox
            title={hasInputs && !eligible ? t("funnelCalc.notEligible") : t("funnelCalc.calculation")}
            subtitle={t("funnelCalc.estimatedFinancingNeed")}
            value={CHF(totalMortgage)}
            error={hasInputs && !eligible}
          />
          
          <TwoBoxGrid
            leftLabel={t("funnelCalc.mortgage")}
            leftValue={CHF(totalMortgage)}
            leftError={false}
            rightLabel={t("funnelCalc.increase")}
            rightValue={CHF(mortgageIncrease)}
            rightError={false}
          />
        </BoxWrapper>
      );
    }
    
    /* NATÜRLICHE PERSON VIEW */
    return (
      <BoxWrapper>
        <TopBox
          title={hasInputs && !eligible ? t("funnelCalc.notEligible") : t("funnelCalc.financingPossible")}
          subtitle={t("funnelCalc.currentMortgageWithIncrease")}
          value={CHF(totalMortgage)}
          error={hasInputs && !eligible}
        />
        
        <TwoBoxGrid
          leftLabel={t("funnelCalc.currentMortgage")}
          leftValue={CHF(existingMortgage)}
          leftError={false}
          rightLabel={t("funnelCalc.affordabilityPercentage")}
          rightValue={`${(affordability * 100).toFixed(1).replace(".", ",")}%`}
          rightError={hasInputs && !affordabilityOk}
        />
      </BoxWrapper>
    );
  }

  return null;
}

/* ==========================================
   UI COMPONENTS
========================================== */
/* ============================================================================
 * Presentation only, from here down.
 *
 * The mockup replaces the lime boxes with one dark panel beside the inputs: the verdict as a
 * small uppercase line, the figure it produces in display type, and the checks beneath it.
 * Every number, every rule and every caller above is untouched — this is the same calculator
 * wearing the design, which matters more here than anywhere else in the funnel, because a
 * second opinion about whether a purchase is financeable is the one thing this screen must
 * never produce.
 * ========================================================================= */

function BoxWrapper({ children }: any) {
  return (
    <div
      className="w-full max-w-[444px] flex flex-col gap-5"
      style={{
        background: "var(--forest-800)",
        borderRadius: "var(--radius-lg)",
        padding: 26,
      }}
    >
      {children}
    </div>
  );
}

function TopBox({ title, subtitle, value, error = false }: any) {
  return (
    <div className="flex flex-col gap-2.5">
      <span
        style={{
          fontSize: "var(--text-micro)",
          letterSpacing: "var(--tracking-label)",
          textTransform: "uppercase",
          color: error ? "var(--warning-500)" : "var(--lime-500)",
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: "var(--text-body-sm)", color: "var(--on-dark-70)" }}>
        {subtitle}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-display-2)",
          lineHeight: 1,
          color: error ? "var(--warning-500)" : "var(--lime-500)",
          fontWeight: "var(--weight-bold)" as any,
          letterSpacing: "var(--tracking-tight)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function TwoBoxGrid({ leftLabel, leftValue, leftError = false, rightLabel, rightValue, rightError = false }: any) {
  return (
    <>
      <div style={{ height: 1, background: "var(--on-dark-14)" }} />
      <div className="flex flex-col gap-4">
        <SmallBox label={leftLabel} value={leftValue} error={leftError} />
        <SmallBox label={rightLabel} value={rightValue} error={rightError} />
      </div>
    </>
  );
}

function SmallBox({ label, value, error = false }: any) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ fontSize: "var(--text-body-sm)", color: "var(--on-dark-70)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lead)",
          fontWeight: "var(--weight-semibold)" as any,
          color: error ? "var(--warning-500)" : "#fff",
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}
