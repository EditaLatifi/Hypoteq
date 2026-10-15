import { describe, it, expect } from "@jest/globals";
import { chf, pct, parseAmount, date, time, dateTime } from "@/lib/funnel-v3/format";

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
