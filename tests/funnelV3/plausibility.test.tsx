/**
 * Fisnik 04.11.2026 Punkt 4 (DECISIONS V104): hard stops only for amounts that make no sense
 * technically (under CHF 10'000 / over CHF 100 Mio., a mortgage above Objektwert + Renovation);
 * one soft note — Belehnung over 100 % — shown under the field, never blocking, and in the
 * Abgleich JSON for the Pre-Check. No income limits.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

jest.mock("next/navigation", () => ({ usePathname: () => "/de/funnel" }));

import { AMOUNT_LIMITS, plausibilityWarnings, warningsByField } from "@/lib/funnel-v3/plausibility";
import { validateScreen } from "@/lib/funnel-v3/validate";
import { AmountField } from "@/components/funnel-v3/ui/Fields";
import { FALLBACK_RULES } from "@/lib/funnel-v3/abgleich/rules";
import { abgleichCaseField } from "@/lib/funnel-v3/completion";
import { LANGS, hasKey } from "@/lib/funnel-v3/i18n";
import { EMPTY_EM } from "@/lib/funnel-v3/types";
import { ablState, kaufState, v5Payload } from "./v5Fixtures";

const objekt = (s: Parameters<typeof validateScreen>[1]) => validateScreen("objekt", s);
const reno = (over: Partial<ReturnType<typeof kaufState>["fin"]>, em = EMPTY_EM) =>
  kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, kaufpreis: 1_000_000, renoBetrag: 200_000, ...over }, em });

describe("hard stops (typing errors)", () => {
  it("Kaufpreis, Objektwert, bestehende Hypothek under CHF 10'000 or over CHF 100 Mio.", () => {
    expect(objekt(kaufState({ fin: { ...kaufState().fin, kaufpreis: 9_000, val: 0 } })).kaufpreis).toBe("val.range");
    expect(objekt(kaufState({ fin: { ...kaufState().fin, kaufpreis: 2_000_000_000 } })).kaufpreis).toBe("val.range");
    expect(objekt(kaufState({ fin: { ...kaufState().fin, val: 1 } })).val).toBe("val.range");
    expect(objekt(ablState({ fin: { ...ablState().fin, old: 150_000_000 } })).old).toBe("val.range");
    expect(AMOUNT_LIMITS).toEqual({ min: 10_000, max: 100_000_000 });
  });

  it("Erhöhung, Renovation and Eigenmittel only over CHF 100 Mio. — a small renovation or 3a passes", () => {
    expect(objekt(reno({ renoBetrag: 150_000_000 })).renoBetrag).toBe("val.tooHigh");
    expect(objekt(reno({ renoBetrag: 5_000, val: 0 })).renoBetrag).toBeUndefined();
    expect(objekt(kaufState({ em: { ...EMPTY_EM, s3a: 8_760, spar: 300_000 } }))).toEqual({});
    expect(objekt(kaufState({ em: { ...EMPTY_EM, spar: 500_000_000 } }))["em.spar"]).toBe("val.tooHigh");
  });

  it("a mortgage above Objektwert plus Renovation", () => {
    // Ablösung: no Renovation, so above the Objektwert is the stop.
    expect(objekt(ablState({ fin: { ...ablState().fin, old: 500_000, up: 0, val: 400_000 } })).val).toBe("val.overCost");
    // Kauf without Eigenmittel: the calculation takes 80 % of 1.2 Mio. = 960'000, against 700'000 + 200'000.
    expect(objekt(reno({ val: 700_000 })).val).toBe("val.overCost");
  });

  it("no income limits, and an ordinary request passes", () => {
    expect(validateScreen("personen", kaufState({ fin: { ...kaufState().fin, inc: 9_000_000_000 } }))).toEqual({});
    expect(objekt(kaufState())).toEqual({});
  });

  it("every message in every language", () => {
    for (const l of LANGS) for (const k of ["val.range", "val.tooHigh", "val.overCost", "val.plaus.overValue"]) expect([l, k, hasKey(l, k)]).toEqual([l, k, true]);
  });
});

describe("the soft note: Belehnung over 100 %", () => {
  it("mortgage above the Objektwert alone, within Objektwert + Renovation: a note, «Weiter» stays free", () => {
    // Mortgage 1.2 Mio. − 100'000 = 1.1 Mio. against 1.0 Mio. (+ 200'000 Renovation).
    const s = reno({ val: 1_000_000 }, { ...EMPTY_EM, spar: 100_000 });
    expect(warningsByField(plausibilityWarnings(s)).get("val")).toMatchObject({ code: "overValue", key: "val.plaus.overValue", params: { amount: 1_000_000, mortgage: 1_100_000 } });
    expect(objekt(s)).toEqual({});
  });

  it("not when the hard stop already holds, not at 100 % or less, not for an empty field", () => {
    expect(plausibilityWarnings(reno({ val: 700_000 }))).toEqual([]);
    expect(plausibilityWarnings(kaufState())).toEqual([]);
    expect(plausibilityWarnings(kaufState({ fin: { ...kaufState().fin, kaufpreis: 0, val: 0 } }))).toEqual([]);
  });

  it("under the field, tied to the input, not marking it invalid; an error wins", () => {
    const html = renderToStaticMarkup(createElement(AmountField, { field: "val", label: "Objektwert", value: 10000, onChange: () => {}, warning: "Die Belehnung liegt über 100 %." }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Die Belehnung liegt über 100 %.");
    expect(html).toMatch(/aria-describedby="[^"]*-warn"/);
    expect(html).not.toContain("aria-invalid");
    expect(renderToStaticMarkup(createElement(AmountField, { field: "val", label: "Objektwert", value: 0, onChange: () => {}, error: "val.amount", warning: "x" }))).not.toContain('role="status"');
  });

  it("as «hinweis» in the Abgleich JSON for the Pre-Check", () => {
    const p = v5Payload(reno({ val: 1_000_000 }, { ...EMPTY_EM, spar: 100_000 }), { signed: true });
    const json = JSON.parse(abgleichCaseField(p, { rules: FALLBACK_RULES, from: "fallback" })!);
    expect(json.plausibility).toEqual([
      { feld: "val", code: "overValue", hinweis: "Belehnung über 100 %: Hypothek CHF 1'100'000 höher als der Objektwert CHF 1'000'000 – der Kunde hat den Hinweis gesehen und weitergemacht." },
    ]);
    expect("plausibility" in JSON.parse(abgleichCaseField(v5Payload(kaufState(), { signed: true }), { rules: FALLBACK_RULES, from: "fallback" })!)).toBe(false);
  });
});
