/**
 * HYPOTEQ 03.11.2026 Befunde 4 and 5 (DECISIONS V104): plausibility notes on the amounts —
 * shown under the field, never blocking «Weiter»; the same notes in the Abgleich JSON.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

jest.mock("next/navigation", () => ({ usePathname: () => "/de/funnel" }));

import { PLAUSIBILITY_LIMITS, plausibilityWarnings, warningsByField } from "@/lib/funnel-v3/plausibility";
import { validateScreen } from "@/lib/funnel-v3/validate";
import { AmountField } from "@/components/funnel-v3/ui/Fields";
import { FALLBACK_RULES } from "@/lib/funnel-v3/abgleich/rules";
import { abgleichCaseField } from "@/lib/funnel-v3/completion";
import { LANGS, hasKey } from "@/lib/funnel-v3/i18n";
import { ablState, kaufState, v5Payload } from "./v5Fixtures";

const codes = (s: Parameters<typeof plausibilityWarnings>[0]) => plausibilityWarnings(s).map((w) => [w.field, w.code]);

describe("the rules", () => {
  it("the test's case: Objektwert CHF 10'000 under a mortgage of CHF 500'000 (Ablösung)", () => {
    const s = ablState({ fin: { ...ablState().fin, old: 500000, up: 0, val: 10000 } });
    expect(codes(s)).toEqual([["val", "overValue"], ["val", "floor"]]);
    expect(warningsByField(plausibilityWarnings(s)).get("val")).toMatchObject({ code: "overValue", key: "val.plaus.overValue", params: { amount: 10000, mortgage: 500000 } });
  });

  it("amounts in the billions", () => {
    const s = kaufState({ fin: { ...kaufState().fin, kaufpreis: 2_000_000_000, val: 0, inc: 9_000_000_000 } });
    expect(codes(s)).toEqual(expect.arrayContaining([["kaufpreis", "ceiling"], ["inc", "ceiling"]]));
  });

  it("Befund 5: CHF 1 as Objektwert at a Kauf; an empty one is no warning", () => {
    expect(codes(kaufState({ fin: { ...kaufState().fin, val: 1 } }))[0]).toEqual(["val", "overValue"]);
    expect(codes(kaufState({ fin: { ...kaufState().fin, val: 0 } }))).toEqual([]);
  });

  it("an Objektwert far under the Kaufpreis, a renovation above it", () => {
    const s = kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, kaufpreis: 1_000_000, val: 900_000, renoBetrag: 1_500_000 } });
    // Without Eigenmittel the mortgage (2.5 Mio.) is above the value as well.
    expect(codes(s)).toEqual([["renoBetrag", "renoOver"], ["val", "overValue"]]);
    // Within the mortgage, but under half the price.
    const low = kaufState({ fin: { ...kaufState().fin, kaufpreis: 1_000_000, val: 450_000 }, em: { spar: 600_000, s3a: 0, pkVor: 0, pkVerp: 0, schenk: 0, erbe: 0, darl: 0 } });
    expect(codes(low)).toEqual([["val", "farBelow"]]);
  });

  it("an ordinary request has none, and nothing blocks «Weiter»", () => {
    expect(plausibilityWarnings(kaufState())).toEqual([]);
    const odd = ablState({ fin: { ...ablState().fin, old: 500000, val: 10000 } });
    expect(plausibilityWarnings(odd).length).toBeGreaterThan(0);
    expect(validateScreen("objekt", odd)).toEqual({});
    expect(PLAUSIBILITY_LIMITS.propertyMax).toBe(50_000_000);
  });

  it("every message in every language", () => {
    for (const l of LANGS) for (const c of ["ceiling", "floor", "overValue", "farBelow", "renoOver"]) expect([l, c, hasKey(l, `val.plaus.${c}`)]).toEqual([l, c, true]);
  });
});

describe("under the field and in the JSON", () => {
  it("the amount field shows the note, tied to the input, without marking it invalid", () => {
    const html = renderToStaticMarkup(createElement(AmountField, { field: "val", label: "Objektwert", value: 10000, onChange: () => {}, warning: "Die Hypothek ist höher." }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Die Hypothek ist höher.");
    expect(html).toMatch(/aria-describedby="[^"]*-warn"/);
    expect(html).not.toContain("aria-invalid");
    // An error wins over the note.
    expect(renderToStaticMarkup(createElement(AmountField, { field: "val", label: "Objektwert", value: 0, onChange: () => {}, error: "val.amount", warning: "x" }))).not.toContain('role="status"');
  });

  it("the Abgleich JSON lists them in German", () => {
    const p = v5Payload(ablState({ fin: { ...ablState().fin, old: 500000, up: 0, val: 10000 } }), { signed: true });
    const json = JSON.parse(abgleichCaseField(p, { rules: FALLBACK_RULES, from: "fallback" })!);
    expect(json.plausibility[0]).toEqual({ feld: "val", code: "overValue", hinweis: "Die Hypothek (CHF 500'000) ist höher als der Objektwert (CHF 10'000). Bitte prüfe den Objektwert." });
    expect("plausibility" in JSON.parse(abgleichCaseField(v5Payload(kaufState(), { signed: true }), { rules: FALLBACK_RULES, from: "fallback" })!)).toBe(false);
  });
});
