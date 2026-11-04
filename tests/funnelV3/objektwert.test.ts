/**
 * Fisnik 04.11.2026 Punkt 5 (DECISIONS V107): at a Kauf the Geschätzter Objektwert is prefilled
 * with Kaufpreis + Renovation, editable; untouched it goes out with `valPrefilled: true` and the
 * Abgleich JSON says `objektwert.prefilled`.
 */
import { describe, it, expect } from "@jest/globals";
import { isObjektwertPrefilled, objektwertDefault, objektwertShown } from "@/lib/funnel-v3/objektwert";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { FALLBACK_RULES } from "@/lib/funnel-v3/abgleich/rules";
import { abgleichCaseField } from "@/lib/funnel-v3/completion";
import { ablState, kaufState, v5Payload, SUBMISSION } from "./v5Fixtures";

const kauf = (fin: Partial<ReturnType<typeof kaufState>["fin"]>, over: Parameters<typeof kaufState>[0] = {}) =>
  kaufState({ ans: { ...kaufState().ans, reno: "Ja" }, fin: { ...kaufState().fin, kaufpreis: 1_000_000, renoBetrag: 80_000, val: 0, ...fin }, ...over });

describe("the prefilled Objektwert", () => {
  it("Kaufpreis + Renovation while the field is untouched; the Renovation only when chosen", () => {
    expect(objektwertDefault(kauf({}))).toBe(1_080_000);
    expect(objektwertShown(kauf({}))).toBe(1_080_000);
    expect(isObjektwertPrefilled(kauf({}))).toBe(true);
    expect(objektwertDefault(kaufState({ fin: { ...kaufState().fin, renoBetrag: 80_000 } }))).toBe(1_000_000);
  });

  it("the customer's value wins — typed, or emptied on purpose; so does a document's", () => {
    expect(objektwertShown(kauf({ val: 950_000 }))).toBe(950_000);
    expect(isObjektwertPrefilled(kauf({ val: 950_000 }))).toBe(false);
    const emptied = kauf({}, { touched: { "fin.val": true } });
    expect([isObjektwertPrefilled(emptied), objektwertShown(emptied)]).toEqual([false, 0]);
    const fromDoc = kauf({}, { src: { "fin.val": { doc: "Verkaufsdokumentation", unsure: true } } });
    expect(isObjektwertPrefilled(fromDoc)).toBe(false);
  });

  it("not at an Ablösung (entered there) or without a Kaufpreis", () => {
    expect(isObjektwertPrefilled(ablState({ fin: { ...ablState().fin, val: 0 } }))).toBe(false);
    expect(isObjektwertPrefilled(kauf({ kaufpreis: 0 }))).toBe(false);
  });

  it("the request sends the value with valPrefilled; the stored state keeps the mark", () => {
    const p: any = toInquiryPayload(kauf({}), { locale: "de", submissionId: SUBMISSION });
    expect(p.v3.fin.val).toBe(1_080_000);
    expect(p.v3.valPrefilled).toBe(true);
    expect(normaliseFunnelState(p.v3)!.valPrefilled).toBe(true);
    const typed: any = toInquiryPayload(kauf({ val: 950_000 }), { locale: "de", submissionId: SUBMISSION });
    expect(typed.v3.fin.val).toBe(950_000);
    expect("valPrefilled" in typed.v3).toBe(false);
  });

  it("the Abgleich JSON: objektwert.prefilled for the Pre-Check", () => {
    const rules = { rules: FALLBACK_RULES, from: "fallback" as const };
    expect(JSON.parse(abgleichCaseField(v5Payload(kauf({}), { signed: true }), rules)!).objektwert).toEqual({ value: 1_080_000, prefilled: true });
    expect(JSON.parse(abgleichCaseField(v5Payload(kauf({ val: 950_000 }), { signed: true }), rules)!).objektwert).toEqual({ value: 950_000, prefilled: false });
  });
});
