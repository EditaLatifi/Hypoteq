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

/** The Gerber folder as the analysis reads it (Handover README; prototype AUTO). */
const gerber = (): AnalysedFile[] => [
  file("id", { Name: "GERBER", Vornamen: "GARY SAMUEL", Geschlecht: "M", Geburtsdatum: "04.01.1988", Nationalität: "Schweiz" }, { personName: "Gerber Gary Samuel", docDate: null }),
  file("grundbuch", { PLZ: "8820", Ort: "Wädenswil", Adresse: "Etzelstrasse 52", Baurecht: "nein", Wertquote: "45/1000", Grundpfandrechte: "Register-Schuldbrief CHF 500'000, ZKB" }, { docDate: "2026-01-15" }),
  file("stwe_regl", {}),
  file("ef", { "Saldo per 31.12.2025": "CHF 48'210 per 31.12.2025" }),
  file("hyp_zins", { Kapital: "CHF 449'000", Zinssatz: "SARON + 0.65 %", Laufzeit: "unbefristet", Ablösedatum: "30.01.2028" }, { bank: "Zuger Kantonalbank", docDate: "2026-03-30" }),
  file("lohnausweise", { Jahr: "2025", Bruttolohn: "CHF 125'385", Arbeitgeber: "Etzel Liegenschaften AG" }, { personName: "Gerber Gary", docDate: "2025" }),
  file("lohnausweise", { Jahr: "2024", Bruttolohn: "CHF 118'900", Arbeitgeber: "Etzel Liegenschaften AG" }, { personName: "Gerber Gary", docDate: "2024" }),
  file("lohnabrechnungen", { "Monatslohn brutto": "CHF 9'615", "13. Monatslohn": "ja" }, { personName: "Gerber Gary", docDate: "2026-05" }),
  file("steuer", { Zivilstand: "ledig", Kinder: "2 (Elias, Thalia)", Eigenmietwert: "CHF 21'400" }, { personName: "Gerber Gary", docDate: "2025" }),
  file("verkaufsdoku", { Verkaufspreis: "CHF 1'450'000", Baujahr: "1921", Heizung: "nicht eindeutig – Holzofen erwähnt" }, { docDate: "2024-01-26" }),
  file("gvz", { Erstellungsjahr: "1921", Volumen: "1'497 m³", Versicherungssumme: "CHF 1'210'000" }),
  file("unterhalt", { Unterhaltsbeitrag: "CHF 1'400 pro Monat" }),
  file("kredit", { Kreditgeber: "BANK-now", Restschuld: "CHF 24'360", Monatsrate: "CHF 690" }),
  file("leasing", { Leasinggeber: "Cembra", Leasingrate: "CHF 412", Restlaufzeit: "18 Monate" }),
  file("police", { Rückkaufswert: ["CHF 10'340 per 09.01.2026", 0.8], "Begünstigte Bank": "ZKB" }, { docDate: "2026-01-09" }),
  file("pk", { Altersguthaben: "CHF 86'500", "Vorbezug für Wohneigentum möglich": "ja" }, { personName: "Gerber Gary" }),
];

const empty = (): Pick<FunnelState, "ans" | "txt" | "borrowers" | "touched"> => ({
  ans: { ...DEFAULT_ANSWERS },
  txt: { ...EMPTY_TEXTS },
  borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }],
  touched: {},
});

describe("prefillFromDocuments — Fall Gerber (Handover 3.1)", () => {
  const r = prefillFromDocuments(gerber(), empty(), { now: NOW });

  it("fills the funnel fields each document provides", () => {
    expect(r.values).toEqual({
      // ID
      "txt.vor": "Gary Samuel",
      "txt.nach": "Gerber",
      "ans.anrede": "Herr",
      "ans.kn": "Natürliche Person",
      // Grundbuchauszug
      "txt.plz": "8820",
      "txt.ort": "Wädenswil",
      "ans.immo": "Bestehende Immobilie",
      "ans.baurecht": "Nein",
      // STWE-Reglement / Erneuerungsfonds
      "ans.lieg": "Stockwerkeigentum",
      // Zinsabrechnung
      "ans.antrag": "Ablösung",
      "fin.old": 449000,
      // Lohnausweis (the newest)
      "borrower.0.job": "Angestellt",
      "fin.inc": 125385,
      // Steuererklärung (unsure, via the Eigenmietwert)
      "ans.nutz": "Selbstbewohnt",
      // Verkaufsdokumentation (unsure)
      "fin.val": 1450000,
      // the chips
      "ans.unterhalt": "Ja",
      "ans.kredite": "Ja",
      "ans.leasing": "Ja",
      // 3a-Police: the Rückkaufswert
      "em.s3a": 10340,
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
    expect(r.src["ans.kredite"]).toMatchObject({ doc: "Kreditvertrag BANK-now" });
    expect(r.src["ans.leasing"]).toMatchObject({ doc: "Leasingvertrag Cembra" });
    expect(Object.keys(r.src).sort()).toEqual(Object.keys(r.values).sort());
    expect(prefilledCount(r.src)).toBe(19);
  });

  it("collects what the documents say beyond the questions (mail, Salesforce)", () => {
    expect(r.info).toEqual({
      geb: "04.01.1988",
      nat: "Schweiz",
      adresse: "Etzelstrasse 52, 8820 Wädenswil",
      wertquote: "45/1000",
      grundpfand: "Register-Schuldbrief CHF 500'000, ZKB",
      efSaldo: "CHF 48'210 per 31.12.2025",
      bank: "Zuger Kantonalbank",
      zins: "SARON + 0.65 %",
      laufzeit: "unbefristet",
      abl: "30.01.2028",
      ag: "Etzel Liegenschaften AG",
      zivil: "ledig",
      kinder: "2 (Elias, Thalia)",
      baujahr: "1921",
      kubatur: "1'497 m³",
      versSumme: "CHF 1'210'000",
      heizung: "nicht eindeutig – Holzofen erwähnt",
      unterhaltBetrag: "CHF 1'400 pro Monat",
      kreditRest: "CHF 24'360",
      kreditRate: "CHF 690",
      leasingRate: "CHF 412",
      leasingRest: "18 Monate",
      s3aPledge: "ZKB",
      pk: "CHF 86'500",
      pkVorbezug: "ja",
      // Handover 4.2 (Gerber: +0.3 %)
      bonus: false,
      raise: false,
      ab50: false,
    });
    expect(r.facts.salary).toMatchObject({ annual: 125385, monthly: 9615, thirteenth: true });
  });
});

describe("prefill rules (Handover 3)", () => {
  it("a missing document leaves its question empty", () => {
    const r = prefillFromDocuments([file("kredit", { Kreditgeber: "BANK-now" })], empty(), { now: NOW });
    expect(r.values).toEqual({ "ans.kredite": "Ja" });
  });

  it("two documents that disagree leave the field empty — nothing is guessed", () => {
    const r = prefillFromDocuments([file("hyp_zins", { Kapital: "449'000" }), file("kaufvertrag", { Kaufpreis: "CHF 900'000", Eigentumsübertragung: "1.4.2027" })], empty(), { now: NOW });
    expect(r.values["ans.antrag"]).toBeUndefined();
    expect(r.values).toMatchObject({ "fin.old": 449000, "fin.kaufpreis": 900000, "txt.kaufdatum": "01.04.2027" });
    // STWE-Reglement and Erneuerungsfonds agree.
    expect(prefillFromDocuments([file("stwe_regl", {}), file("ef", {})], empty(), { now: NOW }).values["ans.lieg"]).toBe("Stockwerkeigentum");
  });

  it("never prefills a touched field", () => {
    const s = { ...empty(), touched: { "fin.old": true as const, "ans.kredite": true as const } };
    const r = prefillFromDocuments(gerber(), s, { now: NOW });
    expect(r.values["fin.old"]).toBeUndefined();
    expect(r.src["fin.old"]).toBeUndefined();
    expect(r.values["ans.kredite"]).toBeUndefined();
    expect(r.values["ans.antrag"]).toBe("Ablösung");
  });

  it("a field read with low confidence is «aus Dokument · bitte prüfen»", () => {
    const r = prefillFromDocuments([file("hyp_zins", { Kapital: ["CHF 449'000", 0.62] })], empty(), { now: NOW });
    expect(r.src["fin.old"]).toMatchObject({ unsure: true });
    expect(r.src["ans.antrag"]).toMatchObject({ unsure: false });
  });

  it("two people on IDs and no name yet: no name is guessed", () => {
    const r = prefillFromDocuments(
      [file("id", { Name: "Gerber", Vornamen: "Gary" }, { personName: "Gerber Gary" }), file("id", { Name: "Gerber", Vornamen: "Lea" }, { personName: "Gerber Lea" })],
      empty(),
      { now: NOW }
    );
    expect(r.values["txt.vor"]).toBeUndefined();
    expect(r.values["txt.nach"]).toBeUndefined();
  });

  it("with Kreditnehmer 1 known, the documents are told apart by the name; Kreditnehmer 2's income too", () => {
    const s = { ...empty(), txt: { ...EMPTY_TEXTS, vor: "Gary", nach: "Gerber" }, borrowers: [{ id: "b1", vor: "Gary", nach: "Gerber", pkSe: "Nein" as const }, { id: "b2", vor: "Lea", nach: "Gerber", pkSe: "Nein" as const }] };
    const r = prefillFromDocuments(
      [
        file("lohnausweise", { Jahr: "2025", Bruttolohn: "125'385" }, { personName: "Gerber Gary", docDate: "2025" }),
        file("lohnausweise", { Jahr: "2025", Bruttolohn: "70'000" }, { personName: "Gerber Lea", docDate: "2025" }),
      ],
      s,
      { now: NOW }
    );
    expect(r.values).toMatchObject({ "fin.inc": 125385, "fin.inc2": 70000 });
  });

  it("a Handelsregisterauszug: Firma and zeichnungsberechtigte Person (to be checked); the ID is the signatory's then", () => {
    const r = prefillFromDocuments(
      [file("hr", { Firma: "Etzel Liegenschaften AG", Zeichnungsberechtigte: "Gary Gerber (Einzelunterschrift), Lea Gerber", UID: "CHE-123.456.789", Sitz: "Wädenswil" }), file("id", { Name: "Gerber", Vornamen: "Gary" }, { personName: "Gerber Gary" })],
      empty(),
      { now: NOW }
    );
    expect(r.values).toMatchObject({ "ans.kn": "Juristische Person", "txt.firma": "Etzel Liegenschaften AG", "txt.zeichner": "Gary Gerber" });
    expect(r.values["txt.vor"]).toBeUndefined();
    expect(r.src["ans.kn"]!.unsure).toBe(true);
    expect(r.src["txt.zeichner"]!.unsure).toBe(true);
    expect(r.info).toMatchObject({ uid: "CHE-123.456.789", sitz: "Wädenswil" });
  });

  it("Säule 3a from the certificate's Guthaben when no policy value was read; analyses stored before v5 still count", () => {
    expect(prefillFromDocuments([file("s3a", { Guthaben: "CHF 31'200 per 31.12.2025" })], empty(), { now: NOW }).values["em.s3a"]).toBe(31200);
    expect(prefillFromDocuments([file("police", { "Rückkaufswert per 09.01.2026": "CHF 10'340" })], empty(), { now: NOW }).values["em.s3a"]).toBe(10340);
    expect(correctionValues(gerber())).toEqual({ s3a: 10340 });
    expect(correctionValues([])).toEqual({});
  });

  it("only analysed files with a type take part", () => {
    const entries = [
      { id: "a", name: "a.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis: gerber()[0].analysis },
      { id: "b", name: "b.pdf", size: 1, uploadState: "uploaded", analysisState: "analysing" },
      { id: "c", name: "c.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis: { ...gerber()[0].analysis, docTypeId: null } },
    ] as FileEntry[];
    expect(analysedFiles(entries).map((f) => f.fileId)).toEqual(["a"]);
    expect(sourceLabelDe(gerber()[5].analysis)).toBe("Lohnausweis 2025");
  });
});

describe("in the store (Handover 3: Schnellanmeldung only)", () => {
  it("fills the Schnellanmeldung, leaves the Begleitete untouched but takes the facts; the list grows by 4.2", () => {
    const fast = createFunnelV3Store({ mode: "schnell" });
    const s = fast.getState();
    s.applyDocuments(prefillFromDocuments(gerber(), s, { now: NOW }));
    const after = fast.getState();
    expect(after.ans).toMatchObject({ antrag: "Ablösung", lieg: "Stockwerkeigentum", kredite: "Ja", anrede: "Herr" });
    expect(after.txt).toMatchObject({ vor: "Gary Samuel", nach: "Gerber", plz: "8820" });
    expect(after.borrowers[0]).toMatchObject({ vor: "Gary Samuel", job: "Angestellt" });
    expect(after.em.s3a).toBe(10340);
    expect(prefilledValue(after, "em.s3a")).toBe(10340);
    expect(prefilledValue(after, "borrower.0.job")).toBe("Angestellt");
    expect(Object.keys(after.src)).toHaveLength(19);

    const guided = createFunnelV3Store({});
    const g = guided.getState();
    g.applyDocuments(prefillFromDocuments(gerber(), g, { now: NOW }));
    expect(guided.getState().ans).toEqual(DEFAULT_ANSWERS);
    expect(guided.getState().info.bank).toBe("Zuger Kantonalbank");

    // A bonus recognised in the documents puts P5 on the list, in either mode.
    const bonus = createFunnelV3Store({});
    const b = bonus.getState();
    const files = [file("lohnausweise", { Jahr: "2025", Bruttolohn: "140'000" }, { personName: "Gerber Gary", docDate: "2025" }), file("lohnabrechnungen", { "Monatslohn brutto": "9'615", "13. Monatslohn": "ja" }, { personName: "Gerber Gary", docDate: "2026-05" })];
    b.applyDocuments(prefillFromDocuments(files, b, { now: NOW }));
    expect(bonus.getState().info.bonus).toBe(true);
    expect(reqList(bonus.getState()).map((x) => x.id)).toContain("lohnausweise_alt");
  });
});
