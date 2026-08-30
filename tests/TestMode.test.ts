import { describe, it, expect, afterEach } from '@jest/globals';
import { isTestMode, TEST_FOLDER_PREFIX } from '../components/testMode';

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
