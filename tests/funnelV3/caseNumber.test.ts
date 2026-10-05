import { describe, it, expect, jest } from '@jest/globals';
import {
  allocateCaseNumber,
  formatCaseNumber,
  randomCaseNumber,
  CASE_NUMBER_RE,
  MAX_ATTEMPTS,
} from '@/components/caseNumber';

function collision() {
  return Object.assign(new Error('Unique constraint failed on the fields: (`caseNumber`)'), {
    code: 'P2002',
    meta: { target: ['caseNumber'] },
  });
}

function store(update: (...a: any[]) => Promise<unknown>) {
  return { inquiry: { update: jest.fn(update) } };
}

describe('case number format', () => {
  it('is HQ-JJ-MM-NNNNNN', () => {
    expect(formatCaseNumber(new Date('2026-06-15T10:00:00Z'), 156283)).toBe('HQ-26-06-156283');
    expect(formatCaseNumber(new Date('2026-10-05T10:00:00Z'), 42)).toBe('HQ-26-10-000042');
    for (let i = 0; i < 50; i++) expect(randomCaseNumber(new Date())).toMatch(CASE_NUMBER_RE);
  });

  it('uses the Swiss month', () => {
    // 23:30 UTC on 31 October is already 1 November in Zurich.
    expect(formatCaseNumber(new Date('2026-10-31T23:30:00Z'), 1)).toBe('HQ-26-11-000001');
  });
});

describe('allocateCaseNumber', () => {
  const now = new Date('2026-10-05T10:00:00Z');

  it('stores the number on the inquiry', async () => {
    const s = store(async () => ({ id: 'inq-1' }));
    const n = await allocateCaseNumber(s, now, 'inq-1', () => 123456);
    expect(n).toBe('HQ-26-10-123456');
    expect(s.inquiry.update).toHaveBeenCalledWith({
      where: { id: 'inq-1' },
      data: { caseNumber: 'HQ-26-10-123456' },
      select: { id: true },
    });
  });

  it('draws again on a collision', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const draws = [111111, 111111, 222222];
    let i = 0;
    const s = store(async (args: any) => {
      if (args.data.caseNumber === 'HQ-26-10-111111') throw collision();
      return { id: 'inq-1' };
    });
    const n = await allocateCaseNumber(s, now, 'inq-1', () => draws[i++]);
    expect(n).toBe('HQ-26-10-222222');
    expect(s.inquiry.update).toHaveBeenCalledTimes(3);
  });

  it(`gives up after ${MAX_ATTEMPTS} collisions`, async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const s = store(async () => {
      throw collision();
    });
    await expect(allocateCaseNumber(s, now, 'inq-1')).rejects.toThrow(/no free number/);
    expect(s.inquiry.update).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('does not retry other errors', async () => {
    const s = store(async () => {
      throw Object.assign(new Error('column "caseNumber" does not exist'), { code: 'P2022' });
    });
    await expect(allocateCaseNumber(s, now, 'inq-1')).rejects.toThrow(/does not exist/);
    expect(s.inquiry.update).toHaveBeenCalledTimes(1);
  });
});
