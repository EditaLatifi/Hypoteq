/**
 * Handover 5 (DECISIONS V1): the v5 calculation — Hypothek from the Kaufpreis, not the
 * Objektwert; Eigenmittel count (PK-Verpfändung not); Niederstwertprinzip; harte Eigenmittel.
 */
import { describe, it, expect } from "@jest/globals";
import { calcFinancing, calcForState, equityTotal, type CalcInput } from "@/lib/funnel-v3/calc";
import { pct } from "@/lib/funnel-v3/format";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, type Eigenmittel } from "@/lib/funnel-v3/types";

const kauf = (over: Partial<CalcInput> = {}, em: Partial<Eigenmittel> = {}): CalcInput => ({
  antrag: "Neue Hypothek",
  kn: "Natürliche Person",
  kaufpreis: 0,
  reno: "Nein",
  renoBetrag: 0,
  aufstockung: "Nein",
  old: 0,
  up: 0,
  val: 0,
  inc: 0,
  inc2: 0,
  ...over,
  em: { ...EMPTY_EM, ...em },
});
const abl = (over: Partial<CalcInput> = {}) => kauf({ antrag: "Ablösung", ...over });

describe("Testfall Rosanna (Handover 5)", () => {
  it("Kaufpreis 500'000, Objektwert 1'000'000, Einkommen 150'000, keine Eigenmittel", () => {
    const r = calcFinancing(kauf({ kaufpreis: 500000, val: 1000000, inc: 150000 }));
    // v1 computed 800'000 / 100 % / «nicht tragbar» from the Objektwert.
    expect(r.need).toBe(400000);
    expect(r.basis).toBe(500000);
    expect(pct(r.ltv)).toBe("80.0 %");
    expect(r.ltvOk).toBe(true);
    // (400'000 × 5 % + (400'000 − 333'333) / 15 + 500'000 × 1 %) / 150'000
    expect(pct(r.affordability)).toBe("19.6 %");
    expect(r.verdict).toBe("ok");
  });
});

describe("Kauf", () => {
  it("Eigenmittel entered: Hypothek = Gesamtkosten − Eigenmittel; PK-Verpfändung does not count", () => {
    const em = { spar: 150000, s3a: 50000, pkVor: 50000, pkVerp: 100000 };
    expect(equityTotal({ ...EMPTY_EM, ...em })).toBe(250000);
    const r = calcFinancing(kauf({ kaufpreis: 1000000, inc: 200000 }, em));
    expect(r.cost).toBe(1000000);
    expect(r.emTotal).toBe(250000);
    expect(r.emPct).toBe(25);
    expect(r.hard).toBe(200000);
    expect(r.hardOk).toBe(true);
    expect(r.need).toBe(750000);
    // Empty Objektwert = Kaufpreis.
    expect(r.value).toBe(1000000);
    expect(r.basis).toBe(1000000);
    expect(r.ltv).toBeCloseTo(75, 9);
    // 37'500 + (750'000 − 666'667) / 15 = 5'555.56 + 10'000 = 53'055.56 / 200'000
    expect(r.affordability).toBeCloseTo(26.528, 2);
    expect(r.verdict).toBe("ok");
  });

  it("harte Eigenmittel below 10 % of the Kaufpreis need review", () => {
    const r = calcFinancing(kauf({ kaufpreis: 1000000, inc: 300000 }, { spar: 50000, pkVor: 150000 }));
    expect(r.need).toBe(800000);
    expect(r.ltvOk).toBe(true);
    expect(r.affOk).toBe(true);
    expect(r.hard).toBe(50000);
    expect(r.hardOk).toBe(false);
    expect(r.verdict).toBe("review");
    // Exactly 10 % is enough.
    expect(calcFinancing(kauf({ kaufpreis: 1000000, inc: 300000 }, { spar: 100000, pkVor: 100000 })).hardOk).toBe(true);
    // Without any Eigenmittel the rule does not apply (80 % assumed).
    expect(calcFinancing(kauf({ kaufpreis: 1000000, inc: 300000 })).hardOk).toBe(true);
  });

  it("Renovation: the Renovationsbetrag counts towards the Gesamtkosten — only when Renovation = Ja", () => {
    const r = calcFinancing(kauf({ kaufpreis: 800000, reno: "Ja", renoBetrag: 100000, val: 1000000, inc: 200000 }));
    expect(r.cost).toBe(900000);
    expect(r.basis).toBe(900000);
    expect(r.need).toBe(720000);
    expect(r.ltv).toBeCloseTo(80, 9);
    expect(calcFinancing(kauf({ kaufpreis: 800000, reno: "Nein", renoBetrag: 100000, val: 1000000, inc: 200000 })).cost).toBe(800000);
  });

  it("Niederstwertprinzip: an Objektwert below the Gesamtkosten is the basis", () => {
    const r = calcFinancing(kauf({ kaufpreis: 1000000, val: 900000, inc: 250000 }));
    expect(r.need).toBe(800000);
    expect(r.basis).toBe(900000);
    expect(r.ltv).toBeCloseTo(88.89, 2);
    expect(r.verdict).toBe("review");
  });

  it("an empty Objektwert is the Kaufpreis, also with a renovation (handover over prototype)", () => {
    const r = calcFinancing(kauf({ kaufpreis: 800000, reno: "Ja", renoBetrag: 100000, inc: 200000 }));
    expect(r.value).toBe(800000);
    expect(r.basis).toBe(800000);
    expect(r.need).toBe(720000);
    expect(r.ltv).toBeCloseTo(90, 9);
  });

  it("the household income is Kreditnehmer 1 + 2", () => {
    const one = calcFinancing(kauf({ kaufpreis: 500000, inc: 100000 }));
    const two = calcFinancing(kauf({ kaufpreis: 500000, inc: 100000, inc2: 50000 }));
    expect(two.income).toBe(150000);
    expect(two.affordability!).toBeCloseTo((one.affordability! * 100000) / 150000, 9);
  });
});

describe("Ablösung", () => {
  it("Mustermann: bestehende CHF 380'000 + Erhöhung CHF 170'000, Objektwert CHF 1'240'000, Einkommen CHF 110'000", () => {
    const r = calcFinancing(abl({ aufstockung: "Ja", old: 380000, up: 170000, val: 1240000, inc: 110000 }));
    expect(r.need).toBe(550000);
    expect(r.basis).toBe(1240000);
    expect(pct(r.ltv)).toBe("44.4 %");
    // 27'500 + 0 + 12'400 = 39'900 / 110'000 = 36.3 %, the formula of the spec (DECISIONS D16).
    expect(r.affordability).toBeCloseTo((39900 / 110000) * 100, 6);
    expect(r.verdict).toBe("review");
    // Eigenmittel play no part.
    expect(calcFinancing(abl({ aufstockung: "Ja", old: 380000, up: 170000, val: 1240000, inc: 110000, em: { ...EMPTY_EM, s3a: 8760 } })).need).toBe(550000);
  });

  it("ignores the Erhöhung when it is Nein", () => {
    const r = calcFinancing(abl({ aufstockung: "Nein", old: 380000, up: 170000, val: 1240000, inc: 110000 }));
    expect(r.need).toBe(380000);
    // 19'000 + 0 + 12'400 = 31'400 / 110'000 = 28.5 %.
    expect(r.affordability).toBeCloseTo((31400 / 110000) * 100, 6);
    expect(r.verdict).toBe("ok");
  });

  it("needs the Objektwert as basis", () => {
    const r = calcFinancing(abl({ old: 380000, inc: 110000 }));
    expect(r.basis).toBe(0);
    expect(r.ltv).toBeNull();
    expect(r.verdict).toBe("incomplete");
  });

  it("Belehnung over 80 % needs review", () => {
    const r = calcFinancing(abl({ aufstockung: "Ja", old: 700000, up: 200000, val: 1000000, inc: 400000 }));
    expect(r.ltv).toBeCloseTo(90, 9);
    expect(r.ltvOk).toBe(false);
    expect(r.verdict).toBe("review");
  });
});

describe("juristische Person (DECISIONS D7)", () => {
  it("Belehnung only, no Tragbarkeit", () => {
    const r = calcFinancing(abl({ kn: "Juristische Person", old: 500000, val: 1000000 }));
    expect(r.ltv).toBeCloseTo(50, 9);
    expect(r.affordability).toBeNull();
    expect(r.affOk).toBe(true);
    expect(r.verdict).toBe("ok");
    expect(calcFinancing(abl({ kn: "Juristische Person", old: 500000, val: 1000000, inc: 10 })).affordability).toBeNull();
  });
});

describe("incomplete", () => {
  it("«Angaben ergänzen» while values are missing", () => {
    expect(calcFinancing(kauf({ kaufpreis: 500000 })).verdict).toBe("incomplete");
    expect(calcFinancing(kauf({ kaufpreis: 500000 })).affordability).toBeNull();
    expect(calcFinancing(kauf({ inc: 100000 })).verdict).toBe("incomplete");
    expect(calcFinancing(kauf({ antrag: undefined, kaufpreis: 500000, inc: 100000 })).verdict).toBe("incomplete");
    expect(calcFinancing(abl({ val: 1000000, inc: 100000 })).verdict).toBe("incomplete");
  });
});

describe("calcForState", () => {
  const base = {
    ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek" as const },
    fin: { ...EMPTY_AMOUNTS, kaufpreis: 500000, val: 1000000, inc: 150000, inc2: 50000 },
    em: { ...EMPTY_EM },
  };
  it("counts Kreditnehmer 2's income only while there is one", () => {
    expect(calcForState({ ...base, borrowers: [{}] }).income).toBe(150000);
    expect(calcForState({ ...base, borrowers: [{}, {}] }).income).toBe(200000);
  });
});
