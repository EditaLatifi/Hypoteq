/**
 * Handover 4.2: rules from the document analysis that need no question — bonus, Lohnerhöhung,
 * ab 50 (lib/funnel-v3/facts.ts; DECISIONS V2, V14).
 */
import { describe, it, expect } from "@jest/globals";
import { AGE_THRESHOLD, SALARY_THRESHOLD, ageAt, amountOf, annualSalary, belongsTo, dateOf, docFacts, type AnalysedFile } from "@/lib/funnel-v3/facts";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import type { PersonRef } from "@/lib/funnel-v3/requirements";

const NOW = new Date(2026, 9, 15);
let n = 0;
const file = (docTypeId: string, fields: Record<string, string>, over: Partial<V3Analysis> = {}): AnalysedFile => ({
  fileId: `f${++n}`,
  analysis: {
    status: "done",
    docTypeId,
    docTypeLabel: docTypeId,
    confidence: 0.95,
    requirementId: docTypeId,
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.95 }])),
    ...over,
  },
});
const person = (first: string, last: string, kind: PersonRef["kind"] = "borrower"): PersonRef => ({ kind, first, last, display: `${first} ${last}` });
const MAX = person("Max", "Mustermann");
const people = { kn1: MAX, others: [] as PersonRef[] };

const lohnausweis = (annual: string, year = "2025", name = "Mustermann Max") => file("lohnausweise", { Jahr: year, Bruttolohn: annual }, { docDate: year, personName: name });
const payslip = (monthly: string, thirteenth?: string, date = "2026-05", name = "Mustermann Max") =>
  file("lohnabrechnungen", { "Monatslohn brutto": monthly, ...(thirteenth ? { "13. Monatslohn": thirteenth } : {}) }, { docDate: date, personName: name });

describe("Fall Mustermann (Handover 4.2)", () => {
  it("Lohnausweis 2025 CHF 110'310 vs. 13 × CHF 8'460 = CHF 109'980 → +0.3 %: neither bonus nor raise", () => {
    const f = docFacts([lohnausweis("CHF 110'310"), payslip("CHF 8'460", "ja")], people, NOW);
    expect(f.bonus).toBe(false);
    expect(f.raise).toBe(false);
    expect(f.salary).toMatchObject({ year: 2025, annual: 110310, monthly: 8460, thirteenth: true });
    expect(f.salary!.bonusDelta).toBeCloseTo(110310 / 109980 - 1, 9);
    expect((f.salary!.bonusDelta * 100).toFixed(1)).toBe("0.3");
  });

  it("the threshold is one constant: 5 % (DECISIONS V2)", () => {
    expect(SALARY_THRESHOLD).toBe(0.05);
    expect(AGE_THRESHOLD).toBe(50);
  });
});

describe("bonus", () => {
  it("Jahreslohn > Monatslohn × 13 + 5 % → bonus", () => {
    // 13 × 9'000 = 117'000; + 5 % = 122'850
    expect(docFacts([lohnausweis("CHF 123'000"), payslip("9'000", "ja")], people, NOW).bonus).toBe(true);
    expect(docFacts([lohnausweis("CHF 122'800"), payslip("9'000", "ja")], people, NOW).bonus).toBe(false);
  });
  it("× 12 when the payslips say there is no 13th salary", () => {
    // 12 × 9'000 = 108'000; + 5 % = 113'400
    expect(docFacts([lohnausweis("115'000"), payslip("9'000", "nein")], people, NOW).bonus).toBe(true);
  });
  it("13th salary unknown: × 13 — the reading that adds no document (DECISIONS V14)", () => {
    expect(docFacts([lohnausweis("115'000"), payslip("9'000")], people, NOW)).toMatchObject({ bonus: false, salary: { thirteenth: null } });
  });
  it("needs both documents — nothing is guessed", () => {
    expect(docFacts([lohnausweis("200'000")], people, NOW)).toEqual({ bonus: false, raise: false, ab50: false });
    expect(docFacts([payslip("9'000", "ja")], people, NOW).bonus).toBe(false);
  });
});

describe("Lohnerhöhung", () => {
  it("aktueller Monatslohn × 12/13 > Vorjahres-Lohnausweis + 5 % → raise", () => {
    // 13 × 10'000 = 130'000 > 117'000 × 1.05 = 122'850
    const f = docFacts([lohnausweis("117'000"), payslip("10'000", "ja")], people, NOW);
    expect(f.raise).toBe(true);
    expect(f.bonus).toBe(false);
  });
  it("13th salary unknown: × 12 (DECISIONS V14)", () => {
    // 12 × 10'000 = 120'000 < 122'850
    expect(docFacts([lohnausweis("117'000"), payslip("10'000")], people, NOW).raise).toBe(false);
  });
  it("compares with the Lohnausweis of the year before the payslips, the newest payslip", () => {
    const f = docFacts([lohnausweis("100'000", "2024"), lohnausweis("117'000", "2025"), payslip("9'000", "ja", "2026-02"), payslip("10'000", "ja", "2026-05")], people, NOW);
    expect(f.salary).toMatchObject({ year: 2025, annual: 117000, monthly: 10000 });
    expect(f.raise).toBe(true);
  });
});

describe("whose documents", () => {
  it("only Kreditnehmer 1's salary documents count (P17: none for Kreditnehmer 2)", () => {
    const lea = person("Lea", "Mustermann");
    const f = docFacts([lohnausweis("200'000", "2025", "Mustermann Lea"), payslip("5'000", "ja", "2026-05", "Mustermann Lea"), lohnausweis("110'310"), payslip("8'460", "ja")], { kn1: MAX, kn2: lea, others: [] }, NOW);
    expect(f.salary).toMatchObject({ annual: 110310, monthly: 8460 });
    expect(f.bonus).toBe(false);
  });
  it("the Solidarbürge's Lohnausweis never counts", () => {
    const peter = person("Peter", "Bürgi", "guarantor");
    expect(docFacts([lohnausweis("300'000", "2025", "Buergi Peter"), payslip("9'000", "ja")], { kn1: MAX, others: [peter] }, NOW).salary).toBeUndefined();
  });
  it("without a printed name a document is Kreditnehmer 1's only when nobody else could own it", () => {
    const a = lohnausweis("1", "2025", "").analysis;
    expect(belongsTo(a, MAX, [])).toBe(true);
    expect(belongsTo(a, MAX, [person("Lea", "Mustermann")])).toBe(false);
    expect(belongsTo(lohnausweis("1", "2025", "Mustermann Max").analysis, undefined, [])).toBe(true);
  });
});

describe("ab 50", () => {
  const id = (birth: string, name = "Mustermann Max") => file("id", { Geburtsdatum: birth }, { personName: name, docDate: null });
  it("from the ID's birth date, at today", () => {
    expect(docFacts([id("05.03.1985")], people, NOW)).toMatchObject({ ab50: false, age: 41 });
    expect(docFacts([id("15.10.1976")], people, NOW)).toMatchObject({ ab50: true, age: 50 });
    expect(docFacts([id("16.10.1976")], people, NOW)).toMatchObject({ ab50: false, age: 49 });
  });
  it("any Kreditnehmer, not the Solidarbürge", () => {
    const lea = person("Lea", "Mustermann");
    expect(docFacts([id("05.03.1985"), id("01.01.1960", "Mustermann Lea")], { kn1: MAX, kn2: lea, others: [] }, NOW).ab50).toBe(true);
    expect(docFacts([id("01.01.1960", "Buergi Peter")], { kn1: MAX, others: [person("Peter", "Bürgi", "guarantor")] }, NOW).ab50).toBe(false);
  });
  it("an unreadable birth date says nothing", () => {
    expect(docFacts([id("unbekannt")], people, NOW)).toEqual({ bonus: false, raise: false, ab50: false });
  });
});

describe("reading values", () => {
  it("amounts as printed", () => {
    expect(amountOf("CHF 110'310")).toBe(110310);
    expect(amountOf("8'460.–")).toBe(8460);
    expect(amountOf("CHF 8'760 per 09.01.2026")).toBe(8760);
    expect(amountOf("CHF 1’240’000")).toBe(1240000);
    expect(amountOf("CHF 110'310.50")).toBe(110310.5);
    expect(amountOf("")).toBe(0);
    expect(amountOf(null)).toBe(0);
  });
  it("dates and ages", () => {
    expect(dateOf("5.3.1985")).toBe("05.03.1985");
    expect(dateOf("1985-03-05")).toBe("05.03.1985");
    expect(dateOf("x")).toBe("");
    expect(ageAt("05.03.1985", NOW)).toBe(41);
    expect(ageAt("", NOW)).toBeNull();
  });
  it("the Jahreslohn also from an analysis stored before v5 («Bruttolohn 2025»)", () => {
    expect(annualSalary(file("lohnausweise", { "Bruttolohn 2024": "105'200", "Bruttolohn 2025": "110'310" }, { docDate: "2025" }).analysis)).toBe(110310);
  });
});
