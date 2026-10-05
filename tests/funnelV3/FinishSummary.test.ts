import { describe, it, expect } from "@jest/globals";
import { finishSummary } from "@/lib/funnel-v3/finishSummary";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import type { FunnelState } from "@/lib/funnel-v3/types";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { gerberFiles, gerberState } from "./gerberCase";

function summary(state: FunnelState, files: FileEntry[], lang: "de" | "en" | "fr" | "it" = "de", skipped: string[] = []) {
  const docs = documentsSummary({ ...state, files, skipped });
  return finishSummary({ state, status: docs.status, files: docs.files, hints: docs.hints, submittedDocuments: docs.submittedDocuments(), lang });
}

describe("finishSummary — Fall Gerber", () => {
  const s = summary(gerberState(), gerberFiles());

  it("KPIs: Gesamtfinanzierung, Belehnung, Tragbarkeit (spec formula, D16) and Unterlagen", () => {
    expect(s.kpis.map((k) => [k.label, k.value])).toEqual([
      ["Gesamtfinanzierung", "CHF 650'000"],
      ["Belehnung", "44.8 %"],
      ["Tragbarkeit", "37.6 %"],
      ["Unterlagen", "23 / 23"],
    ]);
  });

  it("title: the verdict is «Prüfung nötig» (37.6 % > 33 %), so not the «Jetzt zur Bank» title", () => {
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
    expect(s.hints[3].text).toBe("Police an die ZKB verpfändet.");
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
    expect(sub.antrag).toBe("Ablösung · Gesamtfinanzierung CHF 650'000");
    expect(sub.objekt).toBe("8820 Wädenswil · Stockwerkeigentum · Selbstbewohnt");
    expect(sub.kreditnehmer).toBe("Gary Gerber · CHF 125'000 brutto · Kinder, Unterhalt · Kredite / Leasing");
    expect(sub.trag).toBe("37.6 % · 44.8 %");
    expect(sub.docs).toBe("23 von 23 Anforderungen erfüllt");
    expect(sub.fromDocs).toBe(`${s.extractedFields} Angaben ausgelesen statt abgefragt · 0 manuell bestätigt`);
    expect(s.extractedFields).toBe(9);
  });

  it("translates (EN)", () => {
    const en = summary(gerberState(), gerberFiles(), "en");
    expect(en.title).toBe("Final look at the request");
    expect(en.checks[0].badge).toBe("Confirmed");
    expect(en.kpis[3].label).toBe("Documents");
  });
});

describe("finishSummary — title choice and documents", () => {
  const okState = () => gerberState({ fin: { old: 449000, up: 0, kaufpreis: 0, inc: 200000, val: 1450000 } });

  it("«Das können wir finanzieren. Jetzt zur Bank.» when the verdict is ok and no required document is missing", () => {
    const s = summary(okState(), gerberFiles());
    expect(s.calc.verdict).toBe("ok");
    expect(s.title).toBe("Das können wir finanzieren. Jetzt zur Bank.");
    expect(s.lead).toBe("Alle Angaben und Unterlagen sind vollständig.");
  });

  it("missing required documents: other title, lead with the count, Unterlagen open", () => {
    const files = gerberFiles().filter((f) => f.instanceId !== "fotos" && f.instanceId !== "gvz");
    const s = summary(okState(), files);
    expect(s.missingRequired).toBe(2);
    expect(s.title).toBe("Letzter Blick auf die Anfrage");
    expect(s.lead).toContain("2 Dokument(e) fehlen noch");
    const docs = s.checks.find((c) => c.key === "docs")!;
    expect(docs.ok).toBe(false);
    expect(docs.sub).toBe("21 von 23 Anforderungen erfüllt · 2 fehlen");
    expect(s.kpis[3].value).toBe("21 / 23");
  });

  it("an optional requirement marked «Habe ich nicht» counts as fulfilled and does not block", () => {
    const files = gerberFiles().filter((f) => f.instanceId !== "verkaufsdoku");
    const open = summary(okState(), files);
    expect(open.kpis[3].value).toBe("22 / 23");
    expect(open.missingRequired).toBe(0);
    expect(open.allGood).toBe(true);
    const skipped = summary(okState(), files, "de", ["verkaufsdoku"]);
    expect(skipped.kpis[3].value).toBe("23 / 23");
  });

  it("partial and outdated are «zu prüfen»", () => {
    const files = gerberFiles()
      .filter((f) => !(f.instanceId === "lohnausweise#b1" && f.analysis?.docDate === "2023"))
      .map((f) => (f.instanceId === "grundbuch" ? { ...f, outdatedOverride: false } : f));
    const s = summary(okState(), files);
    expect(s.toReview).toBe(2);
    expect(s.checks.find((c) => c.key === "docs")!.sub).toBe("21 von 23 Anforderungen erfüllt · 2 zu prüfen");
  });

  it("empty answers: placeholders instead of blanks, Tragbarkeit «–»", () => {
    const base = gerberState();
    const s = summary({ ...base, ans: { ...base.ans, antrag: undefined, lieg: undefined, nutz: undefined }, txt: { ...base.txt, vor: "", nach: "", plz: "", ort: "" }, borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }], fin: { old: 0, up: 0, kaufpreis: 0, inc: 0, val: 0 } }, []);
    const sub = Object.fromEntries(s.checks.map((c) => [c.key, c.sub]));
    expect(sub.antrag).toBe("–");
    expect(sub.objekt).toBe("Noch keine Angaben");
    expect(sub.kreditnehmer.startsWith("Name fehlt · Einkommen fehlt")).toBe(true);
    expect(s.kpis[2].value).toBe("–");
    expect(s.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["antrag", "objekt", "kreditnehmer", "trag", "docs"]);
  });

  it("juristische Person: company line, Tragbarkeit does not apply", () => {
    const base = gerberState();
    const s = summary({ ...base, ans: { ...base.ans, kn: "Juristische Person", kinder: "Nein", unterhalt: "Nein" }, txt: { ...base.txt, firma: "Muster AG", zeichner: "Anna Muster" }, fin: { ...base.fin, inc: 0 } }, []);
    expect(s.kpis[2].value).toBe("–");
    const kn = s.checks.find((c) => c.key === "kreditnehmer")!;
    expect(kn.sub).toBe("Muster AG · Anna Muster · Kredite / Leasing");
    expect(kn.ok).toBe(true);
  });

  it("counts manually confirmed values from the submitted documents", () => {
    const state = gerberState();
    const docs = documentsSummary({ ...state, files: gerberFiles() });
    const submitted = docs.submittedDocuments().map((d, i) => (i === 0 ? { ...d, humanEdits: { Baujahr: "1921", Zimmer: "4.5" } } : d));
    const s = finishSummary({ state, status: docs.status, files: docs.files, hints: docs.hints, submittedDocuments: submitted, lang: "de" });
    expect(s.confirmedFields).toBe(2);
  });
});
