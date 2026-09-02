import { describe, it, expect, afterEach } from '@jest/globals';
import {
  documentIntelligenceDisabledReason,
  isDocumentIntelligenceEnabled,
} from '../components/documentIntelligence/enabled';

/**
 * Document Intelligence is a Preview-only feature for now, and this is what enforces it.
 *
 * The case worth protecting is the third one: `.env.local` is pulled from Vercel's
 * Production scope, so VERCEL_ENV reads "production" on the developer's own machine. A gate
 * written the obvious way would switch the feature off exactly where it is being built,
 * while letting a real Production deployment through unnoticed the day someone adds
 * OPENAI_API_KEY to the wrong scope.
 */

const ORIGINAL = { ...process.env };

function env(values: Record<string, string | undefined>) {
  for (const key of ['NODE_ENV', 'VERCEL_ENV', 'HYPOTEQ_DOCAI_IN_PRODUCTION']) {
    delete (process.env as any)[key];
  }
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) (process.env as any)[k] = v;
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('where document analysis may run', () => {
  it('runs on a preview deployment', () => {
    env({ NODE_ENV: 'production', VERCEL_ENV: 'preview' });
    expect(isDocumentIntelligenceEnabled()).toBe(true);
  });

  it('runs under next dev even though .env.local says production', () => {
    // The trap: VERCEL_ENV here comes from the pulled Production env file, not from a
    // Production deployment. Keying on it alone would disable the feature on the machine
    // where it is developed and tested.
    env({ NODE_ENV: 'development', VERCEL_ENV: 'production' });
    expect(isDocumentIntelligenceEnabled()).toBe(true);
  });

  it('does not run on a production deployment', () => {
    env({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    expect(isDocumentIntelligenceEnabled()).toBe(false);
    expect(documentIntelligenceDisabledReason()).toContain('preview');
  });

  it('names the variable that would switch it on, so the message is actionable', () => {
    env({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    expect(documentIntelligenceDisabledReason()).toContain('HYPOTEQ_DOCAI_IN_PRODUCTION');
  });

  it('runs in production only when explicitly asked to', () => {
    for (const yes of ['1', 'true', 'yes', 'YES']) {
      env({ NODE_ENV: 'production', VERCEL_ENV: 'production', HYPOTEQ_DOCAI_IN_PRODUCTION: yes });
      expect(isDocumentIntelligenceEnabled()).toBe(true);
    }
  });

  it('treats anything that is not an explicit yes as off', () => {
    // Off is the safe state, so it is also the default for a value nobody meant: "0",
    // "false", and a variable someone set to an empty string all leave it off.
    for (const no of ['0', 'false', 'no', '', 'maybe']) {
      env({ NODE_ENV: 'production', VERCEL_ENV: 'production', HYPOTEQ_DOCAI_IN_PRODUCTION: no });
      expect(isDocumentIntelligenceEnabled()).toBe(false);
    }
  });
});
