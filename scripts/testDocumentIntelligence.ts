/**
 * Exercises the Document Intelligence pipeline against generated fixtures.
 *
 *   npx tsx --require ./scripts/loadEnv.cjs scripts/testDocumentIntelligence.ts
 *
 * Calls the real provider, so it costs real tokens. It touches nothing else: no database,
 * no Salesforce, no SharePoint, no email.
 */

import { analyseDocument } from "../components/documentIntelligence/analyse";
import { buildPdf, FIXTURES } from "./makeTestPdf";

// A typical Kauf / bestehende Immobilie / angestellt case.
const VISIBLE = [
  "funnel.auskunftsermaechtigungDoc",
  "funnel.passportIDAllBorrowers",
  "funnel.ownFundsProofOfficial",
  "funnel.taxReturnLatest",
  "funnel.salaryStatementBonus",
  "funnel.monthlyPayslips3",
  "funnel.pensionFund3rdPillarBuyback",
  "funnel.landRegistryNotOlder6Months",
  "funnel.purchaseContractDraft",
];

const BORROWERS = [
  { id: "borrower_01", name: "Max Muster" },
  { id: "borrower_02", name: "Anna Muster" },
];

interface Expectation {
  fixture: keyof typeof FIXTURES;
  expectType: string;
  expectedDocKey?: string;
  note: string;
}

const CASES: Expectation[] = [
  { fixture: "lohnausweis", expectType: "salary_certificate", note: "klasifikim + ekstraktim" },
  {
    fixture: "grundbuchauszug",
    expectType: "land_registry_extract",
    note: "duhet shenuar si i vjeter (rregulli 6 muaj)",
  },
  {
    fixture: "stromrechnung",
    expectType: "unknown",
    expectedDocKey: "funnel.landRegistryNotOlder6Months",
    note: "dokument i gabuar per kerkesen",
  },
];

(async () => {
  let passed = 0;

  for (const c of CASES) {
    const fx = FIXTURES[c.fixture];
    const data = buildPdf(fx.lines);
    console.log(`\n${"=".repeat(66)}\n${fx.file}  (${c.note})\n${"=".repeat(66)}`);

    try {
      const a = await analyseDocument({
        fileName: fx.file,
        mimeType: "application/pdf",
        data,
        visibleFunnelKeys: VISIBLE,
        expectedFunnelKey: c.expectedDocKey ?? null,
        borrowers: BORROWERS,
      });

      console.log(`njohur     : ${a.classification.type}  (${Math.round(a.classification.confidence * 100)}%)`);
      console.log(`etiketa    : ${a.classification.label}`);
      console.log(`statusi    : ${a.status}`);
      console.log(`kerkesa    : ${a.funnelDocKey ?? "-"}`);
      console.log(`data       : ${a.documentDate ?? "-"}`);
      console.log(`person     : ${a.person?.borrowerId ?? "-"} (${Math.round((a.person?.confidence ?? 0) * 100)}%)`);
      console.log(`emri i ri  : ${a.suggestedFilename ?? "-"}`);
      if (a.mismatchedRequirement) {
        console.log(`GABIM      : pritej ${a.mismatchedRequirement.expected}, erdhi ${a.mismatchedRequirement.got}`);
      }
      if (a.freshness) {
        console.log(`I VJETER   : ${a.freshness.ageMonths} muaj, lejohet ${a.freshness.maxAgeMonths}`);
      }
      const fields = Object.entries(a.fields);
      console.log(`fusha (${fields.length}):`);
      for (const [k, v] of fields) {
        console.log(`   ${k.padEnd(22)} ${String(v.value)}${v.unit ? " " + v.unit : ""}  (${Math.round(v.confidence * 100)}%)`);
      }
      console.log(`koha       : ${a.audit.durationMs} ms  |  modeli: ${a.audit.model}`);

      const ok = a.classification.type === c.expectType;
      console.log(`\n-> pritej "${c.expectType}": ${ok ? "SAKTE" : "GABIM"}`);
      if (ok) passed++;
    } catch (e: any) {
      console.log("DESHTOI:", e.message);
    }
  }

  console.log(`\n${"=".repeat(66)}\nsakte: ${passed}/${CASES.length}`);
})();
