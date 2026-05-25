"use client";
import { useState, useEffect, useMemo } from "react";

export default function useMortgageCalculator() {
  const [propertyPrice, setPropertyPrice] = useState(0);
  const [ownFunds, setOwnFunds] = useState(0);
  const [income, setIncome] = useState(0);

  const [existingMortgage, setExistingMortgage] = useState(0);
  const [newMortgage, setNewMortgage] = useState(0);
  const [cashOut, setCashOut] = useState(false);

  const [slidersTouched, setSlidersTouched] = useState(false);
  const [requiredOwnFunds, setRequiredOwnFunds] = useState(0);
  const [requiredIncome, setRequiredIncome] = useState(0);

  const [residenceType, setResidenceType] = useState<"haupt" | "zweit" | null>(null);
  const [loanType, setLoanType] = useState<"purchase" | "refinancing" | null>(null);
  const [interestOption, setInterestOption] = useState("Saron ab 0.85%");

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

  // Auto adjust min values
  useEffect(() => {
    if (requiredOwnFunds > 0 && ownFunds < requiredOwnFunds) setOwnFunds(requiredOwnFunds);
    if (requiredIncome > 0 && income < requiredIncome) setIncome(requiredIncome);
  }, [requiredOwnFunds, requiredIncome]);

  // Required funds/income calculation
  useEffect(() => {
    if (!loanType || !residenceType || propertyPrice <= 0) return;

    const minOwnFunds = propertyPrice * 0.2;
    const loanPart = propertyPrice * params.maxBelehnung;

    const amortSecond =
      residenceType === "haupt"
        ? Math.max(0, loanPart - propertyPrice * params.firstMortgageLimit) / params.amortizationYears
        : 0;

    const estMinIncome =
      (loanPart * params.stressRate + propertyPrice * params.maintenanceRate + amortSecond) /
      params.tragbarkeitThreshold;

    setRequiredOwnFunds(minOwnFunds);
    setRequiredIncome(Math.round(estMinIncome));
  }, [propertyPrice, residenceType, loanType]);


  // Interest options
  const interestOptions = [
    "Saron ab 0.85%",
    "1 Jahr ab 0.97%",
    "2 Jahre ab 0.98%",
    "3 Jahre ab 1.23%",
    "4 Jahre ab 1.21%",
    "5 Jahre ab 1.34%",
    "6 Jahre ab 1.29%",
    "7 Jahre ab 1.43%",
    "8 Jahre ab 1.34%",
    "9 Jahre ab 1.39%",
    "10 Jahre ab 1.56%",
  ];

  const effectiveRate = useMemo(() => {
    if (interestOption.startsWith("Saron ab")) return 0.0085;
    if (interestOption.startsWith("1 Jahr ab")) return 0.0097;
    if (interestOption.startsWith("2 Jahre ab")) return 0.0098;
    if (interestOption.startsWith("3 Jahre ab")) return 0.0123;
    if (interestOption.startsWith("4 Jahre ab")) return 0.0121;
    if (interestOption.startsWith("5 Jahre ab")) return 0.0134;
    if (interestOption.startsWith("6 Jahre ab")) return 0.0129;
    if (interestOption.startsWith("7 Jahre ab")) return 0.0143;
    if (interestOption.startsWith("8 Jahre ab")) return 0.0134;
    if (interestOption.startsWith("9 Jahre ab")) return 0.0139;
    if (interestOption.startsWith("10 Jahre ab")) return 0.0156;
    return 0.0085;
  }, [interestOption]);

  /* ----------------------------
     ✅ MORTGAGE CALCULATION
  -----------------------------*/

  const maxMortgage = propertyPrice * params.maxBelehnung;

  let mortgageNeed = 0;

  if (loanType === "purchase") {
    mortgageNeed = Math.max(0, propertyPrice - ownFunds);
  } else if (loanType === "refinancing") {
    mortgageNeed = newMortgage;
  }

  // Swiss rule: Cash-out only if equity ≥ 35%
  let refiLimit = maxMortgage;

  if (loanType === "refinancing") {
    const equityAfterRefi = propertyPrice - newMortgage;
    const equityRatio = equityAfterRefi / (propertyPrice || 1);

    // If cash-out would drop equity below 35%, block it
    if (cashOut && equityRatio < 0.35) {
      refiLimit = propertyPrice * 0.65;
    }
  }

  const actualMortgage =
    loanType === "refinancing"
      ? Math.min(newMortgage, refiLimit)
      : Math.min(mortgageNeed, maxMortgage);

  const firstMortgage = propertyPrice * params.firstMortgageLimit;
  const secondMortgage =
    residenceType === "haupt" ? Math.max(0, actualMortgage - firstMortgage) : 0;

  const interestYearStress = actualMortgage * params.stressRate;
  const maintenanceYear = propertyPrice * params.maintenanceRate;
  const amortizationYear =
    residenceType === "haupt" && secondMortgage > 0 && params.amortizationYears > 0
      ? secondMortgage / params.amortizationYears
      : 0;

  const tragbarkeitCHF = interestYearStress + maintenanceYear + amortizationYear;
  const tragbarkeitPercent = income > 0 ? tragbarkeitCHF / income : 0;

  const interestYearEffective = actualMortgage * effectiveRate;
  const monthlyCost =
    interestYearEffective / 12 + maintenanceYear / 12 + amortizationYear / 12;

  const belehnung = propertyPrice > 0 ? actualMortgage / propertyPrice : 0;

  const isBelehnungOK = belehnung <= params.maxBelehnung;
  const isTragbarkeitOK = tragbarkeitPercent <= params.tragbarkeitThreshold;
  const isEligible = isBelehnungOK && isTragbarkeitOK;

  const equityRefi =
    loanType === "refinancing"
      ? 1 - actualMortgage / (propertyPrice || 1)
      : (propertyPrice ? ownFunds / propertyPrice : 0);

  const infoTitle = isEligible
    ? loanType === "purchase"
      ? "Eligibility confirmed. Estimated mortgage need:"
      : "Eligibility confirmed. New mortgage possible up to:"
    : "Not eligible. Maximum possible mortgage:";

  const formatCHF = (num: number) => "CHF " + Math.round(num).toLocaleString("de-CH");
  const formatPercent = (num: number) => (num * 100).toFixed(1).replace(".", ",") + "%";

  return {
    propertyPrice, ownFunds, income, existingMortgage, newMortgage, cashOut,
    residenceType, loanType, interestOption, slidersTouched,
    requiredOwnFunds, requiredIncome, mortgageNeed, actualMortgage,
    tragbarkeitCHF, tragbarkeitPercent, maintenanceYear, amortizationYear,
    interestYearEffective, monthlyCost, belehnung, isEligible, infoTitle, interestOptions, equityRefi,

    setPropertyPrice, setOwnFunds, setIncome, setExistingMortgage, setNewMortgage,
    setCashOut, setResidenceType, setLoanType, setInterestOption, setSlidersTouched,

    formatCHF, formatPercent
  };
}
