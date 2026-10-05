import { describe, it, expect } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { buildDossierModel, createDossierPdf, dossierFileName, type DossierFile } from "@/lib/funnel-v3/dossier";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { gerberFiles, gerberState } from "./gerberCase";

const toDossierFiles = (files: FileEntry[]): DossierFile[] =>
  files.map((f) => ({
    id: f.id,
    name: f.name,
    originalName: f.name,
    instanceId: f.instanceId ?? null,
    extraKind: f.analysis?.extraKind,
    keep: f.keep,
    outdatedOverride: f.outdatedOverride,
    removed: !f.instanceId && (f.analysis?.extraKind === "duplicate" || (f.analysis?.extraKind === "notneeded" && !f.keep)),
    analysis: f.analysis,
  }));

const input = (over: Partial<Parameters<typeof buildDossierModel>[0]> = {}) => ({
  lang: "de" as const,
  draft: false,
  caseNumber: "HQ-26-06-156283",
  date: new Date("2026-06-02T10:00:00Z"),
  state: gerberState(),
  files: toDossierFiles(gerberFiles()),
  ...over,
});

describe("Fall-Dossier model — Gerber", () => {
  const m = buildDossierModel(input());

  it("header, footer and Deckblatt", () => {
    expect(m.header.right).toBe("Fall-Dossier · HQ-26-06-156283 · Gerber, Wädenswil");
    expect(m.footer.left).toBe("Vertraulich · für Kreditgeber");
    expect(m.cover.eyebrow).toBe("Finanzierungsanfrage · Ablösung und Erhöhung");
    expect(m.cover.title).toEqual(["Gary Gerber", "8820 Wädenswil"]);
    expect(m.cover.description).toBe("Stockwerkeigentum, Selbstbewohnt. Ablösung der bestehenden Hypothek der ZKB von CHF 449'000 und Erhöhung um CHF 201'000.");
    expect(m.cover.kpis.map((k) => k.value)).toEqual(["CHF 650'000", "44.8 %", "37.6 %"]);
    expect(m.cover.right).toBe("HQ-26-06-156283 · 02.06.2026");
    expect(m.cover.left).toBe("Eigene Anfrage");
  });

  it("sections 01–05 in prototype order", () => {
    expect(m.sections.map((s) => s.title)).toEqual(["01 · Antrag", "02 · Objekt", "03 · Kreditnehmer", "04 · Finanzierung und Tragbarkeit", "05 · Verlauf"]);
    const antrag = Object.fromEntries([...m.sections[0].columns![0], ...m.sections[0].columns![1]].map((kv) => [kv.label, kv.value]));
    expect(antrag).toMatchObject({ "Bestehende Bank": "ZKB", "Bestehende Hypothek": "CHF 449'000", "Gewünschte Erhöhung": "CHF 201'000", Gesamtfinanzierung: "CHF 650'000", "Gewünschte Laufzeit": "3 Jahre" });
    expect(m.sections[0].callouts![0].label).toBe("Verwendungszweck der Erhöhung");
    const costs = m.sections[3].table!.rows.map((r) => r.map((c) => c.text));
    expect(costs[0]).toEqual(["Zins 5 % auf CHF 650'000", "CHF 32'500"]);
    expect(costs[3]).toEqual(["Total Belastung", "CHF 47'000"]);
    expect(m.sections[3].notes).toContain("Unterhaltszahlungen sind in der Tragbarkeit nicht enthalten; die Unterhaltsvereinbarung liegt im Annex.");
    expect(m.sections[3].callouts!.map((c) => c.label)).toHaveLength(4);
  });

  it("annex A–E with stored names, origins and the Vollständigkeit box", () => {
    expect(m.annex.groups.map((g) => g.title)).toEqual([
      "A · Zum Objekt",
      "B · Bestehende Hypothek",
      "C · Zur Person · Gary Gerber",
      "D · Eigenmittel und Vorsorge",
      "E · Weitere Dateien · nicht gewertet",
    ]);
    const a = m.annex.groups[0].table.rows;
    expect(a[3][0].text).toBe("A4");
    expect(a[3][1].sub).toBe("Pflicht · Veraltet · 15.01.2026 · trotzdem verwendet");
    expect(a[3][1].warn).toBe(true);
    expect(a[5][1].sub).toBe("weil: Liegenschaft = Stockwerkeigentum");
    const lohn = m.annex.groups[2].table.rows.find((r) => r[2].text.includes("Lohnausweis"))!;
    expect(lohn[2].text.split("\n")).toHaveLength(3);
    const e = m.annex.groups[4].table.rows.map((r) => r[2].text);
    expect(e).toEqual([
      "Überzählig – viertes Jahr – mitgeführt",
      "Duplikat – nicht doppelt gespeichert",
      "Nicht benötigt – Steuerrechnung – nicht abgelegt",
      "Nicht benötigt – Nebenkostenabrechnung – mitgeführt",
    ]);
    expect(m.annex.completeness.value).toBe("23 von 23 Anforderungen erfüllt");
    expect(m.annex.completeness.note).toMatch(/^4 Hinweis\(e\): Aktueller Grundbuchauszug/);
    expect(m.annex.intro).toContain("26 Dateien erkannt");
  });

  it("draft: «Entwurf» instead of a case number", () => {
    const d = buildDossierModel(input({ draft: true, caseNumber: null }));
    expect(d.header.right).toBe("Fall-Dossier · Entwurf · Gerber, Wädenswil");
    expect(d.cover.draft).toBe("Entwurf");
    expect(d.sections[4].table!.rows[0][1].text).toBe("Entwurf aus dem Funnel – noch nicht abgeschlossen");
  });

  it("funnel language (D11): French", () => {
    const fr = buildDossierModel(input({ lang: "fr" }));
    expect(fr.sections[0].title).toBe("01 · Demande");
    expect(fr.annex.groups[0].table.rows[0][1].text).not.toBe(m.annex.groups[0].table.rows[0][1].text);
    expect(fr.annex.completeness.label).toBe("Exhaustivité");
    expect(fr.footer.left).toBe("Confidentiel · pour les prêteurs");
  });

  it("missing documents show «Fehlt» as a warning", () => {
    const files = toDossierFiles(gerberFiles().filter((f) => f.instanceId !== "fotos"));
    const mm = buildDossierModel(input({ files }));
    expect(mm.annex.groups[0].table.rows[0][1].sub).toBe("Pflicht · Fehlt");
    expect(mm.annex.groups[0].table.rows[0][2].text).toBe("–");
    expect(mm.annex.completeness.value).toBe("22 von 23 Anforderungen erfüllt");
  });
});

describe("Fall-Dossier annex E — the reason in the dossier language (D11)", () => {
  // placeFile.ts stores its reason as a German sentence (REASON_DE); the dossier must not print it abroad.
  const DUP_DE = "Identischer Inhalt wie eine andere Datei – wird nicht doppelt gespeichert.";
  const withReason = (files: DossierFile[]) =>
    files.map((f) => (f.analysis?.extraKind === "duplicate" ? { ...f, analysis: { ...f.analysis!, extraReason: DUP_DE } } : f));
  const annexE = (m: ReturnType<typeof buildDossierModel>) => m.annex.groups.find((g) => g.title.startsWith("E"))!.table.rows.map((r) => r[2].text);

  it("English dossier: translated from the reason, the duplicate names its twin; no German sentence", () => {
    const m = buildDossierModel(input({ lang: "en", files: withReason(toDossierFiles(gerberFiles())) }));
    const e = annexE(m);
    expect(JSON.stringify(m.annex)).not.toContain("Identischer Inhalt");
    expect(e).toContain("Duplicate – Same content as 01_Leasingvertrag_Cembra_Gary_Gerber.pdf – not stored twice. – not stored twice");
    // Free German catalogue text («Steuerrechnung», «viertes Jahr») is not printed abroad either.
    expect(e.join("\n")).not.toMatch(/Steuerrechnung|Nebenkostenabrechnung|viertes Jahr/);
    expect(e).toContain("Not needed – Not required for the financing review. – not stored");
    expect(e[0]).toBe("Surplus – included");
  });

  it("German dossier: the sentence as stored", () => {
    const m = buildDossierModel(input({ files: withReason(toDossierFiles(gerberFiles())) }));
    expect(annexE(m)).toContain(`Duplikat – ${DUP_DE} – nicht doppelt gespeichert`);
  });

  it("French and Italian: no German either", () => {
    for (const lang of ["fr", "it"] as const) {
      const m = buildDossierModel(input({ lang, files: withReason(toDossierFiles(gerberFiles())) }));
      expect(JSON.stringify(annexE(m))).not.toMatch(/Identischer Inhalt|Steuerrechnung|viertes Jahr/);
    }
  });
});

describe("Fall-Dossier PDF", () => {
  it("renders the Gerber case to a valid multi-page PDF", async () => {
    const bytes = await createDossierPdf(input());
    expect(bytes.length).toBeGreaterThan(5000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(doc.getTitle()).toBe("Fall-Dossier HQ-26-06-156283");
  });

  it("survives characters outside the PDF font, empty answers and every language", async () => {
    const base = gerberState();
    for (const lang of ["de", "en", "fr", "it"] as const) {
      const bytes = await createDossierPdf(
        input({
          lang,
          draft: true,
          caseNumber: null,
          state: { ...base, txt: { ...base.txt, kommentar: "Bitte → rasch ✓ 😀 Ωmega" } },
          files: [{ id: "x", name: "Ünïcödé_→_file_😀_" + "x".repeat(150) + ".pdf", instanceId: null, analysis: null }],
        })
      );
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    }
    const empty = await createDossierPdf(input({ state: { ...base, ans: { ...base.ans, antrag: undefined }, txt: { ...base.txt, vor: "", nach: "", plz: "", ort: "" }, fin: { old: 0, up: 0, kaufpreis: 0, inc: 0, val: 0 } }, files: [] }));
    expect(empty.length).toBeGreaterThan(2000);
  });

  it("file name of the stored dossier", () => {
    expect(dossierFileName("HQ-26-06-156283")).toBe("HQ-26-06-156283_00_Fall-Dossier.pdf");
  });
});
