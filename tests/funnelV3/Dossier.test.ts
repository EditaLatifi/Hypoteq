import { describe, it, expect } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { attachmentDisposition, buildDossierModel, createDossierPdf, dossierDownloadName, dossierFileName, dossierPersonName, type DossierFile } from "@/lib/funnel-v3/dossier";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { EMPTY_AMOUNTS } from "@/lib/funnel-v3/types";
import { mustermannFiles, mustermannState } from "./mustermannCase";

const toDossierFiles = (files: FileEntry[]): DossierFile[] =>
  files.map((f) => ({
    id: f.id,
    name: f.name,
    originalName: f.name,
    instanceId: f.instanceId ?? null,
    extraKind: f.analysis?.extraKind,
    keep: f.keep,
    outdatedOverride: f.outdatedOverride,
    // Handover 4.3 «Nichts wird gelöscht»: the closing keeps every file (completion.ts planFiles).
    analysis: f.analysis,
  }));

const input = (over: Partial<Parameters<typeof buildDossierModel>[0]> = {}) => ({
  lang: "de" as const,
  draft: false,
  caseNumber: "HQ-26-01-000001",
  date: new Date("2026-06-02T10:00:00Z"),
  state: mustermannState(),
  files: toDossierFiles(mustermannFiles()),
  ...over,
});

describe("Fall-Dossier model — Mustermann", () => {
  const m = buildDossierModel(input());

  it("header, footer and Deckblatt", () => {
    expect(m.header.right).toBe("Fall-Dossier · HQ-26-01-000001 · Mustermann, Zürich");
    expect(m.footer.left).toBe("Vertraulich · für Kreditgeber");
    expect(m.cover.eyebrow).toBe("Finanzierungsanfrage · Ablösung und Erhöhung");
    expect(m.cover.title).toEqual(["Max Mustermann", "8000 Zürich"]);
    expect(m.cover.description).toBe("Stockwerkeigentum, Selbstbewohnt. Ablösung der bestehenden Hypothek der Musterbank von CHF 380'000 und Erhöhung um CHF 170'000.");
    expect(m.cover.kpis.map((k) => k.value)).toEqual(["CHF 550'000", "44.4 %", "36.3 %"]);
    expect(m.cover.right).toBe("HQ-26-01-000001 · 02.06.2026");
    expect(m.cover.left).toBe("Eigene Anfrage");
  });

  it("sections 01–04 in prototype order, no «Verlauf» (HYPOTEQ 23.10.2026)", () => {
    expect(m.sections.map((s) => s.title)).toEqual(["01 · Antrag", "02 · Objekt", "03 · Kreditnehmer", "04 · Finanzierung und Tragbarkeit"]);
    const antrag = Object.fromEntries([...m.sections[0].columns![0], ...m.sections[0].columns![1]].map((kv) => [kv.label, kv.value]));
    expect(antrag).toMatchObject({ "Bestehende Bank": "Musterbank", "Bestehende Hypothek": "CHF 380'000", "Gewünschte Erhöhung": "CHF 170'000", Gesamtfinanzierung: "CHF 550'000", "Gewünschte Laufzeit": "3 Jahre" });
    expect(m.sections[0].callouts![0].label).toBe("Verwendungszweck der Erhöhung");
    const costs = m.sections[3].table!.rows.map((r) => r.map((c) => c.text));
    expect(costs[0]).toEqual(["Zins 5 % auf CHF 550'000", "CHF 27'500"]);
    expect(costs[3]).toEqual(["Total Belastung", "CHF 39'900"]);
    expect(m.sections[3].notes).toContain("Unterhaltszahlungen sind in der Tragbarkeit nicht enthalten; die Unterhaltsvereinbarung liegt im Annex.");
    expect(m.sections[3].callouts!.map((c) => c.label)).toHaveLength(4);
  });

  it("annex A–E with stored names and origins, opened by one plain sentence, no Vollständigkeit box", () => {
    expect(m.annex.groups.map((g) => g.title)).toEqual([
      "A · Zum Objekt",
      "B · Bestehende Hypothek",
      "C · Zur Person · Max Mustermann",
      "D · Eigenmittel und Vorsorge",
      "E · Weitere Dateien · nicht gewertet",
    ]);
    const a = m.annex.groups[0].table.rows;
    expect(a[3][0].text).toBe("A4");
    expect(a[3][1].sub).toBe("Pflicht · Veraltet · 15.01.2026 · trotzdem verwendet");
    expect(a[3][1].warn).toBe(true);
    expect(a[5][1].sub).toBe("weil: Liegenschaft = Stockwerkeigentum");
    // v5 P2: the current Lohnausweis; the older ones are «Weitere Dateien» (no bonus).
    const lohn = m.annex.groups[2].table.rows.find((r) => r[2].text.includes("Lohnausweis"))!;
    expect(lohn[2].text.split("\n")).toEqual(["01_Lohnausweis_Max_Mustermann_2025.pdf"]);
    const e = m.annex.groups[4].table.rows.map((r) => r[2].text);
    expect(e).toEqual([
      // Handover 4.2: older Lohnausweise without a bonus; what v5 no longer asks for.
      "Überzählig – Älterer Lohnausweis – nur bei variablem Lohnanteil nötig. Wird im Dossier mitgeführt. – mitgeführt",
      "Überzählig – Älterer Lohnausweis – nur bei variablem Lohnanteil nötig. Wird im Dossier mitgeführt. – mitgeführt",
      "Nicht benötigt – Nur nötig bei einer Lohnerhöhung im laufenden Jahr – keine erkannt. – mitgeführt",
      "Nicht benötigt – Eigenmittelnachweis ist nur bei einem Kauf nötig. – mitgeführt",
      "Nicht benötigt – Schuldbrief / Sicherungsvereinbarung wird nicht benötigt. – mitgeführt",
      "Überzählig – viertes Jahr – mitgeführt",
      "Duplikat – mitgeführt",
      "Nicht benötigt – Steuerrechnung – mitgeführt",
      "Nicht benötigt – Nebenkostenabrechnung – mitgeführt",
    ]);
    // Every document the case carries, the further files included (Kap. 9.5).
    expect(m.annex.intro).toBe("Folgende 30 Dokumente stehen zum Hypothekarfall zur Verfügung.");
    expect(m.annex).not.toHaveProperty("completeness");
  });

  it("before the closing: no «Entwurf» anywhere, the date without a case number (HYPOTEQ 23.10.2026)", () => {
    const d = buildDossierModel(input({ draft: true, caseNumber: null }));
    expect(d.header.right).toBe("Fall-Dossier · Mustermann, Zürich");
    expect(d.cover.right).toBe("02.06.2026");
    expect(d.documentTitle).toBe("Fall-Dossier");
    expect(JSON.stringify({ header: d.header, footer: d.footer, cover: d.cover, sections: d.sections, annex: d.annex })).not.toMatch(/Entwurf/);
  });

  it("footer: «HYPOTEQ» instead of hypoteq.ch", () => {
    expect(m.footer).toEqual({ left: "Vertraulich · für Kreditgeber", right: "HYPOTEQ", page: "Seite {n} von {total}" });
  });

  it("funnel language (D11): French", () => {
    const fr = buildDossierModel(input({ lang: "fr" }));
    expect(fr.sections[0].title).toBe("01 · Demande");
    expect(fr.annex.groups[0].table.rows[0][1].text).not.toBe(m.annex.groups[0].table.rows[0][1].text);
    expect(fr.annex.intro).toBe("Les 30 documents suivants sont disponibles pour ce dossier hypothécaire.");
    expect(fr.footer.left).toBe("Confidentiel · pour les prêteurs");
  });

  it("missing documents show «Fehlt» as a warning", () => {
    const files = toDossierFiles(mustermannFiles().filter((f) => f.instanceId !== "fotos"));
    const mm = buildDossierModel(input({ files }));
    expect(mm.annex.groups[0].table.rows[0][1].sub).toBe("Pflicht · Fehlt");
    expect(mm.annex.groups[0].table.rows[0][2].text).toBe("–");
    expect(mm.annex.intro).toBe(`Folgende ${files.length} Dokumente stehen zum Hypothekarfall zur Verfügung.`);
  });
});

describe("Fall-Dossier annex E — the reason in the dossier language (D11)", () => {
  // placeFile.ts stores its reason as a German sentence (REASON_DE); the dossier must not print it abroad.
  const DUP_DE = "Identischer Inhalt wie eine andere Datei – wird als Duplikat abgelegt.";
  const withReason = (files: DossierFile[]) =>
    files.map((f) => (f.analysis?.extraKind === "duplicate" ? { ...f, analysis: { ...f.analysis!, extraReason: DUP_DE } } : f));
  const annexE = (m: ReturnType<typeof buildDossierModel>) => m.annex.groups.find((g) => g.title.startsWith("E"))!.table.rows.map((r) => r[2].text);

  it("English dossier: translated from the reason, the duplicate names its twin; no German sentence", () => {
    const m = buildDossierModel(input({ lang: "en", files: withReason(toDossierFiles(mustermannFiles())) }));
    const e = annexE(m);
    expect(JSON.stringify(m.annex)).not.toContain("Identischer Inhalt");
    expect(e).toContain("Duplicate – Same content as 01_Leasingvertrag_MusterLeasing_Max_Mustermann.pdf – filed as a duplicate. – included");
    // Free German catalogue text («Steuerrechnung», «viertes Jahr») is not printed abroad either.
    expect(e.join("\n")).not.toMatch(/Steuerrechnung|Nebenkostenabrechnung|viertes Jahr/);
    expect(e).toContain("Not needed – Not required for the financing review. – included");
    expect(e[0]).toBe("Surplus – Older salary certificate – only needed with variable pay. Kept in the dossier. – included");
    expect(e).toContain("Not needed – Proof of equity is only needed for a purchase. – included");
    expect(e[5]).toBe("Surplus – included");
  });

  it("German dossier: the sentence as stored", () => {
    const m = buildDossierModel(input({ files: withReason(toDossierFiles(mustermannFiles())) }));
    expect(annexE(m)).toContain(`Duplikat – ${DUP_DE} – mitgeführt`);
  });

  it("a file deleted before v5 (row flagged removed) still says it was not stored", () => {
    const files = toDossierFiles(mustermannFiles()).map((f) => (f.extraKind === "duplicate" ? { ...f, removed: true } : f));
    const m = buildDossierModel(input({ files }));
    expect(annexE(m)).toContain("Duplikat – nicht doppelt gespeichert");
  });

  it("French and Italian: no German either", () => {
    for (const lang of ["fr", "it"] as const) {
      const m = buildDossierModel(input({ lang, files: withReason(toDossierFiles(mustermannFiles())) }));
      expect(JSON.stringify(annexE(m))).not.toMatch(/Identischer Inhalt|Steuerrechnung|viertes Jahr/);
    }
  });
});

describe("Fall-Dossier PDF", () => {
  it("renders the Mustermann case to a valid multi-page PDF", async () => {
    const bytes = await createDossierPdf(input());
    expect(bytes.length).toBeGreaterThan(5000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(doc.getTitle()).toBe("Fall-Dossier HQ-26-01-000001");
  });

  it("survives characters outside the PDF font, empty answers and every language", async () => {
    const base = mustermannState();
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
    const empty = await createDossierPdf(input({ state: { ...base, ans: { ...base.ans, antrag: undefined }, txt: { ...base.txt, vor: "", nach: "", plz: "", ort: "" }, fin: { ...EMPTY_AMOUNTS } }, files: [] }));
    expect(empty.length).toBeGreaterThan(2000);
  });

  it("file name of the stored dossier", () => {
    expect(dossierFileName("HQ-26-01-000001")).toBe("HQ-26-01-000001_00_Fall-Dossier.pdf");
  });

  it("name of the download: «HYPOTEQ Fall-Dossier – Vorname Nachname.pdf» (Kap. 9.1)", () => {
    expect(dossierDownloadName(dossierPersonName(mustermannState()))).toBe("HYPOTEQ Fall-Dossier – Max Mustermann.pdf");
    const company = { ans: { kn: "Juristische Person" }, txt: { vor: "Max", nach: "Muster", firma: "Immo: Beispiel/AG" } };
    expect(dossierDownloadName(dossierPersonName(company))).toBe("HYPOTEQ Fall-Dossier – Immo BeispielAG.pdf");
    expect(dossierDownloadName(dossierPersonName({ txt: { vor: "", nach: "" }, borrowers: [{ vor: "Lea", nach: "Müller" }] }))).toBe("HYPOTEQ Fall-Dossier – Lea Müller.pdf");
    expect(dossierDownloadName("  ")).toBe("HYPOTEQ Fall-Dossier.pdf");
    expect(attachmentDisposition("HYPOTEQ Fall-Dossier – Lea Müller.pdf")).toBe(
      `attachment; filename="HYPOTEQ Fall-Dossier - Lea Muller.pdf"; filename*=UTF-8''HYPOTEQ%20Fall-Dossier%20%E2%80%93%20Lea%20M%C3%BCller.pdf`
    );
  });
});
