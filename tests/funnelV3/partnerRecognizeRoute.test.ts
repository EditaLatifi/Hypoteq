import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@/components/partnerDirectory', () => {
  const actual = jest.requireActual('@/components/partnerDirectory') as any;
  return { __esModule: true, resolvePartner: jest.fn(), initialsOf: actual.initialsOf };
});

import { resolvePartner } from '@/components/partnerDirectory';
import { POST } from '@/app/api/partner/recognize/route';

const resolve = resolvePartner as unknown as jest.Mock<(...a: any[]) => Promise<any>>;

let ipCounter = 0;
function request(body: unknown, ip = `10.0.0.${++ipCounter}`) {
  return new Request('http://localhost/api/partner/recognize', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resolve.mockReset();
});

describe('POST /api/partner/recognize', () => {
  it('rejects a missing or malformed e-mail with 400', async () => {
    for (const body of [{}, { email: '' }, { email: 'not-an-email' }, { email: 42 }, 'nonsense{']) {
      const res = await POST(request(body));
      expect(res.status).toBe(400);
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('returns name, company and initials for a partner, never ids', async () => {
    resolve.mockResolvedValueOnce({
      status: 'partner',
      contactId: '003AAAAAAAAAAAAAAA',
      accountId: '001BBBBBBBBBBBBBBB',
      name: 'Anna Muster',
      firstName: 'Anna',
      lastName: 'Muster',
      company: 'VZ',
    });
    const res = await POST(request({ email: 'anna@vzch.ch' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: 'partner', name: 'Anna Muster', company: 'VZ', initials: 'AM' });
    expect(JSON.stringify(json)).not.toMatch(/003A|001B/);
  });

  it('returns hypoteq for a HYPOTEQ user without the User id', async () => {
    resolve.mockResolvedValueOnce({ status: 'hypoteq', userId: '005CCCCCCCCCCCCCCC', name: 'Hans Hypo' });
    const json = await (await POST(request({ email: 'hans@hypoteq.ch' }))).json();
    expect(json.status).toBe('hypoteq');
    expect(json.initials).toBe('HH');
    expect(JSON.stringify(json)).not.toContain('005C');
  });

  it('returns unknown', async () => {
    resolve.mockResolvedValueOnce({ status: 'unknown' });
    expect(await (await POST(request({ email: 'new@partner.ch' }))).json()).toEqual({ status: 'unknown' });
  });

  it('degrades to unknown with 200 when Salesforce fails', async () => {
    resolve.mockRejectedValueOnce(new Error('Salesforce down'));
    const res = await POST(request({ email: 'anna@vzch.ch' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'unknown', degraded: true });
  });

  it('still answers in test mode (read-only)', async () => {
    const prev = process.env.HYPOTEQ_TEST_MODE;
    process.env.HYPOTEQ_TEST_MODE = '1';
    try {
      resolve.mockResolvedValueOnce({ status: 'unknown' });
      const res = await POST(request({ email: 'x@y.ch' }));
      expect(res.status).toBe(200);
      expect(resolve).toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.HYPOTEQ_TEST_MODE;
      else process.env.HYPOTEQ_TEST_MODE = prev;
    }
  });

  it('rate-limits one IP to 20 requests a minute with 429', async () => {
    resolve.mockResolvedValue({ status: 'unknown' });
    const ip = '192.168.1.1';
    for (let i = 0; i < 20; i++) {
      expect((await POST(request({ email: 'x@y.ch' }, ip))).status).toBe(200);
    }
    expect((await POST(request({ email: 'x@y.ch' }, ip))).status).toBe(429);
    // Another IP is unaffected.
    expect((await POST(request({ email: 'x@y.ch' }, '192.168.1.2'))).status).toBe(200);
  });
});
