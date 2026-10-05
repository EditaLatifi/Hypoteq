import { describe, it, expect } from '@jest/globals';
import { formatCaseNumber, isCaseNumber, parseCaseNumber } from '@/lib/funnel-v3/fallnummer';

describe('Fallnummer HQ-JJ-MM-NNNNNN', () => {
  it('formats the spec example', () => {
    expect(formatCaseNumber(new Date('2026-06-10T12:00:00Z'), 156283)).toBe('HQ-26-06-156283');
  });
  it('pads the serial', () => {
    expect(formatCaseNumber(new Date('2026-10-05T12:00:00Z'), 7)).toBe('HQ-26-10-000007');
  });
  it('uses the Swiss calendar month', () => {
    // 31.12.2026 23:30 UTC is already 01.01.2027 in Zurich.
    expect(formatCaseNumber(new Date('2026-12-31T23:30:00Z'), 1)).toBe('HQ-27-01-000001');
  });
  it('rejects a serial out of range and an invalid date', () => {
    expect(() => formatCaseNumber(new Date(), 1_000_000)).toThrow();
    expect(() => formatCaseNumber(new Date(), -1)).toThrow();
    expect(() => formatCaseNumber(new Date(), 1.5)).toThrow();
    expect(() => formatCaseNumber(new Date('nope'), 1)).toThrow();
  });
  it('parses and validates', () => {
    expect(parseCaseNumber('HQ-26-06-156283')).toEqual({ year: 2026, month: 6, serial: 156283 });
    expect(parseCaseNumber(' HQ-26-06-000001 ')).toEqual({ year: 2026, month: 6, serial: 1 });
    for (const bad of ['HQ-26-13-156283', 'HQ-26-00-156283', 'HQ-26-6-156283', 'HQ-26-06-15628', 'hq-26-06-156283', 'HQ-2026-06-156283', '', null, undefined]) {
      expect([bad, isCaseNumber(bad)]).toEqual([bad, false]);
    }
    expect(isCaseNumber('HQ-26-06-156283')).toBe(true);
  });
  it('round-trips', () => {
    const s = formatCaseNumber(new Date('2027-03-15T12:00:00Z'), 42);
    expect(parseCaseNumber(s)).toEqual({ year: 2027, month: 3, serial: 42 });
  });
});
