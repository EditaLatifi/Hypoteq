/**
 * Which language a visitor without one in the URL gets (spec 7 «automatisch aus der
 * Browsersprache bzw. der URL»). Pure — used by middleware.ts for `/` and by app/funnel/page.tsx
 * (DECISIONS D14); tested in tests/funnelV3/locale.test.ts.
 */

export const LOCALES = ["de", "en", "fr", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/**
 * The language ranges of an Accept-Language header, best first: `fr-CH,fr;q=0.9,en;q=0.8` →
 * `[{ tag: "fr-ch", q: 1 }, { tag: "fr", q: 0.9 }, { tag: "en", q: 0.8 }]`. Ranges with q=0 or an
 * unreadable q are dropped; equal q keeps the header's order.
 */
export function parseAcceptLanguage(header: string | null | undefined): { tag: string; q: number }[] {
  if (!header) return [];
  const out: { tag: string; q: number; i: number }[] = [];
  header.split(",").forEach((part, i) => {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag || !/^[a-z0-9*-]+$/.test(tag)) return;
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q\s*=\s*(.+)$/i);
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n < 0) return;
      q = Math.min(n, 1);
    }
    if (q <= 0) return;
    out.push({ tag, q, i });
  });
  return out.sort((a, b) => b.q - a.q || a.i - b.i).map(({ tag, q }) => ({ tag, q }));
}

/**
 * The locale for a request without one in the path: the saved choice (NEXT_LOCALE cookie) when
 * it is one of ours, else the best-ranked Accept-Language range whose primary subtag we support
 * (`fr-CH` → fr, `it-IT` → it), else German (`pt-BR` → de).
 */
export function pickLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  for (const { tag } of parseAcceptLanguage(acceptLanguage)) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
