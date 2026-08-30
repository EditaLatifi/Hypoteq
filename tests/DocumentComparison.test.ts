import { describe, it, expect } from '@jest/globals';
import {
  compareWithFunnel,
  funnelFactsFrom,
  mismatchesOnly,
  toNumber,
} from '../components/documentIntelligence/compare';
import type { DocumentAnalysis } from '../components/documentIntelligence/types';

/**
 * Spec section 28: whether a difference matters is a HYPOTEQ decision, not the model's.
 * These tests pin that decision down. They matter more than they look — every false
 * mismatch here becomes a question put to a customer who did nothing wrong, which is
 * exactly what section 34 forbids.
 */

const analysis = (type: string, fields: Record<string, any>): DocumentAnalysis => ({
  documentId: 'doc_1',
  classification: { type, label: type, confidence: 0.98 },
  person: null,
  documentDate: '2025-12-31',
  suggestedFilename: null,
  fields: Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, { value: v, unit: null, confidence: 0.98 }])
  ),
  status: 'classified',
  funnelDocKey: null,
  audit: {
    originalFileName: 'x.pdf',
    model: 'stub',
    provider: 'stub',
    analysedAt: '2026-08-25T00:00:00Z',
    durationMs: 1,
  },
});

describe('toNumber — Swiss money as it is actually printed', () => {
  it('reads the formats that appear on real documents', () => {
    expect(toNumber("CHF 142'300.00")).toBe(142300);
    expect(toNumber("142'300")).toBe(142300);
    expect(toNumber('CHF 142 300.-')).toBe(142300);
    expect(toNumber('Fr. 1’250.50')).toBe(1250.5);
    expect(toNumber(142300)).toBe(142300);
  });

  it('refuses anything that is not a number', () => {
    expect(toNumber('keine Angabe')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe('income comparison (section 16)', () => {
  it('reports the difference the spec example describes', () => {
    const [c] = compareWithFunnel(
      analysis('salary_certificate', { grossAnnualSalary: 142300 }),
      { annualIncome: 150000 }
    );
    expect(c.status).toBe('mismatch');
    expect(c.funnelValue).toBe(150000);
    expect(c.documentValue).toBe(142300);
    expect(c.difference).toBe(7700);
  });

  it('lets a small difference pass', () => {
    // Last year's certificate against this year's declared salary. Flagging that would
    // train staff to ignore the warnings.
    const [c] = compareWithFunnel(
      analysis('salary_certificate', { grossAnnualSalary: 148000 }),
      { annualIncome: 150000 }
    );
    expect(c.status).toBe('match');
  });

  it('says nothing when the funnel holds no income', () => {
    const [c] = compareWithFunnel(
      analysis('salary_certificate', { grossAnnualSalary: 142300 }),
      { annualIncome: null }
    );
    expect(c.status).toBe('not_comparable');
    expect(mismatchesOnly([c])).toEqual([]);
  });
});

describe('names', () => {
  it('treats a document ordering as the same person', () => {
    // "Muster, Max" on the certificate, "Max Muster" in the funnel.
    const [, name] = compareWithFunnel(
      analysis('salary_certificate', { grossAnnualSalary: 150000, employee: 'Muster, Max' }),
      { annualIncome: 150000, borrowers: [{ firstName: 'Max', lastName: 'Muster' }] }
    );
    expect(name.status).toBe('match');
  });

  it('handles umlauts written either way', () => {
    const [c] = compareWithFunnel(
      analysis('authorisation_form', { fullName: 'Jürg Müller' }),
      { borrowers: [{ firstName: 'Juerg', lastName: 'Mueller' }] }
    );
    expect(c.status).toBe('match');
  });

  it('still catches a genuinely different person', () => {
    const [c] = compareWithFunnel(
      analysis('authorisation_form', { fullName: 'Anna Beispiel' }),
      { borrowers: [{ firstName: 'Max', lastName: 'Muster' }] }
    );
    expect(c.status).toBe('mismatch');
  });
});

describe('addresses', () => {
  it('accepts a fuller address than the funnel holds', () => {
    const [, addr] = compareWithFunnel(
      analysis('purchase_contract', {
        purchasePrice: 900000,
        propertyAddress: 'Bahnhofstrasse 12, 8001 Zürich',
      }),
      { purchasePrice: 900000, propertyLocation: '8001 Zürich' }
    );
    expect(addr.status).toBe('match');
  });

  it('flags a different town', () => {
    const [, addr] = compareWithFunnel(
      analysis('purchase_contract', { purchasePrice: 900000, propertyAddress: '3000 Bern' }),
      { purchasePrice: 900000, propertyLocation: '8001 Zürich' }
    );
    expect(addr.status).toBe('mismatch');
  });
});

describe('what is compared at all (section 17)', () => {
  it('never compares a field the catalog marks extract-only', () => {
    // The identity document number is extracted but explicitly not compared.
    const fields = compareWithFunnel(
      analysis('identity_document', { documentNumber: 'X1234567', lastName: 'Muster' }),
      { borrowers: [{ firstName: 'Max', lastName: 'Muster' }] }
    ).map((c) => c.field);
    expect(fields).not.toContain('documentNumber');
    expect(fields).toContain('lastName');
  });

  it('returns nothing for a type with no comparison rules', () => {
    expect(compareWithFunnel(analysis('tax_return', { taxableIncome: 120000 }), {})).toEqual([]);
  });

  it('returns nothing for a document that was never recognised', () => {
    expect(compareWithFunnel(analysis('unknown', {}), { annualIncome: 150000 })).toEqual([]);
  });
});

describe('funnelFactsFrom', () => {
  it('adds the own-funds parts the funnel collects separately', () => {
    const facts = funnelFactsFrom({
      financing: {
        einkommen: '150000',
        kaufpreis: "CHF 900'000",
        eigenmittel_bar: '100000',
        eigenmittel_saeule3: '50000',
        eigenmittel_pk: '30000',
        eigenmittel_schenkung: '',
      },
      property: { zip: '8001', ort: 'Zürich' },
      borrowers: [{ firstName: 'Max', lastName: 'Muster' }],
    });
    expect(facts.annualIncome).toBe(150000);
    expect(facts.purchasePrice).toBe(900000);
    expect(facts.ownFundsTotal).toBe(180000);
    expect(facts.propertyLocation).toBe('8001 Zürich');
  });

  it('reads borrowers whichever of the duplicated field names they use', () => {
    // The Borrower model carries both firstName/lastName and vorname/name.
    const facts = funnelFactsFrom({ borrowers: [{ vorname: 'Anna', name: 'Beispiel' }] });
    expect(facts.borrowers?.[0]).toEqual({ firstName: 'Anna', lastName: 'Beispiel', birthdate: '' });
  });

  it('leaves absent values null rather than zero', () => {
    // Zero would compare as a real figure and manufacture a mismatch.
    const facts = funnelFactsFrom({ financing: {}, property: {}, borrowers: [] });
    expect(facts.annualIncome).toBeNull();
    expect(facts.ownFundsTotal).toBeNull();
    expect(facts.propertyLocation).toBeNull();
  });
});
