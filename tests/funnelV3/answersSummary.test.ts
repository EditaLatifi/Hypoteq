import { describe, it, expect } from "@jest/globals";
import { answersSummary } from "@/lib/funnel-v3/answersSummary";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import { mustermannState } from "./mustermannCase";
import { kaufState } from "./v5Fixtures";

const view = (boxes: ReturnType<typeof answersSummary>) => boxes.map((b) => [b.label, b.value, b.detail, b.screen]);

describe("«Deine Angaben aus dem Fragepfad» (Spezifikation Datenabgleich 2.1)", () => {
  it("Kauf: Anfrage, Objekt, Finanzierung, one box per person, Tragbarkeit und Belehnung", () => {
    const s = kaufState({ em: { spar: 250000, s3a: 0, pkVor: 0, pkVerp: 0, schenk: 0, erbe: 0, darl: 0 } });
    expect(view(answersSummary(s, "de"))).toEqual([
      ["Anfrage", "Neue Hypothek", "Natürliche Person", "anfrage"],
      ["Objekt", "Einfamilienhaus", "8001 Zürich · Selbstbewohnt", "objekt"],
      ["Finanzierung", "CHF 750'000", "Geschätzter Hypothekbedarf · Kaufpreis CHF 1'000'000 · Eigenmittel CHF 250'000", "objekt"],
      ["Kreditnehmer 1", "Lea Muster", "Angestellt · CHF 200'000 brutto", "personen"],
      ["Tragbarkeit und Belehnung", "Finanzierung möglich", "Tragbarkeit 26.5 % · Belehnung 75.0 %", "objekt"],
    ]);
  });

  it("Ablösung with Erhöhung: the Gesamtfinanzierung from the existing mortgage and the increase", () => {
    const fin = answersSummary(mustermannState(), "de").find((b) => b.key === "finanzierung")!;
    expect(fin.value).toBe("CHF 550'000");
    expect(fin.detail).toBe("Gesamtfinanzierung · Bestehende Hypothek CHF 380'000 · Gewünschte Erhöhung CHF 170'000");
  });

  it("Kreditnehmer 2 has its own box with its income; a company has one box with the Firma", () => {
    const two = kaufState({
      borrowers: [
        { id: "b1", vor: "Lea", nach: "Muster", job: "Angestellt", pkSe: "Nein" },
        { id: "b2", vor: "", nach: "", job: "Selbständig", pkSe: "Nein" },
      ],
      fin: { ...kaufState().fin, inc2: 80000 },
    });
    const people = answersSummary(two, "de").filter((b) => b.key.startsWith("person:"));
    expect(people.map((b) => [b.label, b.value, b.detail, b.empty])).toEqual([
      ["Kreditnehmer 1", "Lea Muster", "Angestellt · CHF 200'000 brutto", false],
      ["Kreditnehmer 2", "Name fehlt", "Selbständig · CHF 80'000 brutto", true],
    ]);

    const jur = kaufState({ ans: { ...kaufState().ans, kn: "Juristische Person", nutz: "Vermietet" }, txt: { ...kaufState().txt, firma: "Immo Beispiel AG", zeichner: "Max Muster" } });
    const boxes = answersSummary(jur, "de");
    expect(boxes.filter((b) => b.screen === "personen").map((b) => [b.label, b.value, b.detail])).toEqual([["Kreditnehmer", "Immo Beispiel AG", "Max Muster"]]);
    // No Tragbarkeit for a company (calc.ts): only the Belehnung.
    expect(boxes.at(-1)!.detail).toBe("Belehnung 80.0 %");
  });

  it("nothing answered: placeholders, marked empty", () => {
    const empty = { ans: { ...DEFAULT_ANSWERS }, txt: { ...EMPTY_TEXTS }, fin: { ...EMPTY_AMOUNTS }, borrowers: [] };
    const boxes = answersSummary(empty, "de");
    expect(boxes.map((b) => b.value)).toEqual(["–", "–", "–", "Name fehlt", "Angaben ergänzen"]);
    expect(boxes.every((b) => b.empty)).toBe(true);
  });

  it("in the funnel language", () => {
    const fr = answersSummary(kaufState(), "fr");
    expect(fr[0].label).not.toBe("Anfrage");
    expect(fr[3].detail).toContain("CHF 200'000");
  });
});
