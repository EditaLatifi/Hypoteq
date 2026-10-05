import { describe, it, expect } from "@jest/globals";
import { chf, pct, parseAmount, date, time, dateTime } from "@/lib/funnel-v3/format";
import { calcFinancing } from "@/lib/funnel-v3/calc";

describe("format", () => {
  it("chf uses an ASCII apostrophe and whole francs", () => {
    expect(chf(449000)).toBe("CHF 449'000");
    expect(chf(1450000)).toBe("CHF 1'450'000");
    expect(chf(650000.6)).toBe("CHF 650'001");
    expect(chf(0)).toBe("CHF 0");
    expect(chf(999)).toBe("CHF 999");
    expect(chf(-24360)).toBe("CHF -24'360");
    expect(chf(NaN)).toBe("–");
    expect(chf(null)).toBe("–");
  });

  it("pct", () => {
    expect(pct(44.827586)).toBe("44.8 %");
    expect(pct(37.6)).toBe("37.6 %");
    expect(pct(80)).toBe("80.0 %");
    expect(pct(29.4444, 0)).toBe("29 %");
    expect(pct(null)).toBe("–");
  });

  it("parseAmount", () => {
    expect(parseAmount("449'000")).toBe(449000);
    expect(parseAmount("CHF 1’450’000")).toBe(1450000);
    expect(parseAmount("449 000")).toBe(449000);
    expect(parseAmount("449.000")).toBe(449000);
    expect(parseAmount("1,450,000")).toBe(1450000);
    expect(parseAmount("125000.50")).toBe(125000.5);
    expect(parseAmount("449'000.–")).toBe(449000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount(201000)).toBe(201000);
    expect(parseAmount(chf(650000))).toBe(650000);
  });

  it("date is TT.MM.JJJJ", () => {
    expect(date(new Date(2026, 9, 5))).toBe("05.10.2026");
    expect(date("2026-01-15")).toBe("15.01.2026");
    expect(date("nonsense")).toBe("");
    expect(date(null)).toBe("");
  });

  it("dateTime is TT.MM.JJJJ HH:MM in every language (audit trail)", () => {
    const d = new Date(2026, 9, 5, 14, 3, 27);
    expect(time(d)).toBe("14:03");
    expect(time(new Date(2026, 0, 1, 9, 7))).toBe("09:07");
    expect(dateTime(d)).toBe("05.10.2026 14:03");
    expect(dateTime(d.toISOString())).toBe("05.10.2026 14:03");
    expect(dateTime(d.getTime())).toBe("05.10.2026 14:03");
    expect(dateTime("2026-01-15")).toBe("15.01.2026");
    expect(dateTime("nonsense")).toBe("");
    expect(dateTime(null)).toBe("");
    expect(time(undefined)).toBe("");
  });
});

describe("calcFinancing", () => {
  it("Gerber: Ablösung CHF 449'000 + Erhöhung CHF 201'000, Objektwert CHF 1'450'000, Einkommen CHF 125'000", () => {
    const r = calcFinancing({
      antrag: "Ablösung",
      aufstockung: "Ja",
      old: 449000,
      up: 201000,
      val: 1450000,
      inc: 125000,
      kn: "Natürliche Person",
    });
    expect(r.need).toBe(650000);
    // 650'000 / 1'450'000
    expect(pct(r.ltv)).toBe("44.8 %");
    expect(r.ltvOk).toBe(true);
    // (650'000 × 5 % = 32'500) + max(650'000 − 966'667, 0)/15 = 0 + 1'450'000 × 1 % = 14'500
    // = 47'000 / 125'000 = 37.6 %. (The sample dossier prints 32.3 %, which this formula
    // does not give — see the report.)
    expect(r.affordability).toBeCloseTo(37.6, 6);
    expect(r.affOk).toBe(false);
    expect(r.verdict).toBe("review");
  });

  it("Ablösung ignores the Erhöhung when it is Nein", () => {
    const r = calcFinancing({ antrag: "Ablösung", aufstockung: "Nein", old: 449000, up: 201000, val: 1450000, inc: 125000, kn: "Natürliche Person" });
    expect(r.need).toBe(449000);
    // 449'000×5% = 22'450 + 0 + 14'500 = 36'950 / 125'000 = 29.56 %
    expect(r.affordability).toBeCloseTo(29.56, 6);
    expect(r.verdict).toBe("ok");
  });

  it("Neue Hypothek: need = Objektwert × 80 %, amortisation above two thirds", () => {
    const r = calcFinancing({ antrag: "Neue Hypothek", aufstockung: "Nein", old: 0, up: 0, val: 1000000, inc: 200000, kn: "Natürliche Person" });
    expect(r.need).toBe(800000);
    expect(r.ltv).toBeCloseTo(80, 9);
    expect(r.ltvOk).toBe(true);
    // 40'000 + (800'000 − 666'666.67)/15 = 8'888.89 + 10'000 = 58'888.89 / 200'000 = 29.444 %
    expect(r.affordability).toBeCloseTo(29.4444, 3);
    expect(r.verdict).toBe("ok");
  });

  it("Belehnung over 80 % needs review", () => {
    const r = calcFinancing({ antrag: "Ablösung", aufstockung: "Ja", old: 700000, up: 200000, val: 1000000, inc: 400000, kn: "Natürliche Person" });
    expect(r.ltv).toBeCloseTo(90, 9);
    expect(r.ltvOk).toBe(false);
    expect(r.verdict).toBe("review");
  });

  it("juristische Person: Belehnung only, no Tragbarkeit", () => {
    const r = calcFinancing({ antrag: "Ablösung", aufstockung: "Nein", old: 500000, up: 0, val: 1000000, inc: 0, kn: "Juristische Person" });
    expect(r.ltv).toBeCloseTo(50, 9);
    expect(r.affordability).toBeNull();
    expect(r.affOk).toBe(true);
    expect(r.verdict).toBe("ok");
    // income is ignored even when present
    expect(calcFinancing({ antrag: "Ablösung", aufstockung: "Nein", old: 500000, up: 0, val: 1000000, inc: 10, kn: "Juristische Person" }).affordability).toBeNull();
  });

  it("missing values → incomplete", () => {
    const base = { antrag: "Ablösung" as const, aufstockung: "Nein" as const, old: 449000, up: 0, val: 1450000, inc: 125000, kn: "Natürliche Person" as const };
    expect(calcFinancing({ ...base, val: 0 }).verdict).toBe("incomplete");
    expect(calcFinancing({ ...base, val: 0 }).ltv).toBeNull();
    expect(calcFinancing({ ...base, inc: 0 }).verdict).toBe("incomplete");
    expect(calcFinancing({ ...base, inc: 0 }).affordability).toBeNull();
    expect(calcFinancing({ ...base, old: 0 }).verdict).toBe("incomplete");
    expect(calcFinancing({ ...base, antrag: undefined }).verdict).toBe("incomplete");
  });
});
