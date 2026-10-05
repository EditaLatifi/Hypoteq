import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@/components/salesforceApi', () => {
  const actual = jest.requireActual('@/components/salesforceApi') as any;
  return { __esModule: true, sfQuery: jest.fn(), soqlString: actual.soqlString };
});

import { sfQuery, soqlString } from '@/components/salesforceApi';
import {
  resolvePartner,
  clearPartnerCache,
  initialsOf,
  HIT_TTL_MS,
  MISS_TTL_MS,
} from '@/components/partnerDirectory';

const query = sfQuery as unknown as jest.Mock<(soql: string, ctx: string) => Promise<any[]>>;

const CONTACT = {
  Id: '003AAAAAAAAAAAAAAA',
  FirstName: 'Anna',
  LastName: 'Muster',
  Name: 'Anna Muster',
  Email: 'anna@vzch.ch',
  AccountId: '001BBBBBBBBBBBBBBB',
  Account: { Name: 'VZ VermögensZentrum' },
};

const originalFilter = process.env.SF_PARTNER_CONTACT_FILTER;

beforeEach(() => {
  clearPartnerCache();
  query.mockReset();
  delete process.env.SF_PARTNER_CONTACT_FILTER;
});
afterEach(() => {
  if (originalFilter === undefined) delete process.env.SF_PARTNER_CONTACT_FILTER;
  else process.env.SF_PARTNER_CONTACT_FILTER = originalFilter;
});

describe('soqlString', () => {
  it('escapes quotes and backslashes', () => {
    expect(soqlString("o'brien@x.ch")).toBe("'o\\'brien@x.ch'");
    expect(soqlString('a\\b')).toBe("'a\\\\b'");
    // Backslash first, so an escaped quote is not unescaped again.
    expect(soqlString("\\'")).toBe("'\\\\\\''");
  });
});

describe('resolvePartner', () => {
  it('matches @hypoteq.ch against active Users only', async () => {
    query.mockResolvedValueOnce([{ Id: '005CCCCCCCCCCCCCCC', Name: 'Hans Hypo' }]);
    const r = await resolvePartner('Hans@HYPOTEQ.ch');
    expect(r).toEqual({ status: 'hypoteq', userId: '005CCCCCCCCCCCCCCC', name: 'Hans Hypo' });
    const soql = query.mock.calls[0][0];
    expect(soql).toContain('FROM User WHERE IsActive = true');
    expect(soql).toContain("(Email = 'hans@hypoteq.ch' OR Username = 'hans@hypoteq.ch')");
    expect(soql).not.toContain('Contact');
  });

  it('treats @hypoteq.com the same and answers unknown without a User', async () => {
    query.mockResolvedValueOnce([]);
    expect(await resolvePartner('nobody@hypoteq.com')).toEqual({ status: 'unknown' });
    expect(query.mock.calls[0][0]).toContain('FROM User');
  });

  it('recognises a partner Contact by exact e-mail, oldest first', async () => {
    query.mockResolvedValueOnce([CONTACT]);
    const r = await resolvePartner('anna@vzch.ch');
    expect(r).toEqual({
      status: 'partner',
      contactId: CONTACT.Id,
      accountId: CONTACT.AccountId,
      name: 'Anna Muster',
      firstName: 'Anna',
      lastName: 'Muster',
      company: 'VZ VermögensZentrum',
    });
    expect(query.mock.calls[0][0]).toBe(
      "SELECT Id, FirstName, LastName, Name, Email, AccountId, Account.Name FROM Contact " +
        "WHERE Email = 'anna@vzch.ch' ORDER BY CreatedDate ASC LIMIT 1"
    );
  });

  it('appends SF_PARTNER_CONTACT_FILTER to the Contact query', async () => {
    process.env.SF_PARTNER_CONTACT_FILTER = "AND Account.Type = 'Vertriebspartner'";
    query.mockResolvedValueOnce([CONTACT]);
    await resolvePartner('anna@vzch.ch');
    expect(query.mock.calls[0][0]).toContain(
      "WHERE Email = 'anna@vzch.ch' AND Account.Type = 'Vertriebspartner' ORDER BY"
    );
  });

  it('adds the leading AND when the filter has none', async () => {
    process.env.SF_PARTNER_CONTACT_FILTER = "Account.Type = 'Vertriebspartner'";
    query.mockResolvedValueOnce([]);
    await resolvePartner('x@y.ch');
    expect(query.mock.calls[0][0]).toContain("= 'x@y.ch' AND Account.Type = 'Vertriebspartner' ORDER BY");
  });

  it('answers unknown when no Contact matches', async () => {
    query.mockResolvedValueOnce([]);
    expect(await resolvePartner('new@partner.ch')).toEqual({ status: 'unknown' });
  });

  it("escapes o'brien@x.ch in the query", async () => {
    query.mockResolvedValueOnce([]);
    await resolvePartner("o'brien@x.ch");
    expect(query.mock.calls[0][0]).toContain("WHERE Email = 'o\\'brien@x.ch' ORDER BY");
  });

  it('propagates Salesforce errors and does not cache them', async () => {
    query.mockRejectedValueOnce(new Error('boom'));
    await expect(resolvePartner('anna@vzch.ch')).rejects.toThrow('boom');
    query.mockResolvedValueOnce([CONTACT]);
    expect((await resolvePartner('anna@vzch.ch')).status).toBe('partner');
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('cache', () => {
  it('keeps a hit for 15 minutes', async () => {
    const t0 = 1_000_000;
    query.mockResolvedValue([CONTACT]);
    await resolvePartner('anna@vzch.ch', { now: t0 });
    await resolvePartner('ANNA@vzch.ch ', { now: t0 + HIT_TTL_MS - 1 });
    expect(query).toHaveBeenCalledTimes(1);
    await resolvePartner('anna@vzch.ch', { now: t0 + HIT_TTL_MS + 1 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps a miss for only 2 minutes', async () => {
    const t0 = 2_000_000;
    query.mockResolvedValueOnce([]);
    expect((await resolvePartner('new@partner.ch', { now: t0 })).status).toBe('unknown');
    expect((await resolvePartner('new@partner.ch', { now: t0 + MISS_TTL_MS - 1 })).status).toBe('unknown');
    expect(query).toHaveBeenCalledTimes(1);
    // HYPOTEQ created the Contact in the meantime.
    query.mockResolvedValueOnce([CONTACT]);
    expect((await resolvePartner('new@partner.ch', { now: t0 + MISS_TTL_MS + 1 })).status).toBe('partner');
  });

  it('fresh: true bypasses and refreshes the cache', async () => {
    query.mockResolvedValueOnce([]);
    await resolvePartner('anna@vzch.ch');
    query.mockResolvedValueOnce([CONTACT]);
    expect((await resolvePartner('anna@vzch.ch', { fresh: true })).status).toBe('partner');
    // The fresh answer replaced the cached miss.
    expect((await resolvePartner('anna@vzch.ch')).status).toBe('partner');
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('initialsOf', () => {
  it('uses first and last name', () => {
    expect(initialsOf('Anna Maria Muster')).toBe('AM');
    expect(initialsOf('anna')).toBe('A');
    expect(initialsOf('')).toBe('');
  });
});
