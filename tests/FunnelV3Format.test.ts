import { describe, it, expect } from "@jest/globals";
import { chf, pct, parseAmount, date, time, dateTime } from "@/lib/funnel-v3/format";

describe("format", () => {
  it("chf uses an ASCII apostrophe and whole francs", () => {
    expect(chf(380000)).toBe("CHF 380'000");
    expect(chf(1240000)).toBe("CHF 1'240'000");
    expect(chf(550000.6)).toBe("CHF 550'001");
    expect(chf(0)).toBe("CHF 0");
    expect(chf(999)).toBe("CHF 999");
    expect(chf(-21480)).toBe("CHF -21'480");
    expect(chf(NaN)).toBe("–");
    expect(chf(null)).toBe("–");
  });

  it("pct", () => {
    expect(pct(44.354839)).toBe("44.4 %");
    expect(pct(36.272727)).toBe("36.3 %");
    expect(pct(80)).toBe("80.0 %");
    expect(pct(29.4444, 0)).toBe("29 %");
    expect(pct(null)).toBe("–");
  });

  it("parseAmount", () => {
    expect(parseAmount("380'000")).toBe(380000);
    expect(parseAmount("CHF 1’240’000")).toBe(1240000);
    expect(parseAmount("380 000")).toBe(380000);
    expect(parseAmount("380.000")).toBe(380000);
    expect(parseAmount("1,240,000")).toBe(1240000);
    expect(parseAmount("110000.50")).toBe(110000.5);
    expect(parseAmount("380'000.–")).toBe(380000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount(170000)).toBe(170000);
    expect(parseAmount(chf(550000))).toBe(550000);
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
