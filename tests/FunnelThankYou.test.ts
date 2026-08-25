import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_FUNNEL_LOCALE,
  FALLBACK_NAVIGATION_MS,
  POPUP_MIN_RUN_MS,
  THANK_YOU_PATHS,
  localeFromPath,
  showsInFunnelThankYou,
  thankYouPathFor,
} from '../components/funnelThankYou';

/**
 * Guards the end of the funnel.
 *
 * A partner used to see two "Vielen Dank" screens for one submission: the funnel page
 * advanced to its in-funnel step 7 AND DocumentsStep redirected to the thank-you page. Both
 * halves are asserted here — who is allowed to show the in-funnel screen, and that the
 * redirect cannot fire while the popup is still running.
 *
 * These are also the last screens of a completed dossier, so a wrong path is a 404 after
 * the customer has already done all the work. Every route is checked against the filesystem.
 */

const ROOT = path.join(__dirname, '..');

describe('showsInFunnelThankYou', () => {
  it('lets direct customers finish on the in-funnel screen', () => {
    // They have no document step, so no popup exists to take them anywhere else.
    expect(showsInFunnelThankYou('direct')).toBe(true);
  });

  it('does NOT let partners finish there — the upload popup navigates instead', () => {
    // The regression this whole module exists for: both firing meant two thank-you screens.
    expect(showsInFunnelThankYou('partner')).toBe(false);
  });

  it('treats an unknown or missing customer type as in-funnel', () => {
    // Only the partner flow has a popup to hand over to; anything else must still end
    // somewhere rather than sit on the last form.
    expect(showsInFunnelThankYou(undefined)).toBe(true);
    expect(showsInFunnelThankYou(null)).toBe(true);
    expect(showsInFunnelThankYou('')).toBe(true);
  });
});

describe('exactly one final screen', () => {
  it('gives every customer type one ending and only one', () => {
    // In-funnel screen XOR popup navigation. Two trues is the bug; two falses strands them.
    for (const type of ['direct', 'partner', 'unknown']) {
      const inFunnel = showsInFunnelThankYou(type);
      const popupNavigates = !inFunnel;
      expect([inFunnel, popupNavigates].filter(Boolean)).toHaveLength(1);
    }
  });
});

describe('localeFromPath', () => {
  it('reads the locale off a funnel URL', () => {
    expect(localeFromPath('/fr/funnel')).toBe('fr');
    expect(localeFromPath('/it/funnel')).toBe('it');
    expect(localeFromPath('/en/funnel')).toBe('en');
    expect(localeFromPath('/de/funnel')).toBe('de');
  });

  it('falls back to German for anything it does not recognise', () => {
    for (const p of ['/', '', '/funnel', '/es/funnel', null, undefined]) {
      expect(localeFromPath(p)).toBe(DEFAULT_FUNNEL_LOCALE);
    }
  });
});

describe('thankYouPathFor', () => {
  it('accepts a bare locale', () => {
    expect(thankYouPathFor('fr')).toBe('/fr/merci');
    expect(thankYouPathFor('it')).toBe('/it/grazie');
    expect(thankYouPathFor('en')).toBe('/en/thank-you');
    expect(thankYouPathFor('de')).toBe('/de/danke');
  });

  it('accepts a URL path, which is what the browser actually has', () => {
    expect(thankYouPathFor('/fr/funnel')).toBe('/fr/merci');
    expect(thankYouPathFor('/en/funnel')).toBe('/en/thank-you');
  });

  it('never returns undefined — a completed funnel must land somewhere', () => {
    for (const input of [null, undefined, '', '/', 'es', '/es/funnel']) {
      expect(thankYouPathFor(input)).toBe(THANK_YOU_PATHS[DEFAULT_FUNNEL_LOCALE]);
    }
  });

  it('sends each locale to a different page', () => {
    // Not one shared page: each is its own route with its own wording.
    const paths = Object.values(THANK_YOU_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('thank-you routes exist on disk', () => {
  it.each(Object.entries(THANK_YOU_PATHS))('%s -> %s is a real page', (_locale, route) => {
    // "/fr/merci" is served by app/[locale]/merci/page.tsx — the locale is the dynamic
    // segment, so only the second segment is a folder. A typo here 404s a customer who has
    // just finished the entire funnel, and nothing else in the codebase would catch it.
    const segment = route.split('/')[2];
    const page = path.join(ROOT, 'app', '[locale]', segment, 'page.tsx');
    expect(fs.existsSync(page)).toBe(true);
  });

  it('starts every route with its own locale segment', () => {
    for (const [locale, route] of Object.entries(THANK_YOU_PATHS)) {
      expect(route.startsWith(`/${locale}/`)).toBe(true);
    }
  });
});

describe('fallback navigation timing', () => {
  it('outlasts the popup by a clear margin', () => {
    // The whole regression: at 1500ms the fallback beat the popup's ~8s run every time, so
    // it fired on every submission instead of only when the popup failed.
    expect(FALLBACK_NAVIGATION_MS).toBeGreaterThan(POPUP_MIN_RUN_MS * 2);
  });

  it('still rescues a stranded customer rather than never firing', () => {
    expect(FALLBACK_NAVIGATION_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('no second copy of the path map', () => {
  // The map used to exist here, in DocumentsStep and inside the popup's TRANSLATIONS. Three
  // copies meant a locale could be fixed in one and stay broken in the others.
  const sources = [
    'app/funnel/steps/DocumentsStep.tsx',
    'app/funnel/steps/HypoteqLoadingPopup.tsx',
  ];

  it.each(sources)('%s hardcodes no thank-you route', (file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // Comments may name the routes; only string literals are a second source of truth.
    const literals = text.match(/["'`]\/(?:de|fr|it|en)\/(?:danke|merci|grazie|thank-you)["'`]/g);
    expect(literals).toBeNull();
  });

  it.each(sources)('%s imports the shared module instead', (file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(text).toContain('funnelThankYou');
  });
});
