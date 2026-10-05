import { describe, it, expect } from '@jest/globals';
import { applyDocumentCorrections } from '../components/funnelCorrections';

/**
 * Guards the outcome section 16 exists to prevent.
 *
 * A customer pressed "Dokumentwert übernehmen", saw CHF 142'300 appear, and Salesforce
 * still received CHF 150'000 — the funnel page pushed its own copy of the form afterwards
 * and reverted the correction. The audit row recorded a decision the data did not reflect.
 */

describe('applyDocumentCorrections', () => {
  const form = { einkommen: '150000', kaufpreis: "900000", modell: 'fest' };

  it('lets the correction win over the form', () => {
    // The whole bug in one assertion: the form is older than the decision.
    const out = applyDocumentCorrections(form, { einkommen: '142300' });
    expect(out.einkommen).toBe('142300');
  });

  it('leaves every field nobody corrected alone', () => {
    const out = applyDocumentCorrections(form, { einkommen: '142300' });
    expect(out.kaufpreis).toBe('900000');
    expect(out.modell).toBe('fest');
  });

  it('applies several corrections at once', () => {
    const out = applyDocumentCorrections(form, { einkommen: '142300', kaufpreis: '880000' });
    expect(out).toEqual({ einkommen: '142300', kaufpreis: '880000', modell: 'fest' });
  });

  it('ignores blanks rather than erasing what the customer entered', () => {
    // A blank is an unanswered field, not a decision to clear the figure.
    const out = applyDocumentCorrections(form, { einkommen: '', kaufpreis: '   ' } as any);
    expect(out.einkommen).toBe('150000');
    expect(out.kaufpreis).toBe('900000');
  });

  it('ignores null and undefined the same way', () => {
    const out = applyDocumentCorrections(form, { einkommen: null, kaufpreis: undefined });
    expect(out.einkommen).toBe('150000');
    expect(out.kaufpreis).toBe('900000');
  });

  it('returns the form untouched when there is nothing to apply', () => {
    expect(applyDocumentCorrections(form, {})).toBe(form);
    expect(applyDocumentCorrections(form, null)).toBe(form);
    expect(applyDocumentCorrections(form, undefined)).toBe(form);
  });

  it('never mutates the form it was given', () => {
    const original = { ...form };
    applyDocumentCorrections(form, { einkommen: '142300' });
    expect(form).toEqual(original);
  });
});
