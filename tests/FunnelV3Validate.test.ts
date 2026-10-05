import { describe, it, expect } from "@jest/globals";
import { validateStep, isStepValid } from "@/lib/funnel-v3/validate";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import { translate } from "@/lib/funnel-v3/i18n";

const empty = (over: Partial<FunnelState> = {}): FunnelState => ({
  role: "kunde",
  ans: { ...DEFAULT_ANSWERS },
  borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }],
  txt: { ...EMPTY_TEXTS },
  fin: { ...EMPTY_AMOUNTS },
  ...over,
});

describe("validateStep", () => {
  it("step 1, Kunde", () => {
    expect(validateStep(1, empty())).toEqual({
      antrag: "val.choose",
      anrede: "val.choose",
      vor: "val.required",
      nach: "val.required",
      mail: "val.required",
      tel: "val.required",
    });
    const ok = empty({
      ans: { ...DEFAULT_ANSWERS, antrag: "Ablösung", anrede: "Herr" },
      txt: { ...EMPTY_TEXTS, vor: "Gary", nach: "Gerber", mail: "gary@example.ch", tel: "079 000 00 00" },
    });
    expect(validateStep(1, ok)).toEqual({});
    expect(validateStep(1, { ...ok, txt: { ...ok.txt, mail: "gary@" } })).toEqual({ mail: "val.email" });
  });

  it("step 1, Berater: own e-mail required, customer phone not", () => {
    const s = empty({
      role: "berater",
      ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek", anrede: "Frau" },
      txt: { ...EMPTY_TEXTS, vor: "A", nach: "B", mail: "a@b.ch" },
    });
    expect(validateStep(1, s)).toEqual({ bmail: "val.required" });
    expect(validateStep(1, { ...s, txt: { ...s.txt, bmail: "x" } })).toEqual({ bmail: "val.email" });
    expect(isStepValid(1, { ...s, txt: { ...s.txt, bmail: "berater@vzch.ch" } })).toBe(true);
  });

  it("step 2 depends on the Antrag", () => {
    const base = {
      txt: { ...EMPTY_TEXTS, plz: "8820", ort: "Wädenswil" },
    };
    const abl = empty({
      ...base,
      ans: { ...DEFAULT_ANSWERS, antrag: "Ablösung", immo: "Bestehende Immobilie", lieg: "Stockwerkeigentum", nutz: "Selbstbewohnt", aufstockung: "Ja" },
    });
    expect(validateStep(2, abl)).toEqual({ old: "val.amount", up: "val.amount" });
    expect(validateStep(2, { ...abl, fin: { ...EMPTY_AMOUNTS, old: 449000, up: 201000 } })).toEqual({});

    const kauf = empty({ ...base, ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek" } });
    expect(validateStep(2, kauf)).toEqual({ immo: "val.choose", lieg: "val.choose", nutz: "val.choose", kaufpreis: "val.amount" });
    expect(validateStep(2, empty())).toMatchObject({ plz: "val.required", ort: "val.required" });
  });

  it("step 3, natural and legal person, Solidarbürge", () => {
    const nat = empty({
      borrowers: [
        { id: "1", vor: "Gary", nach: "Gerber", pkSe: "Nein", job: "Angestellt" },
        { id: "2", vor: "Anna", nach: "Gerber", pkSe: "Nein" },
      ],
    });
    expect(validateStep(3, nat)).toEqual({ inc: "val.amount", "borrower.1.job": "val.choose" });

    const jur = empty({ ans: { ...DEFAULT_ANSWERS, kn: "Juristische Person", buerge: "Ja" } });
    expect(validateStep(3, jur)).toEqual({ firma: "val.required", zeichner: "val.required", buergeName: "val.required" });
  });

  it("step 4 and steps without required fields", () => {
    expect(validateStep(4, empty())).toEqual({ val: "val.amount", laufzeit: "val.choose" });
    expect(validateStep(0, empty())).toEqual({});
    expect(validateStep(5, empty())).toEqual({});
    expect(validateStep(6, empty())).toEqual({});
  });

  it("every key it returns is translated", () => {
    for (const k of ["val.required", "val.choose", "val.email", "val.amount"])
      for (const l of ["de", "en", "fr", "it"]) expect(translate(l, k)).not.toBe(k);
  });
});
