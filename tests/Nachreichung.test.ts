import { describe, it, expect } from '@jest/globals';
import {
  createNachreichToken,
  nachreichExpiry,
  buildNachreichUrl,
  rejectNachreich,
  parseMissingKeys,
  NACHREICH_TTL_DAYS,
} from '../components/nachreichung';

/**
 * Guards the Nachreich link (spec V2).
 *
 * The token is the only credential protecting a submission's document list and its upload
 * path, so the properties asserted here — unguessable, unique, expiring, and dead once the
 * dossier is whole — are the whole security model, not incidental details.
 */

describe('Nachreich token', () => {
  it('is long enough not to be guessable', () => {
    // 32 random bytes in base64url — 43 chars, 256 bits of entropy.
    expect(createNachreichToken().length).toBeGreaterThanOrEqual(43);
  });

  it('is URL-safe, so it survives an e-mail client rewriting the link', () => {
    for (let i = 0; i < 50; i++) {
      expect(createNachreichToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => createNachreichToken()));
    expect(seen.size).toBe(500);
  });
});

describe('Expiry', () => {
  it('is the configured number of days out', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const exp = nachreichExpiry(from);
    const days = (exp.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(NACHREICH_TTL_DAYS);
  });
});

describe('buildNachreichUrl', () => {
  it('is absolute and locale-scoped, because it is read in an inbox', () => {
    const url = buildNachreichUrl('abc123', 'fr');
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain('/fr/nachreichen/abc123');
  });
});

describe('rejectNachreich', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it('accepts a live token on an incomplete dossier', () => {
    expect(
      rejectNachreich({
        nachreichExpiresAt: future,
        nachreichCompletedAt: null,
        documentsComplete: false,
      })
    ).toBeNull();
  });

  it('reports an unknown token distinctly from an expired one', () => {
    expect(rejectNachreich(null)).toBe('not_found');
    expect(
      rejectNachreich({
        nachreichExpiresAt: past,
        nachreichCompletedAt: null,
        documentsComplete: false,
      })
    ).toBe('expired');
  });

  it('closes the link once the dossier is complete', () => {
    expect(
      rejectNachreich({
        nachreichExpiresAt: future,
        nachreichCompletedAt: new Date(),
        documentsComplete: false,
      })
    ).toBe('already_complete');

    // Completed by any route, not only by this one — a customer who re-ran the funnel with
    // everything attached must not still be told documents are outstanding.
    expect(
      rejectNachreich({
        nachreichExpiresAt: future,
        nachreichCompletedAt: null,
        documentsComplete: true,
      })
    ).toBe('already_complete');
  });

  it('refuses a row with no expiry rather than treating it as eternal', () => {
    expect(
      rejectNachreich({
        nachreichExpiresAt: null,
        nachreichCompletedAt: null,
        documentsComplete: false,
      })
    ).toBe('expired');
  });

  it('treats the expiry instant itself as expired', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    expect(
      rejectNachreich(
        { nachreichExpiresAt: now, nachreichCompletedAt: null, documentsComplete: false },
        now
      )
    ).toBe('expired');
  });
});

describe('parseMissingKeys', () => {
  it('round-trips the comma-joined column', () => {
    expect(parseMissingKeys('funnel.a,funnel.b')).toEqual(['funnel.a', 'funnel.b']);
  });

  it('yields nothing for an empty or absent value', () => {
    expect(parseMissingKeys(null)).toEqual([]);
    expect(parseMissingKeys('')).toEqual([]);
    expect(parseMissingKeys(undefined)).toEqual([]);
  });

  it('drops blanks left by a trailing comma', () => {
    expect(parseMissingKeys('funnel.a,,funnel.b,')).toEqual(['funnel.a', 'funnel.b']);
  });
});
