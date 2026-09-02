import { describe, it, expect } from '@jest/globals';
import { crossCheck } from '../components/documentIntelligence/crossCheck';
import type { DocumentAnalysis } from '../components/documentIntelligence/types';

/**
 * Section 18 compares documents with each other rather than with the funnel. The risk in a
 * check like this is not missing a problem — it is inventing one: a couple's dossier where
 * two people legitimately work at different companies, or a certificate that is a bonus away
 * from twelve payslips. A check that cries wolf is switched off by the people it was built
 * for, so most of these tests are about staying quiet.
 */

const doc = (
  id: string,
  type: string,
  fields: Record<string, any>,
  borrowerId: string | null = 'borrower_01'
): DocumentAnalysis =>
  ({
    documentId: id,
    classification: { type, label: type, confidence: 0.99 },
    person: borrowerId ? { borrowerId, confidence: 0.95 } : null,
    documentDate: '2026-07-31',
    suggestedFilename: null,
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.98 }])
    ),
    status: 'classified',
    funnelDocKey: null,
    audit: {
      originalFileName: id,
      model: 'stub',
      provider: 'stub',
      analysedAt: '2026-08-31T00:00:00Z',
      durationMs: 1,
    },
  }) as DocumentAnalysis;

describe('employer consistency (section 18)', () => {
  it('flags a certificate and a payslip from different employers', () => {
    const out = crossCheck([
      doc('a', 'salary_certificate', { employer: 'Muster Handels AG' }),
      doc('b', 'monthly_payslip', { employer: 'Example AG' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe('warning');
    expect(out[0].text).toContain('Example AG');
  });

  it('treats a legal form as noise, not as a different company', () => {
    // "Muster Handels AG" and "Muster Handels" are one employer written twice. Flagging that
    // pair is how a check earns its reputation for crying wolf.
    const out = crossCheck([
      doc('a', 'salary_certificate', { employer: 'Muster Handels AG' }),
      doc('b', 'monthly_payslip', { employer: 'Muster Handels' }),
    ]);
    expect(out).toHaveLength(0);
  });

  it('says nothing about two different people working in two different places', () => {
    const out = crossCheck([
      doc('a', 'salary_certificate', { employer: 'Muster Handels AG' }, 'borrower_01'),
      doc('b', 'monthly_payslip', { employer: 'Kantonsspital Winterthur' }, 'borrower_02'),
    ]);
    expect(out).toHaveLength(0);
  });

  it('says nothing when it does not know whose a document is', () => {
    // Guessing here produces a false employer warning on a couple's dossier, which is worse
    // than no warning at all.
    const out = crossCheck([
      doc('a', 'salary_certificate', { employer: 'Muster Handels AG' }, null),
      doc('b', 'monthly_payslip', { employer: 'Example AG' }, null),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('income consistency (section 18)', () => {
  const cert = doc('c', 'salary_certificate', { grossAnnualSalary: 142300 });

  it('confirms the spec worked example as consistent', () => {
    // CHF 142'300 a year against three payslips of CHF 11'850: the spec's own example, and
    // the expected answer is that this is fine.
    const out = crossCheck([
      cert,
      doc('p1', 'monthly_payslip', { grossSalary: 11850 }),
      doc('p2', 'monthly_payslip', { grossSalary: 11850 }),
      doc('p3', 'monthly_payslip', { grossSalary: 11850 }),
    ]);
    const income = out.find((f) => f.id.startsWith('income:'));
    expect(income?.level).toBe('info');
    expect(income?.text).toContain('konsistent');
  });

  it('tolerates a thirteenth month rather than calling it a discrepancy', () => {
    // 12 x 10'946 = 131'352 against a certificate of 142'300 is a 13th salary, not an error.
    const out = crossCheck([
      cert,
      doc('p1', 'monthly_payslip', { grossSalary: 10946 }),
      doc('p2', 'monthly_payslip', { grossSalary: 10946 }),
    ]);
    expect(out.find((f) => f.id.startsWith('income:'))?.level).toBe('info');
  });

  it('flags a figure that is out by a factor', () => {
    const out = crossCheck([
      cert,
      doc('p1', 'monthly_payslip', { grossSalary: 4200 }),
      doc('p2', 'monthly_payslip', { grossSalary: 4200 }),
    ]);
    const income = out.find((f) => f.id.startsWith('income:'));
    expect(income?.level).toBe('warning');
    expect(income?.text).toContain('142’300'.replace(/’/g, "'"));
  });

  it('says nothing from a single payslip', () => {
    // One month is not a series; projecting a year from it would flag every dossier that has
    // only sent the first of three.
    const out = crossCheck([cert, doc('p1', 'monthly_payslip', { grossSalary: 4200 })]);
    expect(out.filter((f) => f.id.startsWith('income:'))).toHaveLength(0);
  });
});

describe('what it leaves alone', () => {
  it('ignores documents it could not identify', () => {
    expect(crossCheck([doc('a', 'unknown', { employer: 'Whatever AG' })])).toEqual([]);
  });

  it('returns nothing for an empty dossier', () => {
    expect(crossCheck([])).toEqual([]);
  });

  it('never returns a status that could block a submission', () => {
    // Section 18 calls these "mögliche Abweichungen". A job change between the certificate's
    // year and this month's payslip is the ordinary explanation, and it is a question for a
    // lender rather than a reason to stop the customer.
    const out = crossCheck([
      doc('a', 'salary_certificate', { employer: 'Muster Handels AG' }),
      doc('b', 'monthly_payslip', { employer: 'Example AG' }),
    ]);
    for (const f of out) expect(['info', 'warning']).toContain(f.level);
  });
});
