import { describe, it, expect } from "@jest/globals";
import { chf, chfShort, percent, portfolio, type PortfolioCase } from "@/lib/portal/portfolio";

/** «Ihr Portfolio» (handoff «Dashboard» 4; definitions DECISIONS P22). */

const NOW = new Date("2026-10-15T10:00:00Z");

function c(p: Partial<PortfolioCase> & { status: string }): PortfolioCase {
  return { betrag: null, createdAt: "2026-09-01T08:00:00Z", closedAt: null, documents: [], ...p };
}

const CASES: PortfolioCase[] = [
  // open
  c({ status: "Dokumente ausstehend", betrag: 850_000, documents: [{ status: "vorhanden" }, { status: "fehlt" }, { status: "fehlt" }, { status: "pruefung" }] }),
  c({ status: "Bei Kreditgeber", betrag: 620_000, documents: [{ status: "vorhanden" }, { status: "vorhanden" }, { status: "hochgeladen", extra: true }] }),
  c({ status: "Neue Anfrage", betrag: null }),
  // completed, both in 2026 by Zurich time (the second one only just)
  c({ status: "Abgeschlossen", betrag: 960_000, createdAt: "2026-07-22T08:00:00Z", closedAt: "2026-09-02T08:00:00Z" }),
  c({ status: "Abgeschlossen", betrag: 400_000, createdAt: "2025-11-01T08:00:00Z", closedAt: "2025-12-31T23:30:00Z" }),
  // ended without financing
  c({ status: "Storniert", betrag: 480_000 }),
];

describe("portfolio", () => {
  const p = portfolio(CASES, NOW);

  it("Volumen in Bearbeitung: the amounts of the open Cases", () => {
    expect(p.pipeline).toEqual({ volume: 1_470_000, cases: 3 });
  });

  it("Finanziert <Jahr>: Abgeschlossen in the current Zurich calendar year", () => {
    // 31.12.2025 23:30 UTC is already 01.01.2026 in Zurich.
    expect(p.financed).toEqual({ year: 2026, volume: 1_360_000, cases: 2 });
    expect(portfolio(CASES, new Date("2025-12-01T12:00:00Z")).financed.cases).toBe(0);
  });

  it("Ø Finanzierungsbetrag: Cases with an amount, without Abgelehnt and Storniert", () => {
    expect(p.average).toEqual({ amount: Math.round((850_000 + 620_000 + 960_000 + 400_000) / 4), cases: 4 });
  });

  it("Ø Durchlaufzeit: CreatedDate to ClosedDate of the Abgeschlossen Cases, in days", () => {
    // 22.07 → 02.09 = 42 days; 01.11.2025 08:00 → 31.12.2025 23:30 = 60.6 days
    expect(p.throughput).toEqual({ days: Math.round((42 + 60.6458333) / 2), cases: 2 });
  });

  it("Dokumenten-Quote: mean share on file over the open Cases that list documents", () => {
    // 2 of 4 (vorhanden, pruefung) and 2 of 2 (the extra upload does not count) → 75 %
    expect(p.docQuota).toEqual({ pct: 75, cases: 2 });
  });

  it("an empty portfolio has sums of zero and no means", () => {
    expect(portfolio([], NOW)).toEqual({
      pipeline: { volume: 0, cases: 0 },
      financed: { year: 2026, volume: 0, cases: 0 },
      average: { amount: null, cases: 0 },
      throughput: { days: null, cases: 0 },
      docQuota: { pct: null, cases: 0 },
    });
  });
});

describe("Swiss formats", () => {
  it("CHF with apostrophes", () => {
    expect(chf(850_000)).toBe("CHF 850'000");
    expect(chf(1_150_000.4)).toBe("CHF 1'150'000");
    expect(chf(0)).toBe("CHF 0");
  });
  it("millions as «Mio.» with two decimals, a trailing zero dropped", () => {
    expect(chfShort(4_060_000)).toBe("CHF 4.06 Mio.");
    expect(chfShort(4_100_000)).toBe("CHF 4.1 Mio.");
    expect(chfShort(999_999)).toBe("CHF 999'999");
  });
  it("percent with a space", () => {
    expect(percent(35)).toBe("35 %");
    expect(percent(74.6)).toBe("75 %");
  });
});
