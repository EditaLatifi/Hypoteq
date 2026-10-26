import { describe, it, expect } from "@jest/globals";
import { choicePatch, evaluateAbgleich, type AbgleichDoc } from "@/lib/funnel-v3/abgleich/evaluate";
import { ampelOf, FALLBACK_RULES, rulesFromSalesforce, sourceTypes } from "@/lib/funnel-v3/abgleich/rules";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { reqList } from "@/lib/funnel-v3/requirements";
import { EMPTY_EM, type FunnelState } from "@/lib/funnel-v3/types";
import { ablState, kaufState } from "./v5Fixtures";

/**
 * Spezifikation Datenabgleich 4 (HYPOTEQ 23.10.2026, answers 26.10.2026): the funnel against
 * the documents, deterministic, rule by rule.
 */

const field = (value: string, confidence = 0.95) => ({ value, confidence });
const analysis = (docTypeId: string, fields: Record<string, { value: string; confidence: number }>, over: Partial<V3Analysis> = {}): V3Analysis => ({
  status: "done",
  docTypeId,
  docTypeLabel: docTypeId,
  confidence: 0.95,
  requirementId: docTypeId,
  fields,
  ...over,
});

/** The instance id of requirement `id` (of Kreditnehmer `borrowerId`) on the state's list. */
const inst = (s: FunnelState, id: string, borrowerId?: string) => {
  const i = reqList(s).find((x) => x.id === id && (!borrowerId || x.borrowerId === borrowerId));
  if (!i) throw new Error(`no ${id} on the list`);
  return i.instanceId;
};
let n = 0;
const doc = (instanceId: string | null, a: V3Analysis): AbgleichDoc => ({ id: `d${++n}`, instanceId, analysis: a });
const byId = (r: ReturnType<typeof evaluateAbgleich>, id: string) => r.fields.find((f) => f.id === id);

describe("Ampel (4.2)", () => {
  it("green from 0.90, yellow from 0.60, red below", () => {
    expect([0.95, 0.9, 0.89, 0.6, 0.59, null].map((c) => ampelOf(c))).toEqual(["green", "green", "yellow", "yellow", "red", "red"]);
    expect(ampelOf(0.85, { green: 0.8, yellow: 0.5 })).toBe("green");
  });
});

describe("Jahreseinkommen against the Lohnausweis (±5 %), the payslips as a hint (±15 %)", () => {
  const s = kaufState({ fin: { ...kaufState().fin, inc: 120000 } });
  const lohn = (value: string, confidence = 0.95) => doc(inst(s, "lohnausweise", "b1"), analysis("lohnausweise", { Bruttolohn: field(value, confidence) }));

  it("more than 5 % apart: a conflict with the income explanation", () => {
    const r = evaluateAbgleich({ state: s, docs: [lohn("CHF 100'000")] });
    const f = byId(r, "jahreseinkommen:b1")!;
    expect(f).toMatchObject({ result: "conflict", funnelValue: 120000, explanationKey: "abg.hint.income", choosable: true, person: "Lea Muster" });
    expect(f.against).toMatchObject({ docType: "lohnausweis", typeId: "lohnausweise", value: 100000, display: "CHF 100'000", ampel: "green", role: "primary" });
    expect(r.conflicts.map((c) => c.id)).toEqual(["jahreseinkommen:b1"]);
    expect(r.blocking).toEqual([]);
  });

  it("within 5 %: ok", () => {
    expect(byId(evaluateAbgleich({ state: s, docs: [lohn("CHF 116'000")] }), "jahreseinkommen:b1")!.result).toBe("ok");
  });

  it("yellow is «zu prüfen», never a conflict; red is not used", () => {
    expect(byId(evaluateAbgleich({ state: s, docs: [lohn("CHF 100'000", 0.75)] }), "jahreseinkommen:b1")!.result).toBe("to_check");
    expect(byId(evaluateAbgleich({ state: s, docs: [lohn("CHF 100'000", 0.5)] }), "jahreseinkommen:b1")!.result).toBe("unverified");
  });

  it("the payslips (× 13 with a 13th salary) deviating by more than 15 % are a hint for the analyst", () => {
    const payslips = (monthly: string) => doc(inst(s, "lohnabrechnungen", "b1"), analysis("lohnabrechnungen", { "Monatslohn brutto": field(monthly), "13. Monatslohn": field("Ja") }));
    expect(byId(evaluateAbgleich({ state: s, docs: [lohn("CHF 120'000"), payslips("CHF 8'500")] }), "jahreseinkommen:b1")!.result).toBe("ok");
    const hint = byId(evaluateAbgleich({ state: s, docs: [lohn("CHF 120'000"), payslips("CHF 6'000")] }), "jahreseinkommen:b1")!;
    expect(hint.result).toBe("hint");
    expect(hint.extracted.find((e) => e.role === "secondary")).toMatchObject({ value: 78000, field: "Monatslohn brutto · 13. Monatslohn" });
  });

  it("the customer's choice clarifies it, and taking the document's value changes the income", () => {
    const choice = { value: 120000, chosenSource: "funnel" as const, at: "2026-10-26T10:00:00Z" };
    const r = evaluateAbgleich({ state: s, docs: [lohn("CHF 100'000")], choices: { "jahreseinkommen:b1": choice } });
    expect(byId(r, "jahreseinkommen:b1")).toMatchObject({ result: "ok", customerChoice: choice });
    // still on the page, with the choice shown
    expect(r.conflicts.map((c) => c.id)).toEqual(["jahreseinkommen:b1"]);
    expect(choicePatch(byId(r, "jahreseinkommen:b1")!, 100000, s)).toEqual({ fin: { inc: 100000 } });
  });

  it("Selbständig: the average of the business years (±10 %)", () => {
    const se = kaufState({ borrowers: [{ id: "b1", vor: "Lea", nach: "Muster", job: "Selbständig", pkSe: "Nein" }], fin: { ...kaufState().fin, inc: 100000 } });
    const year = (v: string) => doc(inst(se, "abschluss_se", "b1"), analysis("abschluss_se", { Reingewinn: field(v) }));
    const f = byId(evaluateAbgleich({ state: se, docs: [year("CHF 80'000"), year("CHF 100'000"), year("CHF 120'000")] }), "einkommen_selbstaendig:b1")!;
    expect(f).toMatchObject({ result: "ok", explanationKey: "abg.hint.selfEmployed" });
    expect(f.extracted.find((e) => e.field === "Ø Reingewinn")).toMatchObject({ value: 100000 });
  });
});

describe("Name against the Pass/ID: the identity conflict, the only hard stop", () => {
  const s = kaufState();
  const id = (first: string, last: string) => doc(inst(s, "id", "b1"), analysis("id", { Vornamen: field(first), Name: field(last) }, { personName: `${last} ${first}` }));

  it("another person's ID blocks, with the printed name", () => {
    const r = evaluateAbgleich({ state: s, docs: [id("Anna", "Beispiel")] });
    const f = byId(r, "name_kreditnehmer:b1")!;
    expect(f).toMatchObject({ result: "identity_conflict", nameOnDocument: "Anna Beispiel", funnelValue: "Lea Muster", choosable: false, explanationKey: "abg.hint.identity" });
    expect(r.blocking.map((b) => b.id)).toEqual(["name_kreditnehmer:b1"]);
  });

  it("accents, case and double names match", () => {
    expect(byId(evaluateAbgleich({ state: s, docs: [id("LEA", "MUSTER-MEIER")] }), "name_kreditnehmer:b1")!.result).toBe("ok");
    const accent = kaufState({ txt: { ...kaufState().txt, vor: "Zoé", nach: "Müller" }, borrowers: [{ id: "b1", vor: "Zoé", nach: "Müller", job: "Angestellt", pkSe: "Nein" }] });
    const r = evaluateAbgleich({ state: accent, docs: [doc(inst(accent, "id", "b1"), analysis("id", { Vornamen: field("ZOE"), Name: field("MUELLER") }))] });
    expect(byId(r, "name_kreditnehmer:b1")!.result).toBe("ok");
  });

  it("a choice cannot clear it", () => {
    const r = evaluateAbgleich({ state: s, docs: [id("Anna", "Beispiel")], choices: { "name_kreditnehmer:b1": { value: "Lea Muster", chosenSource: "funnel", at: "x" } } });
    expect(r.blocking).toHaveLength(1);
  });
});

describe("Eigenmittel, Kaufpreis, Objekt-Adresse", () => {
  const s = kaufState({ em: { ...EMPTY_EM, spar: 200000, s3a: 100000 } });
  const vermoegen = (v: string) => doc(inst(s, "vermoegen"), analysis("vermoegen", { "Saldo total": field(v) }));
  const s3a = (v: string) => doc(inst(s, "s3a"), analysis("s3a", { Guthaben: field(v) }));

  it("total: only less than entered (beyond 10 %) is a conflict — more is none", () => {
    const less = byId(evaluateAbgleich({ state: s, docs: [vermoegen("CHF 150'000"), s3a("CHF 100'000")] }), "eigenmittel_total")!;
    expect(less).toMatchObject({ result: "conflict", funnelValue: 300000, explanationKey: "abg.hint.equity" });
    expect(less.against).toMatchObject({ value: 250000, field: "Saldo total + Guthaben" });
    expect(byId(evaluateAbgleich({ state: s, docs: [vermoegen("CHF 280'000"), s3a("CHF 100'000")] }), "eigenmittel_total")!.result).toBe("ok");
    // Choosing the documents' total: the Ersparnisse take up the difference.
    expect(choicePatch(less, 250000, s)).toEqual({ em: { spar: 150000 } });
  });

  it("Säule 3a ±5 %", () => {
    expect(byId(evaluateAbgleich({ state: s, docs: [s3a("CHF 97'000")] }), "eigenmittel_3a")!.result).toBe("ok");
    expect(byId(evaluateAbgleich({ state: s, docs: [s3a("CHF 90'000")] }), "eigenmittel_3a")!.result).toBe("conflict");
  });

  it("Kaufpreis to the franc", () => {
    const k = (v: string) => doc(inst(s, "kaufvertrag"), analysis("kaufvertrag", { Kaufpreis: field(v) }));
    expect(byId(evaluateAbgleich({ state: s, docs: [k("CHF 1'000'000")] }), "kaufpreis")!.result).toBe("ok");
    expect(byId(evaluateAbgleich({ state: s, docs: [k("CHF 990'000")] }), "kaufpreis")).toMatchObject({ result: "conflict", explanationKey: "abg.hint.price" });
  });

  it("PLZ and Ort of the Grundbuchauszug, normalised", () => {
    const gb = (plz: string, ort: string) => doc(inst(s, "grundbuch"), analysis("grundbuch", { PLZ: field(plz), Ort: field(ort) }));
    expect(byId(evaluateAbgleich({ state: s, docs: [gb("8001", "ZURICH")] }), "objekt_adresse")!.result).toBe("ok");
    const off = byId(evaluateAbgleich({ state: s, docs: [gb("8400", "Winterthur")] }), "objekt_adresse")!;
    expect(off).toMatchObject({ result: "conflict", explanationKey: "abg.hint.address" });
    expect(choicePatch(off, "8400 Winterthur", s)).toEqual({ txt: { plz: "8400", ort: "Winterthur" } });
  });
});

describe("Ablösung and Verpflichtungen", () => {
  it("the existing mortgage: the Produktvereinbarungen add up (±2 %)", () => {
    const s = ablState({ fin: { ...ablState().fin, old: 500000 } });
    const p = (v: string) => doc(inst(s, "produkt"), analysis("produkt", { Betrag: field(v) }));
    expect(byId(evaluateAbgleich({ state: s, docs: [p("CHF 300'000"), p("CHF 195'000")] }), "bestehende_hypothek_betrag")!.result).toBe("ok");
  });

  it("a Leasingvertrag the answers do not mention is a hint, never a customer conflict", () => {
    const s = kaufState();
    // Off the list (the chip is «Nein»), outside the list as «Überzählig».
    const leasing = analysis("leasing", { Leasingrate: field("CHF 450") }, { requirementId: null, extraKind: "surplus" });
    const r = evaluateAbgleich({ state: s, docs: [doc(null, leasing)] });
    expect(byId(r, "verpflichtungen:leasing")).toMatchObject({ result: "hint", funnelValue: "Nein" });
    expect(r.conflicts).toEqual([]);
    // A duplicate never counts.
    expect(byId(evaluateAbgleich({ state: s, docs: [doc(null, { ...leasing, extraKind: "duplicate" })] }), "verpflichtungen:leasing")).toBeUndefined();
    // Asked and there: ok.
    const asked = kaufState({ ans: { ...kaufState().ans, leasing: "Ja" } });
    expect(byId(evaluateAbgleich({ state: asked, docs: [doc(inst(asked, "leasing"), analysis("leasing", { Leasingrate: field("CHF 450") }))] }), "verpflichtungen:leasing")!.result).toBe("ok");
  });
});

describe("rules from Salesforce (Pruefregel__c)", () => {
  it("reads the rows, skips unusable ones, falls back to 4.2 thresholds", () => {
    const rules = rulesFromSalesforce([
      { Feld_Key__c: "Jahreseinkommen", Primaerquelle__c: "lohnausweis", Sekundaerquellen__c: "monatslohnabrechnungen, steuererklaerung", Toleranz_Prozent__c: 7, Schwelle_Gruen__c: 0.85, Schwelle_Gelb__c: 0.5, Nur_Unterschreitung__c: false, Severity__c: "conflict", Aktiv__c: true },
      { Feld_Key__c: "kaufpreis", Primaerquelle__c: "kaufvertrag", Schwelle_Gruen__c: 7, Severity__c: "?" },
      { Feld_Key__c: "", Primaerquelle__c: "x" },
      { Feld_Key__c: "y", Primaerquelle__c: "" },
    ])!;
    expect(rules.map((r) => r.key)).toEqual(["jahreseinkommen", "kaufpreis"]);
    expect(rules[0]).toMatchObject({ secondary: ["monatslohnabrechnungen", "steuererklaerung"], tolerancePct: 7, green: 0.85, yellow: 0.5 });
    expect(rules[1]).toMatchObject({ green: 0.9, yellow: 0.6, severity: "conflict", tolerancePct: 0 });
    expect(rulesFromSalesforce([])).toBeNull();
    expect(rulesFromSalesforce(null)).toBeNull();
  });

  it("a tolerance from Salesforce is what the comparison uses", () => {
    const s = kaufState({ fin: { ...kaufState().fin, inc: 120000 } });
    const docs = [doc(inst(s, "lohnausweise", "b1"), analysis("lohnausweise", { Bruttolohn: field("CHF 100'000") }))];
    const loose = FALLBACK_RULES.map((r) => (r.key === "jahreseinkommen" ? { ...r, tolerancePct: 20 } : r));
    expect(byId(evaluateAbgleich({ state: s, docs, rules: loose }), "jahreseinkommen:b1")!.result).toBe("ok");
    const off = FALLBACK_RULES.map((r) => (r.key === "jahreseinkommen" ? { ...r, active: false } : r));
    expect(byId(evaluateAbgleich({ state: s, docs, rules: off }), "jahreseinkommen:b1")).toBeUndefined();
  });

  it("the fallback holds HYPOTEQ's 16 rules; every source maps onto the catalogue", () => {
    expect(FALLBACK_RULES).toHaveLength(16);
    for (const r of FALLBACK_RULES) for (const s of [...r.primary, ...r.secondary]) expect([r.key, s, sourceTypes(r.key, [s]).length > 0]).toEqual([r.key, s, true]);
    expect(sourceTypes("verpflichtungen", ["darlehensvertrag"])).toEqual(["kredit"]);
    expect(sourceTypes("eigenmittel_schenkung_darlehen_erbe", ["darlehensvertrag"])).toEqual(["darlehen"]);
  });
});

describe("the four extra fields HYPOTEQ accepted on 26.10. (Abnahme Feldschlüssel)", () => {
  const s = kaufState();

  it("Geburtsdatum on the PK-Ausweis against the Pass: a hint when they differ", () => {
    const id = doc(inst(s, "id", "b1"), analysis("id", { Geburtsdatum: field("01.02.1980") }));
    const pk = (v: string) => doc(inst(s, "pk", "b1"), analysis("pk", { Geburtsdatum: field(v) }));
    expect(byId(evaluateAbgleich({ state: s, docs: [id, pk("01.02.1980")] }), "geburtsdatum:b1")!.result).toBe("unverified");
    const off = byId(evaluateAbgleich({ state: s, docs: [id, pk("02.02.1980")] }), "geburtsdatum:b1")!;
    expect(off.result).toBe("hint");
    expect(off.extracted.map((v) => v.docType)).toEqual(["pass_id", "pensionskassenausweis"]);
  });

  it("Kaufpreis on the Reservationsvertrag beside the Kaufvertrag", () => {
    const k = doc(inst(s, "kaufvertrag"), analysis("kaufvertrag", { Kaufpreis: field("CHF 1'000'000") }));
    const r = (v: string) => doc(null, analysis("reservation", { Kaufpreis: field(v) }));
    expect(byId(evaluateAbgleich({ state: s, docs: [k, r("CHF 1'000'000")] }), "kaufpreis")!.result).toBe("ok");
    const off = byId(evaluateAbgleich({ state: s, docs: [k, r("CHF 980'000")] }), "kaufpreis")!;
    expect(off.result).toBe("hint");
    expect(off.extracted.find((v) => v.typeId === "reservation")).toMatchObject({ docType: "reservationsvertrag", value: 980000, role: "secondary" });
  });

  it("the address on the Gebäudeversicherung beside the Grundbuchauszug", () => {
    const gb = doc(inst(s, "grundbuch"), analysis("grundbuch", { PLZ: field("8001"), Ort: field("Zürich") }));
    const gvz = (adresse: string) => doc(inst(s, "gvz"), analysis("gvz", { Adresse: field(adresse) }));
    expect(byId(evaluateAbgleich({ state: s, docs: [gb, gvz("Musterweg 1, 8001 Zürich")] }), "objekt_adresse")!.result).toBe("ok");
    const off = byId(evaluateAbgleich({ state: s, docs: [gb, gvz("Musterweg 1, 8400 Winterthur")] }), "objekt_adresse")!;
    expect(off.result).toBe("hint");
    expect(off.extracted.find((v) => v.typeId === "gvz")).toMatchObject({ docType: "gebaeudeversicherung", value: "8400 Winterthur" });
  });

  it("Kubatur: the Gebäudeversicherung's Volumen against the Verkaufsdokumentation (±10 %)", () => {
    const gvz = doc(inst(s, "gvz"), analysis("gvz", { Volumen: field("1'250 m³") }));
    const vd = (v: string) => doc(inst(s, "verkaufsdoku"), analysis("verkaufsdoku", { Kubatur: field(v) }));
    const near = byId(evaluateAbgleich({ state: s, docs: [gvz, vd("1'200 m³")] }), "baujahr_kubatur:kubatur")!;
    expect(near).toMatchObject({ result: "unverified", part: "kubatur", kind: "amount" });
    expect(near.extracted[0]).toMatchObject({ docType: "gebaeudeversicherung", value: 1250, display: "1'250 m³" });
    expect(byId(evaluateAbgleich({ state: s, docs: [gvz, vd("1'000 m³")] }), "baujahr_kubatur:kubatur")!.result).toBe("hint");
  });
});
