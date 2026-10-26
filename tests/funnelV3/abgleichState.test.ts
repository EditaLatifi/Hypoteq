import { describe, it, expect, beforeEach } from "@jest/globals";
import { evaluateAbgleich, type AbgleichDoc } from "@/lib/funnel-v3/abgleich/evaluate";
import { clearPruefregelCache, loadPruefregeln, RULES_TTL_MS } from "@/lib/funnel-v3/abgleich/config";
import { FALLBACK_RULES } from "@/lib/funnel-v3/abgleich/rules";
import { abgleichStateText, ABGLEICH_STATE_MAX, buildAbgleichState, choicesOf } from "@/lib/funnel-v3/abgleich/state";
import { abgleichCaseField } from "@/lib/funnel-v3/completion";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { reqList } from "@/lib/funnel-v3/requirements";
import { createFunnelV3Store } from "@/lib/funnel-v3/store";
import { kaufState } from "./v5Fixtures";

/** Spezifikation Datenabgleich 6.2 and 4.3 (HYPOTEQ 23.10.2026; answers 5 and 7 of 26.10.2026). */

const state = kaufState({ fin: { ...kaufState().fin, inc: 120000 } });
const lohnInst = reqList(state).find((i) => i.id === "lohnausweise" && i.borrowerId === "b1")!.instanceId;
const lohn: V3Analysis = { status: "done", docTypeId: "lohnausweise", docTypeLabel: "Lohnausweis", confidence: 0.95, requirementId: "lohnausweise", fields: { Bruttolohn: { value: "CHF 100'000", confidence: 0.95, sourceRef: "Seite 1, Ziffer 8" } } };
const docs: AbgleichDoc[] = [{ id: "doc-1", instanceId: lohnInst, analysis: lohn }];

describe("the Abgleich JSON (6.2)", () => {
  it("one entry per field with label, funnel value, the readings with their source, the result", () => {
    const result = evaluateAbgleich({ state, docs, choices: { "jahreseinkommen:b1": { value: 120000, chosenSource: "funnel", at: "2026-10-26T10:00:00.000Z" } } });
    const json = buildAbgleichState({ result, submittedAt: new Date("2026-10-26T10:01:00Z"), mode: "schnell", role: "berater", rulesFrom: "salesforce", borrowerIds: ["b1"] });
    expect(json).toMatchObject({ version: 1, submittedAt: "2026-10-26T10:01:00.000Z", funnelPath: "schnellanmeldung", submittedBy: "berater", rulesFrom: "salesforce", reuploads: [] });
    const income = json.fields.find((f) => f.key === "jahreseinkommen")!;
    expect(income).toEqual({
      key: "jahreseinkommen",
      borrower: 1,
      person: "Lea Muster",
      label: { de: "Jahreseinkommen", en: "Annual income", fr: "Revenu annuel", it: "Reddito annuo" },
      funnelValue: 120000,
      extracted: [{ docType: "lohnausweis", docId: "doc-1", value: 100000, confidence: 0.95, sourceRef: "Seite 1, Ziffer 8", role: "primary", ampel: "green", field: "Bruttolohn" }],
      // clarified: «ok» with the choice as its evidence
      result: "ok",
      customerChoice: { value: 120000, chosenSource: "funnel", at: "2026-10-26T10:00:00.000Z" },
      explanation: expect.objectContaining({ de: expect.stringContaining("Lohnausweis zeigt den Lohn ohne Bonus"), en: expect.stringContaining("salary certificate") }),
    });
    expect(json.summary).toMatchObject({ ok: expect.any(Number), conflict: 0, identityConflict: 0 });
  });

  it("a document value taken over: the original funnel value is what the JSON reports", () => {
    const result = evaluateAbgleich({ state: { ...state, fin: { ...state.fin, inc: 100000 } }, docs, choices: { "jahreseinkommen:b1": { value: 100000, chosenSource: "document", at: "x", original: 120000 } } });
    const json = buildAbgleichState({ result, submittedAt: new Date(), mode: "begleitet", role: "kunde", rulesFrom: "fallback", borrowerIds: ["b1"] });
    expect(json.funnelPath).toBe("begleitete_anmeldung");
    expect(json.fields.find((f) => f.key === "jahreseinkommen")).toMatchObject({ funnelValue: 120000, result: "ok", customerChoice: { chosenSource: "document", value: 100000 } });
  });

  it("stays within the Long Text field: the secondary readings go first", () => {
    const result = evaluateAbgleich({ state, docs });
    const json = buildAbgleichState({ result, submittedAt: new Date(), mode: "schnell", role: "kunde", rulesFrom: "fallback", borrowerIds: ["b1"] });
    expect(abgleichStateText(json).length).toBeLessThan(ABGLEICH_STATE_MAX);
    const huge = { ...json, fields: Array.from({ length: 400 }, (_, i) => ({ ...json.fields[0], extracted: Array.from({ length: 4 }, () => ({ ...json.fields[0].extracted[0], role: "secondary" as const, sourceRef: "x".repeat(100) })), key: `k${i}` })) };
    const text = abgleichStateText(huge);
    expect(text.length).toBeLessThanOrEqual(ABGLEICH_STATE_MAX);
    expect(JSON.parse(text).fields.length).toBe(400);
  });

  it("reads the choices from the submitted state, nothing else", () => {
    expect(choicesOf({ v3: { abgleich: { choices: { a: { value: 1, chosenSource: "document", at: "t", original: 2 }, b: { value: {}, chosenSource: "funnel" }, c: { value: 1, chosenSource: "x" } } } } })).toEqual({
      a: { value: 1, chosenSource: "document", at: "t", original: 2 },
    });
    expect(choicesOf(null)).toEqual({});
  });

  it("the Case field from the submitted payload (documents of the case folder, choices, corrections)", () => {
    const data = {
      v3: { ...state, version: 2, abgleich: { choices: {} } },
      documents: [{ documentId: "doc-1", instanceId: lohnInst, requirementId: "lohnausweise", humanEdits: { Bruttolohn: "CHF 118'000" } }],
      v3Completion: { files: [{ documentId: "doc-1", originalName: "lohn.pdf", storedName: null, url: null, instanceId: lohnInst, requirementId: "lohnausweise", removed: false, analysis: lohn }] },
    };
    const text = abgleichCaseField(data, { rules: FALLBACK_RULES, from: "fallback" }, new Date("2026-10-26T10:00:00Z"))!;
    const income = JSON.parse(text).fields.find((f: any) => f.key === "jahreseinkommen");
    // The customer corrected the reading to CHF 118'000 in the document detail: within 5 %.
    expect(income).toMatchObject({ result: "ok", extracted: [{ value: 118000, confidence: 1 }] });
    expect(abgleichCaseField({ legacy: true }, { rules: FALLBACK_RULES, from: "fallback" })).toBeNull();
  });
});

describe("the rules from Pruefregel__c, cached (4.3)", () => {
  beforeEach(() => clearPruefregelCache());

  it("reads Salesforce once per 15 minutes, falls back when it fails", async () => {
    let calls = 0;
    const query = async () => {
      calls++;
      return [{ Feld_Key__c: "kaufpreis", Primaerquelle__c: "kaufvertrag", Toleranz_Prozent__c: 1, Aktiv__c: true }];
    };
    const a = await loadPruefregeln({ now: 0, query });
    expect(a.from).toBe("salesforce");
    expect(a.rules.map((r) => r.key)).toEqual(["kaufpreis"]);
    await loadPruefregeln({ now: RULES_TTL_MS - 1, query });
    expect(calls).toBe(1);
    await loadPruefregeln({ now: RULES_TTL_MS + 1, query });
    expect(calls).toBe(2);

    clearPruefregelCache();
    const warn = console.warn;
    console.warn = () => {};
    const failed = await loadPruefregeln({ now: 0, query: async () => Promise.reject(new Error("down")) });
    console.warn = warn;
    expect(failed).toMatchObject({ from: "fallback", rules: FALLBACK_RULES });
  });

  it("test mode and an unconfigured Salesforce use the start values without a request", async () => {
    expect((await loadPruefregeln({ testMode: true })).from).toBe("fallback");
    clearPruefregelCache();
    expect((await loadPruefregeln({ testMode: false })).rules).toBe(FALLBACK_RULES);
  });
});

describe("the customer's choice in the store (3: «ändert den Funnel-Wert, der Originalwert bleibt protokolliert»)", () => {
  it("the document's value changes the answer, the funnel's value restores it", () => {
    const store = createFunnelV3Store({ ...state });
    const conflict = () => evaluateAbgleich({ state: store.getState(), docs, choices: store.getState().choices }).fields.find((f) => f.id === "jahreseinkommen:b1")!;
    expect(conflict().result).toBe("conflict");
    store.getState().chooseAbgleich(conflict(), "document");
    expect(store.getState().fin.inc).toBe(100000);
    expect(store.getState().choices["jahreseinkommen:b1"]).toMatchObject({ chosenSource: "document", value: 100000, original: 120000 });
    // still on the page as a clarified difference
    expect(conflict()).toMatchObject({ result: "ok", customerChoice: { chosenSource: "document" } });
    store.getState().chooseAbgleich(conflict(), "funnel");
    expect(store.getState().fin.inc).toBe(120000);
    expect(store.getState().choices["jahreseinkommen:b1"]).toMatchObject({ chosenSource: "funnel", value: 120000 });
    expect(store.getState().choices["jahreseinkommen:b1"].original).toBeUndefined();
  });
});
