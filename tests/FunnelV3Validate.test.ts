import { describe, it, expect } from "@jest/globals";
import { validateStep, validateScreen, isStepValid } from "@/lib/funnel-v3/validate";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import { translate } from "@/lib/funnel-v3/i18n";

const empty = (over: Partial<FunnelState> = {}): FunnelState => ({
  role: "kunde",
  mode: "begleitet",
  ans: { ...DEFAULT_ANSWERS },
  borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }],
  txt: { ...EMPTY_TEXTS },
  fin: { ...EMPTY_AMOUNTS },
  em: { ...EMPTY_EM },
  info: {},
  src: {},
  touched: {},
  sig: null,
  ...over,
});

describe("validateScreen (Handover 2, 3)", () => {
  it("Anfrage, Kunde: Telefon is required", () => {
    expect(validateScreen("anfrage", empty())).toEqual({
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
    expect(validateScreen("anfrage", ok)).toEqual({});
    expect(validateScreen("anfrage", { ...ok, txt: { ...ok.txt, mail: "gary@" } })).toEqual({ mail: "val.email" });
  });

  it("Anfrage, Berater: own e-mail and — since v5 — the customer's phone", () => {
    const s = empty({
      role: "berater",
      ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek", anrede: "Frau" },
      txt: { ...EMPTY_TEXTS, vor: "A", nach: "B", mail: "a@b.ch" },
    });
    expect(validateScreen("anfrage", s)).toEqual({ bmail: "val.required", tel: "val.required" });
    expect(validateScreen("anfrage", { ...s, txt: { ...s.txt, bmail: "x", tel: "079" } })).toEqual({ bmail: "val.email" });
    expect(isStepValid(1, { ...s, txt: { ...s.txt, bmail: "berater@vzch.ch", tel: "079" } })).toBe(true);
  });

  it("Anfrage, juristische Person: Firma and zeichnungsberechtigte Person instead of Anrede and name", () => {
    const jp = empty({ ans: { ...DEFAULT_ANSWERS, kn: "Juristische Person", antrag: "Neue Hypothek" }, txt: { ...EMPTY_TEXTS, mail: "info@etzel.ch", tel: "044" } });
    expect(validateScreen("anfrage", jp)).toEqual({ firma: "val.required", zeichner: "val.required" });
    expect(validateScreen("anfrage", { ...jp, txt: { ...jp.txt, firma: "Etzel AG", zeichner: "Gary Gerber" } })).toEqual({});
  });

  it("Kontakt (Schnellanmeldung): Berater-E-Mail, customer e-mail and phone", () => {
    expect(validateScreen("kontakt", empty({ role: "berater" }))).toEqual({ bmail: "val.required", mail: "val.required", tel: "val.required" });
    expect(validateScreen("kontakt", empty({ txt: { ...EMPTY_TEXTS, mail: "gary@example.ch", tel: "079" } }))).toEqual({});
  });

  it("Objekt & Finanzierung depends on the Antrag", () => {
    const base = { txt: { ...EMPTY_TEXTS, plz: "8820", ort: "Wädenswil" } };
    const abl = empty({
      ...base,
      ans: { ...DEFAULT_ANSWERS, antrag: "Ablösung", immo: "Bestehende Immobilie", lieg: "Stockwerkeigentum", nutz: "Selbstbewohnt", aufstockung: "Ja" },
    });
    expect(validateScreen("objekt", abl)).toEqual({ old: "val.amount", up: "val.amount", val: "val.amount" });
    expect(validateScreen("objekt", { ...abl, fin: { ...EMPTY_AMOUNTS, old: 449000, up: 201000, val: 1450000 } })).toEqual({});

    const kauf = empty({ ...base, ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek", reno: "Ja" } });
    expect(validateScreen("objekt", kauf)).toEqual({ immo: "val.choose", lieg: "val.choose", nutz: "val.choose", kaufpreis: "val.amount", renoBetrag: "val.amount" });
    // A Kauf needs no Objektwert (empty = Kaufpreis) and no Laufzeit (optional since v5).
    expect(validateScreen("objekt", { ...kauf, ans: { ...kauf.ans, immo: "Neubau", lieg: "Einfamilienhaus", nutz: "Selbstbewohnt", reno: "Nein" }, fin: { ...EMPTY_AMOUNTS, kaufpreis: 1 } })).toEqual({});
    expect(validateScreen("objekt", empty())).toMatchObject({ plz: "val.required", ort: "val.required" });
  });

  it("Personen: Kreditnehmer 1's income and Beschäftigung, Kreditnehmer 2's name, Solidarbürge", () => {
    const nat = empty({
      borrowers: [
        { id: "1", vor: "Gary", nach: "Gerber", pkSe: "Nein", job: "Angestellt" },
        { id: "2", vor: "", nach: "", pkSe: "Nein" },
      ],
    });
    expect(validateScreen("personen", nat)).toEqual({ inc: "val.amount", "borrower.1.vor": "val.required", "borrower.1.nach": "val.required" });
    expect(validateScreen("personen", empty())).toMatchObject({ "borrower.0.job": "val.choose" });

    const jur = empty({ ans: { ...DEFAULT_ANSWERS, kn: "Juristische Person", buerge: "Ja" } });
    expect(validateScreen("personen", jur)).toEqual({ buergeName: "val.required" });
  });

  it("Unterlagen and Abschluss have no required fields", () => {
    expect(validateScreen("upload", empty())).toEqual({});
    expect(validateScreen("abschluss", empty())).toEqual({});
    expect(validateScreen(null, empty())).toEqual({});
  });
});

describe("validateStep follows the mode", () => {
  it("step 1 is Anfrage in the Begleitete, Kontakt in the Schnellanmeldung", () => {
    expect(validateStep(1, empty())).toHaveProperty("antrag");
    expect(validateStep(1, empty({ mode: "schnell" }))).not.toHaveProperty("antrag");
    expect(validateStep(3, empty({ mode: "schnell" }))).toHaveProperty("antrag");
    expect(validateStep(0, empty())).toEqual({});
    expect(validateStep(4, empty())).toEqual({});
  });

  it("every key it returns is translated", () => {
    for (const k of ["val.required", "val.choose", "val.email", "val.amount"])
      for (const l of ["de", "en", "fr", "it"]) expect(translate(l, k)).not.toBe(k);
  });
});
