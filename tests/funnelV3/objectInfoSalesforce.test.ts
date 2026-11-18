/**
 * HYPOTEQ Komplett-Test 18.11.2026 («Objektinformationen bzw. geschätzter Objektwert wurden nicht
 * übernommen in Salesforce, obwohl Angaben in der Verkaufsdokumentation vorhanden waren», DECISIONS
 * V124): Baujahr, Zimmer, Wohnfläche, Terrasse / Balkon, Grundstückfläche, Kubatur, Stockwerk and the
 * street from the documents into the Case's «Objektinformationen».
 */
import { describe, it, expect } from "@jest/globals";
import { objectInfoFields } from "@/components/syncFunnelStepsToSalesforce";
import { SALESFORCE_CASE_FIELDS } from "@/components/salesforceFieldConfig";
import { prefillFromDocuments } from "@/lib/funnel-v3/prefill";
import { v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { DEFAULT_ANSWERS, EMPTY_TEXTS } from "@/lib/funnel-v3/types";

const vd = (fields: Record<string, string>): V3Analysis => ({
  status: "done",
  docTypeId: "verkaufsdoku",
  docTypeLabel: "Verkaufsdokumentation",
  confidence: 0.95,
  requirementId: "verkaufsdoku",
  docDate: "2026-09-01",
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.92 }])),
});

describe("the Verkaufsdokumentation reads what the Case shows", () => {
  it("asks the model for terrace, parcel area and floor", () => {
    const keys = v3DocType("verkaufsdoku")!.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["Baujahr", "Zimmer", "Wohnfläche", "Terrasse / Balkon", "Grundstücksfläche", "Stockwerk", "Kubatur"]));
  });

  it("the facts carry them to the submission", () => {
    const r = prefillFromDocuments(
      [{ fileId: "f1", analysis: vd({ Baujahr: "1998", Zimmer: "5.5", Wohnfläche: "168 m²", "Terrasse / Balkon": "24 m²", Grundstücksfläche: "612 m²", Kubatur: "980 m³", Verkaufspreis: "CHF 1'450'000" }) }],
      { ans: { ...DEFAULT_ANSWERS }, txt: { ...EMPTY_TEXTS }, borrowers: [], touched: {} }
    );
    expect(r.info).toMatchObject({ baujahr: "1998", zimmer: "5.5", wohnflaeche: "168 m²", terrasse: "24 m²", grundstueck: "612 m²", kubatur: "980 m³" });
  });
});

describe("objectInfoFields → the Case", () => {
  it("writes each value that reads as one", () => {
    expect(
      objectInfoFields({ baujahr: "1998 (renoviert 2015)", zimmer: "5½", wohnflaeche: "168 m²", terrasse: "ca. 24.5 m²", grundstueck: "1'250 m²", kubatur: "980 m³", stockwerk: "2. OG", adresse: "Musterweg 7, 8600 Dübendorf" })
    ).toEqual({
      Baujahr__c: 1998,
      Anzahl_Zimmer__c: 5.5,
      Wohnfl_che_m2__c: "168 m²",
      Flaeche_Terrasse_Balkon_m2__c: 25,
      Grundst_ckfl_che_m__c: 1250,
      Kubatur__c: "980 m³",
      Stockwerk__c: "2. OG",
      Adresse__c: "Musterweg 7",
    });
  });

  it("leaves out what does not read — an advisor's entry is never overwritten with empty", () => {
    expect(objectInfoFields({ baujahr: "unbekannt", zimmer: "", wohnflaeche: "keine Angabe", grundstueck: null as unknown as string })).toEqual({});
    expect(objectInfoFields(undefined)).toEqual({});
  });

  it("terrace and balcony add up, as the model reads them («Terrasse 24 m², Balkon 8 m²»)", () => {
    expect(objectInfoFields({ terrasse: "Terrasse 24 m², Balkon 8 m²" }).Flaeche_Terrasse_Balkon_m2__c).toBe(32);
    expect(objectInfoFields({ terrasse: "18 m2" }).Flaeche_Terrasse_Balkon_m2__c).toBe(18);
    // Read off the model's real answer for the fictional Verkaufsdokumentation of 18.11.2026.
    expect(objectInfoFields({ baujahr: "1998, Renovation 2016", zimmer: "5.5", wohnflaeche: "168 m²", grundstueck: "612 m²", kubatur: "980 m³" })).toEqual({
      Baujahr__c: 1998,
      Anzahl_Zimmer__c: 5.5,
      Wohnfl_che_m2__c: "168 m²",
      Grundst_ckfl_che_m__c: 612,
      Kubatur__c: "980 m³",
    });
  });

  it("every field is a Case field the sync keeps (the cleanup drops unknown keys)", () => {
    for (const k of ["Baujahr__c", "Anzahl_Zimmer__c", "Wohnfl_che_m2__c", "Flaeche_Terrasse_Balkon_m2__c", "Grundst_ckfl_che_m__c", "Kubatur__c", "Stockwerk__c", "Adresse__c"]) {
      expect([k, SALESFORCE_CASE_FIELDS[k]]).toEqual([k, expect.any(String)]);
    }
  });
});

describe("V127: the Geschätzter Objektwert at an Ablösung («Schätzung, letzter Kaufpreis oder Verkehrswert»)", () => {
  const doc = (docTypeId: string, fields: Record<string, string>): V3Analysis => ({ ...vd(fields), docTypeId, docTypeLabel: docTypeId, requirementId: docTypeId });
  const run = (antrag: "Ablösung" | "Neue Hypothek", list: V3Analysis[]) =>
    prefillFromDocuments(
      list.map((analysis, i) => ({ fileId: `f${i}`, analysis })),
      { ans: { ...DEFAULT_ANSWERS, antrag }, txt: { ...EMPTY_TEXTS }, borrowers: [], touched: {} }
    );

  it("the value the current lender states comes first, marked «bitte prüfen»", () => {
    const r = run("Ablösung", [doc("produkt", { Betrag: "CHF 449'000", Verkehrswert: "CHF 980'000" }), vd({ Verkaufspreis: "CHF 1'050'000" })]);
    expect(r.values["fin.val"]).toBe(980000);
    expect(r.src["fin.val"]).toMatchObject({ docType: "produkt", unsure: true });
  });

  it("else the sales documentation's price, else the last Kaufpreis of an old purchase contract", () => {
    expect(run("Ablösung", [vd({ Verkaufspreis: "CHF 1'050'000" }), doc("kaufvertrag", { Kaufpreis: "CHF 780'000" })]).values["fin.val"]).toBe(1050000);
    const old = run("Ablösung", [doc("hyp_zins", { Kapital: "CHF 449'000" }), doc("kaufvertrag", { Kaufpreis: "CHF 780'000" })]);
    expect(old.values["fin.val"]).toBe(780000);
    expect(old.src["fin.val"]?.unsure).toBe(true);
  });

  it("at a Kauf nothing changes: the purchase contract is the Kaufpreis, not the Objektwert", () => {
    const r = run("Neue Hypothek", [doc("kaufvertrag", { Kaufpreis: "CHF 780'000" }), doc("produkt", { Verkehrswert: "CHF 980'000" })]);
    expect(r.values["fin.kaufpreis"]).toBe(780000);
    expect(r.values["fin.val"]).toBeUndefined();
  });

  it("the model is asked for the lender's Verkehrswert", () => {
    expect(v3DocType("produkt")!.fields.map((f) => f.key)).toContain("Verkehrswert");
    expect(v3DocType("hyp_zins")!.fields.map((f) => f.key)).toContain("Verkehrswert");
  });
});
