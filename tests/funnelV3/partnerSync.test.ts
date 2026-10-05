import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@/components/partnerDirectory', () => ({ __esModule: true, resolvePartner: jest.fn() }));

import { resolvePartner } from '@/components/partnerDirectory';
import {
  applyPartnerToCase,
  syncFunnelStepsToSalesforce,
  NEW_PARTNER_NOTE,
  PARTNER_CHECK_FAILED_NOTE,
} from '@/components/syncFunnelStepsToSalesforce';

const resolve = resolvePartner as unknown as jest.Mock<(...a: any[]) => Promise<any>>;

const PARTNER_FORM = {
  email: 'neu@makler.ch',
  vorname: 'Nina',
  nachname: 'Neu',
  telefon: '+41 79 000 00 00',
  firma: 'Makler AG',
};

beforeEach(() => {
  resolve.mockReset();
});

describe('applyPartnerToCase', () => {
  it('links Contact and its Account for a recognised partner, with a fresh lookup', async () => {
    resolve.mockResolvedValueOnce({
      status: 'partner',
      contactId: '003AAAAAAAAAAAAAAA',
      accountId: '001BBBBBBBBBBBBBBB',
      name: 'Anna Muster',
      firstName: 'Anna',
      lastName: 'Muster',
      company: 'VZ',
    });
    const caseData: Record<string, any> = {};
    await applyPartnerToCase(caseData, 'anna@vzch.ch', { email: 'anna@vzch.ch' });
    expect(resolve).toHaveBeenCalledWith('anna@vzch.ch', { fresh: true });
    expect(caseData).toEqual({ Partner_Consultant__c: '003AAAAAAAAAAAAAAA', Account__c: '001BBBBBBBBBBBBBBB' });
  });

  it('sets OwnerId for a HYPOTEQ user and nothing else', async () => {
    resolve.mockResolvedValueOnce({ status: 'hypoteq', userId: '005CCCCCCCCCCCCCCC', name: 'Hans' });
    const caseData: Record<string, any> = {};
    await applyPartnerToCase(caseData, 'hans@hypoteq.ch', null);
    expect(caseData).toEqual({ OwnerId: '005CCCCCCCCCCCCCCC' });
  });

  it('fills Supplied* and notes the new partner in Comments when unknown', async () => {
    resolve.mockResolvedValueOnce({ status: 'unknown' });
    const caseData: Record<string, any> = { Comments: 'Kundenkommentar' };
    await applyPartnerToCase(caseData, 'neu@makler.ch', PARTNER_FORM);
    expect(caseData).toEqual({
      SuppliedName: 'Nina Neu',
      SuppliedEmail: 'neu@makler.ch',
      SuppliedPhone: '+41 79 000 00 00',
      SuppliedCompany: 'Makler AG',
      Comments: `${NEW_PARTNER_NOTE}\n\nKundenkommentar`,
    });
    expect(caseData.Partner_Consultant__c).toBeUndefined();
    expect(caseData.Account__c).toBeUndefined();
  });

  it('does not call a partner new when the lookup failed', async () => {
    resolve.mockRejectedValueOnce(new Error('Salesforce down'));
    const caseData: Record<string, any> = {};
    await applyPartnerToCase(caseData, 'anna@vzch.ch', undefined);
    expect(caseData.SuppliedEmail).toBe('anna@vzch.ch');
    expect(caseData.Comments).toBe(PARTNER_CHECK_FAILED_NOTE);
  });
});

describe('syncFunnelStepsToSalesforce with a partner', () => {
  function fakeApi() {
    const api: any = {
      cases: [] as any[],
      findAccountByEmail: jest.fn(async () => null),
      findAccountByName: jest.fn(async () => ({ Id: '001HYPOTEQAAAAAAAA' })),
      createAccount: jest.fn(async () => ({ id: '001CUSTOMERAAAAAAA', success: true })),
      createPersonAccount: jest.fn(async () => ({ id: '001CUSTOMERAAAAAAA', success: true })),
      updatePersonAccount: jest.fn(async () => ({ success: true })),
      findContactByEmail: jest.fn(async () => null),
      createContact: jest.fn(async () => ({ id: '003X', success: true })),
      createOrUpdateCase: jest.fn(async (fields: any) => {
        api.cases.push(fields);
        return { id: '500CASEAAAAAAAAAAA', success: true };
      }),
    };
    return api;
  }

  const payload = (extra: Record<string, any> = {}) => ({
    customerType: 'partner',
    client: { email: 'neu@makler.ch' },
    partner: PARTNER_FORM,
    project: { projektArt: 'kauf' },
    property: {
      zip: '8000',
      ort: 'Zürich',
      kreditnehmer: [{ vorname: 'Kurt', name: 'Kunde', email: 'kurt@kunde.ch', telefon: '0790000000' }],
    },
    financing: { kaufpreis: '1000000' },
    ...extra,
  });

  it('writes Supplied* and the note for an unknown partner and no partner lookups', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolve.mockResolvedValueOnce({ status: 'unknown' });
    const api = fakeApi();
    await syncFunnelStepsToSalesforce(payload(), api);
    const c = api.cases[0];
    expect(c.SuppliedName).toBe('Nina Neu');
    expect(c.SuppliedEmail).toBe('neu@makler.ch');
    expect(c.SuppliedCompany).toBe('Makler AG');
    expect(String(c.Comments).startsWith(NEW_PARTNER_NOTE)).toBe(true);
    expect(c.Partner_Consultant__c).toBeUndefined();
    expect(c.Account__c).toBeUndefined();
    expect(api.findContactByEmail).not.toHaveBeenCalled();
    expect(api.createContact).not.toHaveBeenCalled();
  });

  it('links Partner_Consultant__c and Account__c for a recognised partner', async () => {
    resolve.mockResolvedValueOnce({
      status: 'partner',
      contactId: '003AAAAAAAAAAAAAAA',
      accountId: '001BBBBBBBBBBBBBBB',
      name: 'Anna Muster',
      firstName: 'Anna',
      lastName: 'Muster',
      company: 'VZ',
    });
    const api = fakeApi();
    await syncFunnelStepsToSalesforce(payload({ partner: { email: 'anna@vzch.ch' } }), api);
    expect(resolve).toHaveBeenCalledWith('anna@vzch.ch', { fresh: true });
    const c = api.cases[0];
    expect(c.Partner_Consultant__c).toBe('003AAAAAAAAAAAAAAA');
    expect(c.Account__c).toBe('001BBBBBBBBBBBBBBB');
    expect(c.SuppliedEmail).toBeUndefined();
  });

  it('sets OwnerId for a HYPOTEQ user', async () => {
    resolve.mockResolvedValueOnce({ status: 'hypoteq', userId: '005CCCCCCCCCCCCCCC', name: 'Hans' });
    const api = fakeApi();
    await syncFunnelStepsToSalesforce(payload({ partner: { email: 'hans@hypoteq.ch' } }), api);
    expect(api.cases[0].OwnerId).toBe('005CCCCCCCCCCCCCCC');
  });

  it('leaves a direct lead to HYPOTEQ AG without a partner lookup', async () => {
    const api = fakeApi();
    await syncFunnelStepsToSalesforce(payload({ customerType: 'direct', partner: undefined, client: { email: 'kurt@kunde.ch', phone: '079' } }), api);
    expect(resolve).not.toHaveBeenCalled();
    expect(api.cases[0].Account__c).toBe('001HYPOTEQAAAAAAAA');
  });
});
