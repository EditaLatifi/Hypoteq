import type { DocumentAnalysis } from "./types";
import { docTypeById } from "./documentTypes";

/**
 * Compare what a document says against what the customer already told the funnel
 * (spec sections 16, 17 and 28).
 *
 * Section 28 puts the decision here rather than in the model: whether a difference matters
 * is a HYPOTEQ rule. So this file holds the field mapping and the tolerances, and the model
 * is never asked whether something looks wrong.
 *
 * Two things keep this honest. Only fields marked `compare` in documentTypes are checked at
 * all — section 17 is explicit that not every extracted value should be argued with. And a
 * comparison is skipped entirely when the funnel has no value, because "the customer left
 * the field empty" is not a discrepancy and reporting it as one is how section 34 gets
 * violated: the customer is handed work that does not exist.
 */

export type ComparisonStatus = "match" | "mismatch" | "not_comparable";

export interface Comparison {
  /** Extracted field key, e.g. "grossAnnualSalary". */
  field: string;
  /** German label for the UI. */
  label: string;
  funnelValue: string | number | null;
  documentValue: string | number | boolean | null;
  /** Absolute difference, for numeric comparisons only. */
  difference?: number;
  status: ComparisonStatus;
  /** Why a comparison was skipped, when it was. */
  reason?: string;
}

/** The funnel values a document can be checked against. */
export interface FunnelFacts {
  /** financing.einkommen — see the note on the mapping below. */
  annualIncome?: number | null;
  purchasePrice?: number | null;
  ownFundsTotal?: number | null;
  existingMortgage?: number | null;
  propertyLocation?: string | null;
  borrowers?: Array<{ firstName?: string; lastName?: string; birthdate?: string }>;
}

interface CompareRule {
  /** Extracted field key. */
  field: string;
  /** Reads the funnel side. Returning null or undefined skips the comparison. */
  funnel: (f: FunnelFacts) => string | number | null | undefined;
  /**
   * Fraction of the larger value that may differ before it counts as a mismatch.
   *
   * Not zero, deliberately: a purchase price gets rounded in conversation and a salary
   * certificate is a year behind what the customer declares, so a tolerance of zero would
   * flag almost every honest dossier and train staff to ignore the warnings.
   *
   * But kept tight enough to honour the spec's own worked example — section 16 shows
   * CHF 150'000 declared against CHF 142'300 on the certificate, a 5% gap, and expects the
   * customer to be asked about it. Anything looser than that silently hides the case the
   * feature was specified around.
   */
  tolerance?: number;
  /** Compare as names rather than numbers. */
  kind?: "number" | "name" | "text";
}

/**
 * KNOWN GAP — income. The funnel stores one figure, `financing.einkommen`, and does not
 * define whether it is gross or net, nor whether it covers one borrower or the household.
 * It is compared against the gross annual salary because that is what the funnel's wording
 * asks for.
 *
 * On a two-earner dossier a single Lohnausweis will therefore fall short of the declared
 * household figure and be reported as a discrepancy it is not. Widening the tolerance to
 * absorb that was the first instinct and it is the wrong trade: it would also swallow the
 * exact case section 16 specifies. So the tolerance stays tight, the false positive stands,
 * and the real fix is to pin down what that funnel field means — flagged rather than
 * papered over.
 */
const RULES: Record<string, CompareRule[]> = {
  salary_certificate: [
    { field: "grossAnnualSalary", funnel: (f) => f.annualIncome, tolerance: 0.02, kind: "number" },
    { field: "employee", funnel: (f) => borrowerName(f), kind: "name" },
  ],
  monthly_payslip: [{ field: "employer", funnel: () => null, kind: "text" }],
  identity_document: [
    { field: "lastName", funnel: (f) => f.borrowers?.[0]?.lastName, kind: "name" },
    { field: "firstName", funnel: (f) => f.borrowers?.[0]?.firstName, kind: "name" },
    { field: "dateOfBirth", funnel: (f) => f.borrowers?.[0]?.birthdate, kind: "text" },
  ],
  purchase_contract: [
    { field: "purchasePrice", funnel: (f) => f.purchasePrice, tolerance: 0.02, kind: "number" },
    { field: "propertyAddress", funnel: (f) => f.propertyLocation, kind: "text" },
  ],
  own_funds_proof: [
    { field: "ownFundsTotal", funnel: (f) => f.ownFundsTotal, tolerance: 0.05, kind: "number" },
  ],
  mortgage_contract: [
    { field: "mortgageAmount", funnel: (f) => f.existingMortgage, tolerance: 0.02, kind: "number" },
  ],
  land_registry_extract: [{ field: "owner", funnel: (f) => borrowerName(f), kind: "name" }],
  tax_return: [],
  pension_fund_statement: [],
  authorisation_form: [
    { field: "fullName", funnel: (f) => borrowerName(f), kind: "name" },
  ],
};

function borrowerName(f: FunnelFacts): string | null {
  const b = f.borrowers?.[0];
  if (!b) return null;
  const name = [b.firstName, b.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

/** Swiss money as written on paper: "CHF 142'300.00", "142 300.-", "142,300". */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/CHF|Fr\.?/gi, "")
    .replace(/['’\s]/g, "")
    .replace(/\.-$/, "")
    .replace(/,(\d{2})$/, ".$1")
    .replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Names match when they contain the same words, in any order.
 *
 * "Muster, Max" on a Lohnausweis and "Max Muster" in the funnel are the same person, and a
 * literal comparison would call that a discrepancy on nearly every document.
 */
function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[äÄ]/g, "ae")
      .replace(/[öÖ]/g, "oe")
      .replace(/[üÜ]/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  return norm(a) === norm(b);
}

function textMatches(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  // One side is often longer: a contract gives the full address where the funnel holds only
  // "8001 Zürich". Containment is the honest test here.
  return x === y || x.includes(y) || y.includes(x);
}

export function compareWithFunnel(
  analysis: DocumentAnalysis,
  facts: FunnelFacts
): Comparison[] {
  const spec = docTypeById(analysis.classification.type);
  if (!spec) return [];

  const comparable = new Set(spec.fields.filter((f) => f.compare).map((f) => f.key));
  const rules = (RULES[analysis.classification.type] ?? []).filter((r) => comparable.has(r.field));

  const out: Comparison[] = [];
  for (const rule of rules) {
    const extracted = analysis.fields[rule.field];
    if (!extracted || extracted.value === null) continue;

    const label = spec.fields.find((f) => f.key === rule.field)?.label ?? rule.field;
    const funnelRaw = rule.funnel(facts);

    if (funnelRaw === null || funnelRaw === undefined || funnelRaw === "") {
      // Nothing to compare against is not a discrepancy (section 34).
      out.push({
        field: rule.field,
        label,
        funnelValue: null,
        documentValue: extracted.value,
        status: "not_comparable",
        reason: "Im Funnel wurde dazu nichts erfasst.",
      });
      continue;
    }

    if (rule.kind === "number") {
      const docNum = toNumber(extracted.value);
      const funnelNum = toNumber(funnelRaw);
      if (docNum === null || funnelNum === null) {
        out.push({
          field: rule.field,
          label,
          funnelValue: funnelRaw as string | number,
          documentValue: extracted.value,
          status: "not_comparable",
          reason: "Wert konnte nicht als Zahl gelesen werden.",
        });
        continue;
      }
      const difference = Math.abs(docNum - funnelNum);
      const allowed = (rule.tolerance ?? 0) * Math.max(Math.abs(docNum), Math.abs(funnelNum));
      out.push({
        field: rule.field,
        label,
        funnelValue: funnelNum,
        documentValue: docNum,
        difference,
        status: difference <= allowed ? "match" : "mismatch",
      });
      continue;
    }

    const docStr = String(extracted.value);
    const funnelStr = String(funnelRaw);
    const same =
      rule.kind === "name" ? namesMatch(docStr, funnelStr) : textMatches(docStr, funnelStr);
    out.push({
      field: rule.field,
      label,
      funnelValue: funnelStr,
      documentValue: docStr,
      status: same ? "match" : "mismatch",
    });
  }

  return out;
}

/** Only the differences worth putting in front of someone (section 34). */
export function mismatchesOnly(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((c) => c.status === "mismatch");
}

/** Pull the comparable facts out of whatever the funnel store holds. */
export function funnelFactsFrom(data: {
  financing?: any;
  property?: any;
  borrowers?: any[];
}): FunnelFacts {
  const fin = data.financing ?? {};
  const prop = data.property ?? {};

  const ownFunds = [
    fin.eigenmittel_bar,
    fin.eigenmittel_saeule3,
    fin.eigenmittel_pk,
    fin.eigenmittel_schenkung,
  ]
    .map(toNumber)
    .filter((n): n is number => n !== null)
    .reduce((a, b) => a + b, 0);

  return {
    annualIncome: toNumber(fin.einkommen),
    purchasePrice: toNumber(fin.kaufpreis),
    ownFundsTotal: ownFunds > 0 ? ownFunds : null,
    existingMortgage: toNumber(fin.abloesung_betrag),
    propertyLocation: [prop.zip, prop.ort].filter(Boolean).join(" ") || null,
    borrowers: (data.borrowers ?? []).map((b: any) => ({
      firstName: b.firstName || b.vorname || "",
      lastName: b.lastName || b.name || "",
      birthdate: b.birthdate || b.geburtsdatum || "",
    })),
  };
}
