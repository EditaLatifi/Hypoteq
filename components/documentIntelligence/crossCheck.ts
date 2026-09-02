import type { DocumentAnalysis } from "./types";
import { toNumber } from "./compare";

/**
 * Documents checked against each other, not only against the funnel (spec section 18).
 *
 * The funnel comparison in compare.ts answers "does this document agree with what the
 * customer told us". This answers the other question, the one the customer cannot answer for
 * us: do the documents agree with each other. A salary certificate naming Muster Handels AG
 * beside a current payslip from Example AG is a real fact about the dossier, and neither
 * document is wrong on its own.
 *
 * WHAT THIS IS NOT. It does not accuse anybody. Section 18's own example calls the employer
 * mismatch a "mögliche Abweichung" — a job change between the certificate's year and this
 * month's payslip is the ordinary explanation, and it is a lender's question rather than a
 * blocking error. So every finding here is a note, never a status that stops a submission.
 *
 * Rules live here rather than in a prompt for the same reason as everywhere else in this
 * folder: section 28 keeps the judgement with HYPOTEQ, and a rule in data can be changed and
 * tested without a model call.
 */

export type CrossCheckLevel = "info" | "warning";

export interface CrossCheckFinding {
  /** Stable id, so a finding can be dismissed or referred to. */
  id: string;
  level: CrossCheckLevel;
  /** German, for both the customer and staff. */
  text: string;
  /** The document ids the finding is about. */
  documentIds: string[];
}

const fieldValue = (a: DocumentAnalysis, key: string) => a.fields?.[key]?.value ?? null;

/** Two employer names are the same company if they read the same once punctuation is gone. */
function sameCompany(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[äÄ]/g, "ae")
      .replace(/[öÖ]/g, "oe")
      .replace(/[üÜ]/g, "ue")
      .replace(/ß/g, "ss")
      // Legal forms are noise for this comparison: "Muster AG" and "Muster" are one employer
      // written twice, and flagging that pair would train staff to ignore the check.
      .replace(/\b(ag|gmbh|sa|sarl|s\.?a\.?r\.?l|holding|group|schweiz|suisse)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function crossCheck(analyses: DocumentAnalysis[]): CrossCheckFinding[] {
  const usable = analyses.filter((a) => a && a.classification?.type && a.classification.type !== "unknown");
  const byType = (type: string) => usable.filter((a) => a.classification.type === type);

  const out: CrossCheckFinding[] = [];

  const certificates = byType("salary_certificate");
  const payslips = byType("monthly_payslip");

  // Section 18's first example: the employer on the certificate against the employer on the
  // current payslip. Compared per borrower where both name one — on a two-earner dossier,
  // Anna's payslip and Max's certificate are supposed to differ.
  for (const cert of certificates) {
    const certEmployer = fieldValue(cert, "employer");
    if (typeof certEmployer !== "string" || !certEmployer) continue;

    for (const slip of payslips) {
      const slipEmployer = fieldValue(slip, "employer");
      if (typeof slipEmployer !== "string" || !slipEmployer) continue;

      // Only compare documents belonging to the same person. Where either says nothing about
      // whose it is, the comparison is skipped rather than guessed: a false employer warning
      // on a couple's dossier is worse than no warning at all.
      const certPerson = cert.person?.borrowerId ?? null;
      const slipPerson = slip.person?.borrowerId ?? null;
      if (certPerson && slipPerson && certPerson !== slipPerson) continue;
      if (!certPerson || !slipPerson) continue;

      if (!sameCompany(certEmployer, slipEmployer)) {
        out.push({
          id: `employer:${cert.documentId}:${slip.documentId}`,
          level: "warning",
          text: `Der Arbeitgeber auf dem Lohnausweis (${certEmployer}) stimmt nicht mit dem Arbeitgeber der Lohnabrechnung (${slipEmployer}) überein.`,
          documentIds: [cert.documentId, slip.documentId],
        });
      }
    }
  }

  // Section 18's second example: a certificate at CHF 142'300 a year beside payslips at
  // CHF 11'850 a month is consistent, and saying so is worth as much as flagging a problem —
  // it is the evidence that the check ran and found nothing.
  for (const cert of certificates) {
    const annual = toNumber(fieldValue(cert, "grossAnnualSalary"));
    if (!annual) continue;

    const certPerson = cert.person?.borrowerId ?? null;
    const theirs = payslips.filter(
      (s) => !certPerson || !s.person?.borrowerId || s.person.borrowerId === certPerson
    );
    const monthly = theirs
      .map((s) => toNumber(fieldValue(s, "grossSalary")))
      .filter((n): n is number => n !== null && n > 0);
    if (monthly.length < 2) continue;

    const average = monthly.reduce((a, b) => a + b, 0) / monthly.length;
    // Thirteenth month, bonus and allowances all live legitimately in the gap between twelve
    // payslips and the certificate, so the band is wide. It is here to catch a figure that is
    // out by a factor, not one that is out by a bonus.
    const projected = average * 12;
    const drift = Math.abs(projected - annual) / Math.max(projected, annual);

    if (drift <= 0.2) {
      out.push({
        id: `income:${cert.documentId}`,
        level: "info",
        text: "Die Einkommensangaben aus Lohnausweis und Lohnabrechnungen sind grundsätzlich konsistent.",
        documentIds: [cert.documentId, ...theirs.map((s) => s.documentId)],
      });
    } else {
      out.push({
        id: `income:${cert.documentId}`,
        level: "warning",
        text: `Die Lohnabrechnungen ergeben hochgerechnet rund CHF ${Math.round(projected).toLocaleString(
          "de-CH"
        )} pro Jahr, der Lohnausweis nennt CHF ${Math.round(annual).toLocaleString("de-CH")}.`,
        documentIds: [cert.documentId, ...theirs.map((s) => s.documentId)],
      });
    }
  }

  return out;
}
