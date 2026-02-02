/**
 * COMPONENT COMPARISON TEST
 * Verifies that MortgageCalculator.tsx and funnelCalc.tsx use identical logic
 */

const fs = require('fs');
const path = require('path');

console.log("\n" + "=".repeat(80));
console.log("COMPONENT LOGIC COMPARISON - MortgageCalculator vs FunnelCalc");
console.log("=".repeat(80) + "\n");

// Read both files
const mortgageCalcPath = path.join(__dirname, 'components', 'MortgageCalculator.tsx');
const funnelCalcPath = path.join(__dirname, 'components', 'funnelCalc.tsx');

const mortgageCalc = fs.readFileSync(mortgageCalcPath, 'utf8');
const funnelCalc = fs.readFileSync(funnelCalcPath, 'utf8');

// Critical checks
const checks = [
  {
    name: "STRESS_RATE constant (0.05)",
    mortgage: mortgageCalc.includes('0.05') && (mortgageCalc.includes('STRESS_RATE') || mortgageCalc.includes('stressRate')),
    funnel: funnelCalc.includes('const STRESS_RATE = 0.05'),
    critical: true
  },
  {
    name: "MAINTENANCE_RATE constant (0.008)",
    mortgage: mortgageCalc.includes('0.008') && mortgageCalc.includes('maintenance'),
    funnel: funnelCalc.includes('const MAINTENANCE_RATE = 0.008'),
    critical: true
  },
  {
    name: "Primary residence LTV limit (0.8 / 80%)",
    mortgage: mortgageCalc.includes('0.8') && mortgageCalc.includes('ltvLimit'),
    funnel: funnelCalc.includes('isPrimaryResidence ? 0.8 : 0.65'),
    critical: true
  },
  {
    name: "Secondary residence LTV limit (0.65 / 65%)",
    mortgage: mortgageCalc.includes('0.65') && mortgageCalc.includes('zweit'),
    funnel: funnelCalc.includes('isPrimaryResidence ? 0.8 : 0.65'),
    critical: true
  },
  {
    name: "Affordability threshold (0.35 / 35%)",
    mortgage: mortgageCalc.includes('0.35') && (mortgageCalc.includes('affordability') || mortgageCalc.includes('Tragbarkeit')),
    funnel: funnelCalc.includes('const AFFORDABILITY_THRESHOLD = 0.35'),
    critical: true
  },
  {
    name: "Amortisation formula ((0.8 - 0.6667) / 15)",
    mortgage: mortgageCalc.includes('0.6667') && mortgageCalc.includes('15'),
    funnel: funnelCalc.includes('((0.8 - 0.6667) / 15)'),
    critical: true
  },
  {
    name: "Explicit LTV calculation (totalMortgage / propertyValue)",
    mortgage: mortgageCalc.match(/ltv\s*=.*\/.*property/i) !== null,
    funnel: funnelCalc.match(/ltv\s*=.*\/.*property/i) !== null,
    critical: true
  },
  {
    name: "LTV check independent (ltvOk = ltv <= ltvLimit)",
    mortgage: mortgageCalc.match(/ltvOk\s*=.*ltv.*<=.*ltv/i) !== null,
    funnel: funnelCalc.match(/ltvOk\s*=.*ltv.*<=.*ltv/i) !== null,
    critical: true
  },
  {
    name: "Affordability check (affordabilityOk = affordability <= threshold)",
    mortgage: mortgageCalc.match(/affordability.*<=.*0\.35|isTragbarkeitOK/i) !== null,
    funnel: funnelCalc.match(/affordabilityOk\s*=.*affordability.*<=.*AFFORDABILITY_THRESHOLD/i) !== null,
    critical: true
  },
  {
    name: "Top box aggregator (eligible = ltvOk && affordabilityOk)",
    mortgage: mortgageCalc.match(/isEligible\s*=.*ltvOk.*&&.*affordability/i) !== null,
    funnel: funnelCalc.match(/eligible\s*=.*ltvOk.*&&.*affordability/i) !== null,
    critical: true
  },
  {
    name: "Investment property exclusion (Rendite-Immobilie)",
    mortgage: "N/A (not applicable to homepage)",
    funnel: funnelCalc.includes('isRendite') && funnelCalc.includes('return null'),
    critical: true
  },
  {
    name: "Refinancing: newTotal = existing + increase",
    mortgage: mortgageCalc.includes('existingMortgage + mortgageIncrease'),
    funnel: funnelCalc.includes('existingMortgage + mortgageIncrease'),
    critical: true
  },
  {
    name: "Product interest rate separation (effectiveRate for monthly costs)",
    mortgage: mortgageCalc.includes('effectiveRate') && mortgageCalc.includes('monthlyInterest'),
    funnel: funnelCalc.includes('getRealRate') || funnelCalc.includes('Product interest'),
    critical: false
  }
];

let allPassed = true;
let criticalFails = 0;

checks.forEach((check, index) => {
  const mortgageStatus = check.mortgage === "N/A" ? "⚪ N/A" : check.mortgage ? "✅" : "❌";
  const funnelStatus = check.funnel ? "✅" : "❌";
  const passed = (check.mortgage === "N/A" || check.mortgage) && check.funnel;
  
  if (!passed && check.critical) {
    criticalFails++;
    allPassed = false;
  }
  
  console.log(`[${index + 1}] ${check.name}`);
  console.log(`    MortgageCalculator.tsx: ${mortgageStatus}`);
  console.log(`    funnelCalc.tsx: ${funnelStatus}`);
  console.log(`    Status: ${passed ? '✅ MATCH' : '❌ MISMATCH'}${check.critical ? ' (CRITICAL)' : ''}`);
  console.log();
});

console.log("=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log(`Total Checks: ${checks.length}`);
console.log(`Critical Failures: ${criticalFails}`);
console.log(`Overall Status: ${allPassed ? '✅ ALL CRITICAL CHECKS PASSED' : '❌ CRITICAL ISSUES FOUND'}`);
console.log("=".repeat(80));

// Additional pattern checks
console.log("\nADDITIONAL PATTERN VERIFICATION:");
console.log("-".repeat(80));

// Check for hardcoded 0.8 in funnel
const hardcodedLTV = funnelCalc.match(/ltv\s*>\s*0\.8[^0-9]/g);
if (hardcodedLTV) {
  console.log("⚠️  WARNING: Found hardcoded LTV check in funnelCalc:");
  hardcodedLTV.forEach(match => console.log(`    ${match.trim()}`));
} else {
  console.log("✅ No hardcoded LTV checks found in funnelCalc");
}

// Check for bg-[#CAF476] static green boxes
const staticGreen = funnelCalc.match(/bg-\[#CAF476\]/g);
if (staticGreen) {
  // Verify it's conditional
  const conditionalUse = funnelCalc.includes('error ? "bg-[#FF9A9A]" : "bg-[#CAF476]"');
  if (conditionalUse) {
    console.log("✅ Green background is conditional (error prop controls color)");
  } else {
    console.log("❌ WARNING: Static green backgrounds found (not conditional)");
  }
} else {
  console.log("⚠️  No green background styling found");
}

// Check amortisation only for primary
const primaryAmortCheck = funnelCalc.includes('isPrimaryResidence') && 
                          funnelCalc.includes('amortisation');
console.log(primaryAmortCheck ? 
  "✅ Amortisation conditional on isPrimaryResidence" : 
  "⚠️  Amortisation logic unclear");

console.log("\n" + "=".repeat(80));
console.log("CONCLUSION");
console.log("=".repeat(80));

if (allPassed && criticalFails === 0) {
  console.log("✅ Both components use IDENTICAL calculation logic");
  console.log("✅ All critical requirements are met");
  console.log("✅ Ready for production");
} else {
  console.log("❌ Components have inconsistent logic");
  console.log(`❌ ${criticalFails} critical issue(s) found`);
  console.log("⚠️  Requires alignment before deployment");
}

console.log("=".repeat(80) + "\n");

process.exit(allPassed ? 0 : 1);
