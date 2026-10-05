import { describe, it, expect } from "@jest/globals";
import { parseAcceptLanguage, pickLocale } from "@/lib/locale";

describe("pickLocale (spec 7 «automatisch aus der Browsersprache»)", () => {
  it("parses q-values and ranks the best first, header order on ties", () => {
    expect(parseAcceptLanguage("fr-CH,fr;q=0.9,en;q=0.8")).toEqual([
      { tag: "fr-ch", q: 1 },
      { tag: "fr", q: 0.9 },
      { tag: "en", q: 0.8 },
    ]);
    expect(parseAcceptLanguage("en;q=0.5, it")).toEqual([{ tag: "it", q: 1 }, { tag: "en", q: 0.5 }]);
    expect(parseAcceptLanguage("de;q=0, en")).toEqual([{ tag: "en", q: 1 }]);
    expect(parseAcceptLanguage("de ; q = 0.3, fr;Q=0.6")).toEqual([{ tag: "fr", q: 0.6 }, { tag: "de", q: 0.3 }]);
    expect(parseAcceptLanguage("de;q=abc")).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });

  it("matches the primary subtag of the best-ranked supported range", () => {
    expect(pickLocale(undefined, "fr-CH,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(pickLocale(undefined, "it-IT")).toBe("it");
    expect(pickLocale(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(pickLocale(undefined, "de-CH,de;q=0.9,fr;q=0.8")).toBe("de");
    // the first supported language by rank, not the first in the header
    expect(pickLocale(undefined, "pt-BR,es;q=0.8,en;q=0.4")).toBe("en");
    expect(pickLocale(undefined, "en;q=0.7,de;q=0.9")).toBe("de");
  });

  it("falls back to German", () => {
    expect(pickLocale(undefined, "pt-BR")).toBe("de");
    expect(pickLocale(undefined, "*")).toBe("de");
    expect(pickLocale(undefined, undefined)).toBe("de");
    expect(pickLocale(null, null)).toBe("de");
  });

  it("prefers the saved choice (NEXT_LOCALE) when it is one of ours", () => {
    expect(pickLocale("it", "fr-CH")).toBe("it");
    expect(pickLocale("xx", "fr-CH")).toBe("fr");
    expect(pickLocale("", "fr-CH")).toBe("fr");
    expect(pickLocale("DE", "fr-CH")).toBe("fr");
  });
});
