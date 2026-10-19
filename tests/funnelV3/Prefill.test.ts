/**
 * Handover 3, 3.1: what the documents fill in (lib/funnel-v3/prefill.ts) — values, «aus
 * Dokument» marks (unsure below 90 %, DECISIONS V7), the facts for mail and Salesforce, and
 * «nothing is guessed». Applied by the store only in the Schnellanmeldung.
 */
import { describe, it, expect } from "@jest/globals";
import { PREFILL_CONFIDENCE, analysedFiles, correctionValues, prefillFromDocuments, prefilledCount, prefilledValue, sourceLabelDe } from "@/lib/funnel-v3/prefill";
import type { AnalysedFile } from "@/lib/funnel-v3/facts";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { DEFAULT_ANSWERS, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import { createFunnelV3Store } from "@/lib/funnel-v3/store";
import { reqList } from "@/lib/funnel-v3/requirements";

const NOW = new Date(2026, 9, 15);
let n = 0;
const file = (docTypeId: string, fields: Record<string, string | [string, number]>, over: Partial<V3Analysis> = {}): AnalysedFile => ({
  fileId: `f${++n}`,
  analysis: {
    status: "done",
    docTypeId,
    docTypeLabel: docTypeId,
    confidence: 0.96,
    requirementId: docTypeId,
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? { value: v[0], confidence: v[1] } : { value: v, confidence: 0.95 }])),
    ...over,
  },
});

/** The Mustermann folder as the analysis reads it (Handover README; prototype AUTO). */
const mustermann = (): AnalysedFile[] => [
  file("id", { Name: "MUSTERMANN", Vornamen: "MAX SIMON", Geschlecht: "M", Geburtsdatum: "05.03.1985", Nationalität: "Schweiz" }, { personName: "Mustermann Max Simon", docDate: null }),
  file("grundbuch", { PLZ: "8000", Ort: "Zürich", Adresse: "Musterweg 1", Baurecht: "nein", Wertquote: "60/1000", Grundpfandrechte: "Register-Schuldbrief CHF 420'000, Musterbank" }, { docDate: "2026-01-15" }),
  file("stwe_regl", {}),
  file("ef", { "Saldo per 31.12.2025": "CHF 48'210 per 31.12.2025" }),
  file("hyp_zins", { Kapital: "CHF 380'000", Zinssatz: "SARON + 0.80 %", Laufzeit: "unbefristet", Ablösedatum: "31.03.2028" }, { bank: "Musterbank", docDate: "2026-03-30" }),
  file("lohnausweise", { Jahr: "2025", Bruttolohn: "CHF 110'310", Arbeitgeber: "Muster Treuhand AG" }, { personName: "Mustermann Max", docDate: "2025" }),
  file("lohnausweise", { Jahr: "2024", Bruttolohn: "CHF 105'200", Arbeitgeber: "Muster Treuhand AG" }, { personName: "Mustermann Max", docDate: "2024" }),
  file("lohnabrechnungen", { "Monatslohn brutto": "CHF 8'460", "13. Monatslohn": "ja" }, { personName: "Mustermann Max", docDate: "2026-05" }),
  file("steuer", { Zivilstand: "ledig", Kinder: "2 (Nina, Tim)", Eigenmietwert: "CHF 18'600" }, { personName: "Mustermann Max", docDate: "2025" }),
  file("verkaufsdoku", { Verkaufspreis: "CHF 1'240'000", Baujahr: "1964", Heizung: "nicht eindeutig – Holzofen erwähnt" }, { docDate: "2024-01-26" }),
  file("gvz", { Erstellungsjahr: "1964", Volumen: "1'320 m³", Versicherungssumme: "CHF 1'210'000" }),
  file("unterhalt", { Unterhaltsbeitrag: "CHF 1'200 pro Monat" }),
  file("kredit", { Kreditgeber: "Muster Kredit", Restschuld: "CHF 21'480", Monatsrate: "CHF 610" }),
  file("leasing", { Leasinggeber: "Muster Leasing", Leasingrate: "CHF 455", Restlaufzeit: "20 Monate" }),
  file("police", { Rückkaufswert: ["CHF 8'760 per 09.01.2026", 0.8], "Begünstigte Bank": "Musterbank" }, { docDate: "2026-01-09" }),
  file("pk", { Altersguthaben: "CHF 72'300", "Vorbezug für Wohneigentum möglich": "ja" }, { personName: "Mustermann Max" }),
];

const empty = (): Pick<FunnelState, "ans" | "txt" | "borrowers" | "touched"> => ({
  ans: { ...DEFAULT_ANSWERS },
  txt: { ...EMPTY_TEXTS },
  borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }],
  touched: {},
});

describe("prefillFromDocuments — Fall Mustermann (Handover 3.1)", () => {
  const r = prefillFromDocuments(mustermann(), empty(), { now: NOW });

  it("fills the funnel fields each document provides", () => {
    expect(r.values).toEqual({
      // ID
      "txt.vor": "Max Simon",
      "txt.nach": "Mustermann",
      "ans.anrede": "Herr",
      "ans.kn": "Natürliche Person",
      // Grundbuchauszug
      "txt.plz": "8000",
      "txt.ort": "Zürich",
      "ans.immo": "Bestehende Immobilie",
      "ans.baurecht": "Nein",
      // STWE-Reglement / Erneuerungsfonds
      "ans.lieg": "Stockwerkeigentum",
      // Zinsabrechnung
      "ans.antrag": "Ablösung",
      "fin.old": 380000,
      // Lohnausweis (the newest)
      "borrower.0.job": "Angestellt",
      "fin.inc": 110310,
      // Steuererklärung (unsure, via the Eigenmietwert)
      "ans.nutz": "Selbstbewohnt",
      // Verkaufsdokumentation (unsure)
      "fin.val": 1240000,
      // the chips
      "ans.unterhalt": "Ja",
      "ans.kredite": "Ja",
      "ans.leasing": "Ja",
      // 3a-Police: the Rückkaufswert
      "em.s3a": 8760,
    });
  });

  it("marks each with its document, unsure where the handover says so or below 90 %", () => {
    expect(PREFILL_CONFIDENCE).toBe(0.9);
    expect(r.src["fin.old"]).toMatchObject({ doc: "Zinsabrechnung", unsure: false, docType: "hyp_zins" });
    expect(r.src["fin.inc"]).toMatchObject({ doc: "Lohnausweis 2025", unsure: false });
    expect(r.src["txt.vor"]).toMatchObject({ doc: "ID", unsure: false });
    expect(r.src["ans.nutz"]).toMatchObject({ doc: "Steuererklärung 2025", unsure: true });
    expect(r.src["fin.val"]).toMatchObject({ doc: "Verkaufsdokumentation 2024", unsure: true });
    expect(r.src["em.s3a"]).toMatchObject({ doc: "3a-Police", unsure: true });
    expect(r.src["ans.kredite"]).toMatchObject({ doc: "Kreditvertrag Muster Kredit" });
    expect(r.src["ans.leasing"]).toMatchObject({ doc: "Leasingvertrag Muster Leasing" });
    expect(Object.keys(r.src).sort()).toEqual(Object.keys(r.values).sort());
    expect(prefilledCount(r.src)).toBe(19);
  });

  it("collects what the documents say beyond the questions (mail, Salesforce)", () => {
    expect(r.info).toEqual({
      geb: "05.03.1985",
      nat: "Schweiz",
      adresse: "Musterweg 1, 8000 Zürich",
      wertquote: "60/1000",
      grundpfand: "Register-Schuldbrief CHF 420'000, Musterbank",
      efSaldo: "CHF 48'210 per 31.12.2025",
      bank: "Musterbank",
      zins: "SARON + 0.80 %",
      laufzeit: "unbefristet",
      abl: "31.03.2028",
      ag: "Muster Treuhand AG",
      zivil: "ledig",
      kinder: "2 (Nina, Tim)",
      baujahr: "1964",
      kubatur: "1'320 m³",
      versSumme: "CHF 1'210'000",
      heizung: "nicht eindeutig – Holzofen erwähnt",
      unterhaltBetrag: "CHF 1'200 pro Monat",
      kreditRest: "CHF 21'480",
      kreditRate: "CHF 610",
      leasingRate: "CHF 455",
      leasingRest: "20 Monate",
      s3aPledge: "Musterbank",
      pk: "CHF 72'300",
      pkVorbezug: "ja",
      // Handover 4.2 (Mustermann: +0.3 %)
      bonus: false,
      raise: false,
      ab50: false,
    });
    expect(r.facts.salary).toMatchObject({ annual: 110310, monthly: 8460, thirteenth: true });
  });
});

describe("prefill rules (Handover 3)", () => {
  it("a missing document leaves its question empty", () => {
    const r = prefillFromDocuments([file("kredit", { Kreditgeber: "Muster Kredit" })], empty(), { now: NOW });
    expect(r.values).toEqual({ "ans.kredite": "Ja" });
  });

  it("two documents that disagree leave the field empty — nothing is guessed", () => {
    const r = prefillFromDocuments([file("hyp_zins", { Kapital: "380'000" }), file("kaufvertrag", { Kaufpreis: "CHF 900'000", Eigentumsübertragung: "1.4.2027" })], empty(), { now: NOW });
    expect(r.values["ans.antrag"]).toBeUndefined();
    expect(r.values).toMatchObject({ "fin.old": 380000, "fin.kaufpreis": 900000, "txt.kaufdatum": "01.04.2027" });
    // STWE-Reglement and Erneuerungsfonds agree.
    expect(prefillFromDocuments([file("stwe_regl", {}), file("ef", {})], empty(), { now: NOW }).values["ans.lieg"]).toBe("Stockwerkeigentum");
  });

  it("never prefills a touched field", () => {
    const s = { ...empty(), touched: { "fin.old": true as const, "ans.kredite": true as const } };
    const r = prefillFromDocuments(mustermann(), s, { now: NOW });
    expect(r.values["fin.old"]).toBeUndefined();
    expect(r.src["fin.old"]).toBeUndefined();
    expect(r.values["ans.kredite"]).toBeUndefined();
    expect(r.values["ans.antrag"]).toBe("Ablösung");
  });

  it("a field read with low confidence is «aus Dokument · bitte prüfen»", () => {
    const r = prefillFromDocuments([file("hyp_zins", { Kapital: ["CHF 380'000", 0.62] })], empty(), { now: NOW });
    expect(r.src["fin.old"]).toMatchObject({ unsure: true });
    expect(r.src["ans.antrag"]).toMatchObject({ unsure: false });
  });

  it("two people on IDs and no name yet: no name is guessed", () => {
    const r = prefillFromDocuments(
      [file("id", { Name: "Mustermann", Vornamen: "Max" }, { personName: "Mustermann Max" }), file("id", { Name: "Mustermann", Vornamen: "Lea" }, { personName: "Mustermann Lea" })],
      empty(),
      { now: NOW }
    );
    expect(r.values["txt.vor"]).toBeUndefined();
    expect(r.values["txt.nach"]).toBeUndefined();
  });

  it("with Kreditnehmer 1 known, the documents are told apart by the name; Kreditnehmer 2's income too", () => {
    const s = { ...empty(), txt: { ...EMPTY_TEXTS, vor: "Max", nach: "Mustermann" }, borrowers: [{ id: "b1", vor: "Max", nach: "Mustermann", pkSe: "Nein" as const }, { id: "b2", vor: "Lea", nach: "Mustermann", pkSe: "Nein" as const }] };
    const r = prefillFromDocuments(
      [
        file("lohnausweise", { Jahr: "2025", Bruttolohn: "110'310" }, { personName: "Mustermann Max", docDate: "2025" }),
        file("lohnausweise", { Jahr: "2025", Bruttolohn: "70'000" }, { personName: "Mustermann Lea", docDate: "2025" }),
      ],
      s,
      { now: NOW }
    );
    expect(r.values).toMatchObject({ "fin.inc": 110310, "fin.inc2": 70000 });
  });

  it("a Handelsregisterauszug: Firma and zeichnungsberechtigte Person (to be checked); the ID is the signatory's then", () => {
    const r = prefillFromDocuments(
      [file("hr", { Firma: "Muster Treuhand AG", Zeichnungsberechtigte: "Max Mustermann (Einzelunterschrift), Lea Mustermann", UID: "CHE-123.456.789", Sitz: "Zürich" }), file("id", { Name: "Mustermann", Vornamen: "Max" }, { personName: "Mustermann Max" })],
      empty(),
      { now: NOW }
    );
    expect(r.values).toMatchObject({ "ans.kn": "Juristische Person", "txt.firma": "Muster Treuhand AG", "txt.zeichner": "Max Mustermann" });
    expect(r.values["txt.vor"]).toBeUndefined();
    expect(r.src["ans.kn"]!.unsure).toBe(true);
    expect(r.src["txt.zeichner"]!.unsure).toBe(true);
    expect(r.info).toMatchObject({ uid: "CHE-123.456.789", sitz: "Zürich" });
  });

  it("Säule 3a from the certificate's Guthaben when no policy value was read; analyses stored before v5 still count", () => {
    expect(prefillFromDocuments([file("s3a", { Guthaben: "CHF 31'200 per 31.12.2025" })], empty(), { now: NOW }).values["em.s3a"]).toBe(31200);
    expect(prefillFromDocuments([file("police", { "Rückkaufswert per 09.01.2026": "CHF 8'760" })], empty(), { now: NOW }).values["em.s3a"]).toBe(8760);
    expect(correctionValues(mustermann())).toEqual({ s3a: 8760 });
    expect(correctionValues([])).toEqual({});
  });

  it("only analysed files with a type take part", () => {
    const entries = [
      { id: "a", name: "a.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis: mustermann()[0].analysis },
      { id: "b", name: "b.pdf", size: 1, uploadState: "uploaded", analysisState: "analysing" },
      { id: "c", name: "c.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis: { ...mustermann()[0].analysis, docTypeId: null } },
    ] as FileEntry[];
    expect(analysedFiles(entries).map((f) => f.fileId)).toEqual(["a"]);
    expect(sourceLabelDe(mustermann()[5].analysis)).toBe("Lohnausweis 2025");
  });
});

describe("in the store (Handover 3: Schnellanmeldung only)", () => {
  it("fills the Schnellanmeldung, leaves the Begleitete untouched but takes the facts; the list grows by 4.2", () => {
    const fast = createFunnelV3Store({ mode: "schnell" });
    const s = fast.getState();
    s.applyDocuments(prefillFromDocuments(mustermann(), s, { now: NOW }));
    const after = fast.getState();
    expect(after.ans).toMatchObject({ antrag: "Ablösung", lieg: "Stockwerkeigentum", kredite: "Ja", anrede: "Herr" });
    expect(after.txt).toMatchObject({ vor: "Max Simon", nach: "Mustermann", plz: "8000" });
    expect(after.borrowers[0]).toMatchObject({ vor: "Max Simon", job: "Angestellt" });
    expect(after.em.s3a).toBe(8760);
    expect(prefilledValue(after, "em.s3a")).toBe(8760);
    expect(prefilledValue(after, "borrower.0.job")).toBe("Angestellt");
    expect(Object.keys(after.src)).toHaveLength(19);

    const guided = createFunnelV3Store({});
    const g = guided.getState();
    g.applyDocuments(prefillFromDocuments(mustermann(), g, { now: NOW }));
    expect(guided.getState().ans).toEqual(DEFAULT_ANSWERS);
    expect(guided.getState().info.bank).toBe("Musterbank");

    // A bonus recognised in the documents puts P5 on the list, in either mode.
    const bonus = createFunnelV3Store({});
    const b = bonus.getState();
    const files = [file("lohnausweise", { Jahr: "2025", Bruttolohn: "140'000" }, { personName: "Mustermann Max", docDate: "2025" }), file("lohnabrechnungen", { "Monatslohn brutto": "8'460", "13. Monatslohn": "ja" }, { personName: "Mustermann Max", docDate: "2026-05" })];
    b.applyDocuments(prefillFromDocuments(files, b, { now: NOW }));
    expect(bonus.getState().info.bonus).toBe(true);
    expect(reqList(bonus.getState()).map((x) => x.id)).toContain("lohnausweise_alt");
  });
});
