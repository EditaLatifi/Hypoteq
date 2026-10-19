import { describe, it, expect } from "@jest/globals";
import { finishSummary } from "@/lib/funnel-v3/finishSummary";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { EMPTY_AMOUNTS, type FunnelState } from "@/lib/funnel-v3/types";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { mustermannFiles, mustermannState } from "./mustermannCase";

function summary(state: FunnelState, files: FileEntry[], lang: "de" | "en" | "fr" | "it" = "de", skipped: string[] = []) {
  const docs = documentsSummary({ ...state, files, skipped });
  return finishSummary({ state, status: docs.status, files: docs.files, hints: docs.hints, submittedDocuments: docs.submittedDocuments(), lang });
}

describe("finishSummary — Fall Mustermann", () => {
  const s = summary(mustermannState(), mustermannFiles());

  it("KPIs: Gesamtfinanzierung, Belehnung, Tragbarkeit (spec formula, D16) and Unterlagen", () => {
    expect(s.kpis.map((k) => [k.label, k.value])).toEqual([
      ["Gesamtfinanzierung", "CHF 550'000"],
      ["Belehnung", "44.4 %"],
      ["Tragbarkeit", "36.3 %"],
      ["Unterlagen", "20 / 20"],
    ]);
  });

  it("title: the verdict is «Prüfung nötig» (36.3 % > 33 %), so not the «Jetzt zur Bank» title", () => {
    expect(s.calc.verdict).toBe("review");
    expect(s.allGood).toBe(false);
    expect(s.title).toBe("Letzter Blick auf die Anfrage");
    expect(s.lead).toMatch(/Prüfung durch HYPOTEQ/);
  });

  it("Hinweise an die Bank: outdated Grundbuch (used anyway), Privatkredit, Leasing, pledged 3a policy", () => {
    expect(s.hints.map((h) => [h.kind, h.title])).toEqual([
      ["outdated", "Aktueller Grundbuchauszug (max. 6 Monate)"],
      ["kredit", expect.any(String)],
      ["leasing", expect.any(String)],
      ["pledged3a", expect.any(String)],
    ]);
    expect(s.hints[0].text).toContain("15.01.2026");
    expect(s.hints[3].text).toBe("Police an die Musterbank verpfändet.");
    expect(s.hintsLabel).toBe("Hinweise an die Bank · 4");
  });

  it("Prüfliste with Bestätigt / Offen", () => {
    expect(s.checks.map((c) => [c.label, c.badge])).toEqual([
      ["Antrag", "Bestätigt"],
      ["Objekt", "Bestätigt"],
      ["Kreditnehmer", "Bestätigt"],
      ["Tragbarkeit und Belehnung", "Offen"],
      ["Unterlagen", "Bestätigt"],
      ["Aus Dokumenten übernommen", "Bestätigt"],
    ]);
    const sub = Object.fromEntries(s.checks.map((c) => [c.key, c.sub]));
    expect(sub.antrag).toBe("Ablösung · Gesamtfinanzierung CHF 550'000");
    expect(sub.objekt).toBe("8000 Zürich · Stockwerkeigentum · Selbstbewohnt");
    // v5: the chips that were tapped (prototype finalChecks).
    expect(sub.kreditnehmer).toBe("Max Mustermann · CHF 110'000 brutto · Unterhaltszahlungen · Privatkredit · Leasing");
    expect(sub.trag).toBe("36.3 % · 44.4 %");
    expect(sub.docs).toBe("20 von 20 Anforderungen erfüllt");
    expect(sub.fromDocs).toBe(`${s.extractedFields} Angaben ausgelesen statt abgefragt · 0 manuell bestätigt`);
    expect(s.extractedFields).toBe(9);
  });

  it("translates (EN)", () => {
    const en = summary(mustermannState(), mustermannFiles(), "en");
    expect(en.title).toBe("Final look at the request");
    expect(en.checks[0].badge).toBe("Confirmed");
    expect(en.kpis[3].label).toBe("Documents");
  });
});

describe("finishSummary — title choice and documents", () => {
  const okState = () => mustermannState({ fin: { ...EMPTY_AMOUNTS, old: 380000, inc: 200000, val: 1240000 } });

  it("«Das können wir finanzieren. Jetzt zur Bank.» when the verdict is ok and no required document is missing", () => {
    const s = summary(okState(), mustermannFiles());
    expect(s.calc.verdict).toBe("ok");
    expect(s.title).toBe("Das können wir finanzieren. Jetzt zur Bank.");
    expect(s.lead).toBe("Alle Angaben und Unterlagen sind vollständig.");
  });

  it("missing required documents: other title, lead with the count, Unterlagen open", () => {
    const files = mustermannFiles().filter((f) => f.instanceId !== "fotos" && f.instanceId !== "gvz");
    const s = summary(okState(), files);
    expect(s.missingRequired).toBe(2);
    expect(s.title).toBe("Letzter Blick auf die Anfrage");
    expect(s.lead).toContain("2 Dokument(e) fehlen noch");
    const docs = s.checks.find((c) => c.key === "docs")!;
    expect(docs.ok).toBe(false);
    expect(docs.sub).toBe("18 von 20 Anforderungen erfüllt · 2 fehlen");
    expect(s.kpis[3].value).toBe("18 / 20");
  });

  it("an optional requirement marked «Habe ich nicht» counts as fulfilled and does not block", () => {
    const files = mustermannFiles().filter((f) => f.instanceId !== "verkaufsdoku");
    const open = summary(okState(), files);
    expect(open.kpis[3].value).toBe("19 / 20");
    expect(open.missingRequired).toBe(0);
    expect(open.allGood).toBe(true);
    const skipped = summary(okState(), files, "de", ["verkaufsdoku"]);
    expect(skipped.kpis[3].value).toBe("20 / 20");
  });

  it("partial and outdated are «zu prüfen»", () => {
    const files = mustermannFiles()
      .filter((f) => f.name !== "01_Versicherung_Saeule3a_Wertmitteilung_7654321.pdf")
      .map((f) => (f.instanceId === "grundbuch" ? { ...f, outdatedOverride: false } : f));
    const s = summary(okState(), files);
    expect(s.toReview).toBe(2);
    expect(s.checks.find((c) => c.key === "docs")!.sub).toBe("18 von 20 Anforderungen erfüllt · 2 zu prüfen");
  });

  it("empty answers: placeholders instead of blanks, Tragbarkeit «–»", () => {
    const base = mustermannState();
    const s = summary({ ...base, ans: { ...base.ans, antrag: undefined, lieg: undefined, nutz: undefined }, txt: { ...base.txt, vor: "", nach: "", plz: "", ort: "" }, borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }], fin: { ...EMPTY_AMOUNTS } }, []);
    const sub = Object.fromEntries(s.checks.map((c) => [c.key, c.sub]));
    expect(sub.antrag).toBe("–");
    expect(sub.objekt).toBe("Noch keine Angaben");
    expect(sub.kreditnehmer.startsWith("Name fehlt · Einkommen fehlt")).toBe(true);
    expect(s.kpis[2].value).toBe("–");
    expect(s.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["antrag", "objekt", "kreditnehmer", "trag", "docs"]);
  });

  it("juristische Person: company line, Tragbarkeit does not apply", () => {
    const base = mustermannState();
    const s = summary({ ...base, ans: { ...base.ans, kn: "Juristische Person", unterhalt: "Nein" }, txt: { ...base.txt, firma: "Muster AG", zeichner: "Anna Muster" }, fin: { ...base.fin, inc: 0 } }, []);
    expect(s.kpis[2].value).toBe("–");
    const kn = s.checks.find((c) => c.key === "kreditnehmer")!;
    expect(kn.sub).toBe("Muster AG · Anna Muster · Privatkredit · Leasing");
    expect(kn.ok).toBe(true);
  });

  it("counts manually confirmed values from the submitted documents", () => {
    const state = mustermannState();
    const docs = documentsSummary({ ...state, files: mustermannFiles() });
    const submitted = docs.submittedDocuments().map((d, i) => (i === 0 ? { ...d, humanEdits: { Baujahr: "1964", Zimmer: "4.5" } } : d));
    const s = finishSummary({ state, status: docs.status, files: docs.files, hints: docs.hints, submittedDocuments: submitted, lang: "de" });
    expect(s.confirmedFields).toBe(2);
  });
});
