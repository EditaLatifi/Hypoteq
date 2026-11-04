import { describe, it, expect, afterEach } from '@jest/globals';
import { isTestMode, routeMail, TEST_FOLDER_PREFIX } from '../components/testMode';

/**
 * The only property that really matters here is the default.
 *
 * A production deployment that lost this variable must behave as production and be caught
 * by a missing Salesforce Case — never swallow real leads because a flag was forgotten. So
 * "unset" has to mean live, and every accidental value has to mean live too.
 */

const original = process.env.HYPOTEQ_TEST_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.HYPOTEQ_TEST_MODE;
  else process.env.HYPOTEQ_TEST_MODE = original;
});

describe('isTestMode', () => {
  it('is off when the variable is missing', () => {
    delete process.env.HYPOTEQ_TEST_MODE;
    expect(isTestMode()).toBe(false);
  });

  it('is off for every value that is not an explicit yes', () => {
    // "0" and "false" are the ones someone actually types to turn it off; the rest are
    // typos and leftovers, and all of them must fail safe towards production.
    for (const v of ['', '0', 'false', 'no', 'off', 'nope', 'undefined', 'null', ' ']) {
      process.env.HYPOTEQ_TEST_MODE = v;
      expect({ value: v, on: isTestMode() }).toEqual({ value: v, on: false });
    }
  });

  it('is on only when asked for plainly', () => {
    for (const v of ['1', 'true', 'yes', 'TRUE', ' Yes ']) {
      process.env.HYPOTEQ_TEST_MODE = v;
      expect({ value: v, on: isTestMode() }).toEqual({ value: v, on: true });
    }
  });
});

describe('test folder prefix', () => {
  it('sorts away from customer folders and says what it is', () => {
    // SharePoint sorts by name, so a test dossier must not land among real paperwork.
    expect(TEST_FOLDER_PREFIX).toMatch(/^ZZ/);
    expect(TEST_FOLDER_PREFIX.toUpperCase()).toContain('TEST');
  });
});

describe('routeMail', () => {
  const originalInbox = process.env.HYPOTEQ_TEST_MAIL_TO;
  afterEach(() => {
    if (originalInbox === undefined) delete process.env.HYPOTEQ_TEST_MAIL_TO;
    else process.env.HYPOTEQ_TEST_MAIL_TO = originalInbox;
  });

  it('leaves mail untouched outside test mode, even with a test inbox set', () => {
    delete process.env.HYPOTEQ_TEST_MODE;
    process.env.HYPOTEQ_TEST_MAIL_TO = 'qa@example.com';
    expect(routeMail('kunde@example.com', 'Ihre Anfrage')).toEqual({
      to: 'kunde@example.com',
      subject: 'Ihre Anfrage',
    });
  });

  it('redirects to the test inbox in test mode and names the real recipient', () => {
    process.env.HYPOTEQ_TEST_MODE = 'true';
    process.env.HYPOTEQ_TEST_MAIL_TO = 'qa@example.com';
    const routed = routeMail('info@hypoteq.ch', 'Neue Anfrage');
    expect(routed?.to).toBe('qa@example.com');
    expect(routed?.subject).toContain('[TEST');
    expect(routed?.subject).toContain('info@hypoteq.ch');
    expect(routed?.subject).toContain('Neue Anfrage');
  });

  it('sends to the entered address, marked as test, when no test inbox is configured', () => {
    process.env.HYPOTEQ_TEST_MODE = 'true';
    delete process.env.HYPOTEQ_TEST_MAIL_TO;
    expect(routeMail('tester@hypoteq.ch', 'Ihre Anfrage')).toEqual({ to: 'tester@hypoteq.ch', subject: '[TEST] Ihre Anfrage' });
    process.env.HYPOTEQ_TEST_MAIL_TO = 'not-an-address';
    expect(routeMail('info@hypoteq.ch', 'Neue Anfrage')).toEqual({ to: 'info@hypoteq.ch', subject: '[TEST] Neue Anfrage' });
  });

  it('never mails the reserved example domains in test mode', () => {
    process.env.HYPOTEQ_TEST_MODE = 'true';
    delete process.env.HYPOTEQ_TEST_MAIL_TO;
    expect(routeMail('kunde@example.com', 'x')).toBeNull();
    expect(routeMail('max.muster@example.ch', 'x')).toBeNull();
    expect(routeMail('a@mail.example.org', 'x')).toBeNull();
  });
});

describe('ZZTEST mode (HYPOTEQ_TEST_SALESFORCE, DECISIONS V102)', () => {
  const savedSf = process.env.HYPOTEQ_TEST_SALESFORCE;
  afterEach(() => {
    if (savedSf === undefined) delete process.env.HYPOTEQ_TEST_SALESFORCE;
    else process.env.HYPOTEQ_TEST_SALESFORCE = savedSf;
  });

  it('the switch is off unless asked for plainly', async () => {
    const { testSalesforceEnabled } = await import('../components/testMode');
    for (const v of [undefined, '', '0', 'false', 'off', 'zz']) {
      if (v === undefined) delete process.env.HYPOTEQ_TEST_SALESFORCE;
      else process.env.HYPOTEQ_TEST_SALESFORCE = v;
      expect({ v, on: testSalesforceEnabled() }).toEqual({ v, on: false });
    }
    process.env.HYPOTEQ_TEST_SALESFORCE = ' Yes ';
    expect(testSalesforceEnabled()).toBe(true);
  });

  it('a ZZTEST submission: the last name of any Kreditnehmer or the company, any case', async () => {
    const { isZztestSubmission } = await import('../components/testMode');
    expect(isZztestSubmission({ v3: { txt: { nach: 'Muster-zztest' }, borrowers: [] } })).toBe(true);
    expect(isZztestSubmission({ v3: { txt: { nach: 'Muster' }, borrowers: [{ nach: 'Muster' }, { nach: 'ZZTEST' }] } })).toBe(true);
    expect(isZztestSubmission({ v3: { txt: { nach: '', firma: 'ZZTEST AG' } } })).toBe(true);
    expect(isZztestSubmission({ client: { lastName: 'ZZTEST' } })).toBe(true);
    expect(isZztestSubmission({ v3: { txt: { nach: 'Muster', vor: 'ZZTEST' } } })).toBe(false);
    expect(isZztestSubmission(null)).toBe(false);
  });

  it('Salesforce: always in production; in test mode only ZZTEST with the switch', async () => {
    const { salesforceAllowedFor } = await import('../components/testMode');
    const zz = { v3: { txt: { nach: 'ZZTEST' } } };
    const real = { v3: { txt: { nach: 'Muster' } } };
    delete process.env.HYPOTEQ_TEST_MODE;
    delete process.env.HYPOTEQ_TEST_SALESFORCE;
    expect([salesforceAllowedFor(zz), salesforceAllowedFor(real)]).toEqual([true, true]);
    process.env.HYPOTEQ_TEST_MODE = '1';
    expect([salesforceAllowedFor(zz), salesforceAllowedFor(real)]).toEqual([false, false]);
    process.env.HYPOTEQ_TEST_SALESFORCE = '1';
    expect([salesforceAllowedFor(zz), salesforceAllowedFor(real)]).toEqual([true, false]);
  });
});
