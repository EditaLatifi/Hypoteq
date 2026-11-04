/**
 * HYPOTEQ «Pre-Check und Rücklieferung» (03.11.2026) and the handover of 04.11.2026 (DECISIONS
 * V101): what the Abgleich JSON carries beyond Spezifikation 6.2 — `source` per field (2.1, 2.4),
 * `documents[]` (2.2: needed, received, the stored file) and the Auskunftsermächtigung's
 * signature as a field, «to_check» when the AI doubts it (Befund 1: never blocking). Pure: no
 * Salesforce, no mail.
 */
import { describe, it, expect } from "@jest/globals";
import { evaluateAbgleich, type AbgleichDoc } from "@/lib/funnel-v3/abgleich/evaluate";
import { FALLBACK_RULES } from "@/lib/funnel-v3/abgleich/rules";
import { buildAbgleichState, fieldSource, SIGNATURE_FIELD_KEY } from "@/lib/funnel-v3/abgleich/state";
import { abgleichCaseField } from "@/lib/funnel-v3/completion";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { reqList, SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import { CASE_NO, kaufState, v5Payload } from "./v5Fixtures";

const RULES = { rules: FALLBACK_RULES, from: "fallback" as const };
const NOW = new Date("2026-11-04T10:00:00Z");

describe("source per field (2.1 / 2.4)", () => {
  const base = { key: "jahreseinkommen", funnelValue: 120000, borrower: 1 } as const;

  it("funnel, chat, a document prefill, a document value taken over, no funnel answer", () => {
    expect(fieldSource(base)).toBe("funnel");
    expect(fieldSource(base, { chat: ["fin.inc"] })).toBe("chat");
    // Kreditnehmer 2's income is not Kreditnehmer 1's.
    expect(fieldSource({ ...base, borrower: 2 }, { chat: ["fin.inc"] })).toBe("funnel");
    expect(fieldSource(base, { src: { "fin.inc": { doc: "Lohnausweis 2025", unsure: false } } })).toBe("dokument");
    expect(fieldSource({ ...base, customerChoice: { value: 100000, chosenSource: "document", at: "t", original: 120000 } }, { chat: ["fin.inc"] })).toBe("dokument");
    expect(fieldSource({ key: "geburtsdatum", funnelValue: null, borrower: 1 })).toBe("dokument");
  });

  it("the Eigenmittel total: chat when one source came from the chat, dokument only when every entered one was prefilled", () => {
    const em = { key: "eigenmittel_total", funnelValue: 300000 } as const;
    expect(fieldSource(em, { chat: ["em.s3a"] })).toBe("chat");
    expect(fieldSource(em, { src: { "em.spar": { doc: "Kontoauszug", unsure: false } } })).toBe("dokument");
    expect(fieldSource(em, {})).toBe("funnel");
  });

  it("in the JSON: every field has it, a chat request says «chat» where the chat answered", () => {
    const state = kaufState();
    const p = v5Payload(state, { signed: true, hypo: { bewertung: false, transcript: "…" } });
    p.v3.hypo = { ...p.v3.hypo, answered: ["fin.kaufpreis", "txt.plz", "chat.bank", "<script>"] };
    const json = JSON.parse(abgleichCaseField(p, RULES, NOW)!);
    expect(json.entry_channel).toBe("chat");
    for (const f of json.fields) expect(["funnel", "dokument", "chat"]).toContain(f.source);
    expect(json.fields.find((f: any) => f.key === "kaufpreis").source).toBe("chat");
    expect(json.fields.find((f: any) => f.key === "objekt_adresse").source).toBe("chat");
    expect(json.fields.find((f: any) => f.key === "jahreseinkommen").source).toBe("funnel");
  });
});

describe("documents[] (2.2)", () => {
  it("every requirement of the list: needed, received, the stored name, the Re-Upload key", () => {
    const state = kaufState();
    const p = v5Payload(state, { signed: true, missing: ["grundbuch"] });
    const json = JSON.parse(abgleichCaseField(p, RULES, NOW)!);
    const list = reqList(state);
    expect(json.documents.filter((d: any) => d.requirement)).toHaveLength(list.length);

    const lohn = list.find((i) => i.id === "lohnausweise")!;
    expect(json.documents.find((d: any) => d.requirement === lohn.instanceId)).toEqual({
      typ: lohn.def.shortName,
      requirement: lohn.instanceId,
      code: lohn.code,
      label: expect.objectContaining({ de: expect.stringContaining("Lohnausweis"), en: expect.any(String), fr: expect.any(String), it: expect.any(String) }),
      person: "Lea Muster",
      benoetigt: true,
      erhalten: true,
      datei: `${CASE_NO}_doc-${lohn.instanceId}-0.pdf`,
      status: "ok",
    });
    expect(json.documents.find((d: any) => d.requirement === "grundbuch")).toMatchObject({ benoetigt: true, erhalten: false, datei: null, status: "missing" });
    expect(json.documents.find((d: any) => d.requirement === SIGNATURE_REQUIREMENT_ID)).toMatchObject({ typ: "Auskunftsermaechtigung", code: "P0", erhalten: true, status: "ok" });
  });

  it("a file outside the list: not needed, received, with its category", () => {
    const state = kaufState();
    const p = v5Payload(state, { signed: true });
    p.v3Completion.files.push({
      documentId: "x1",
      originalName: "leasing.pdf",
      storedName: `${CASE_NO}_01_ZUSATZ_Leasingvertrag_Muster-Lea_2024-06-05.pdf`,
      url: null,
      instanceId: null,
      requirementId: null,
      extraKind: "surplus",
      removed: false,
      analysis: { status: "done", docTypeId: "leasing", docTypeLabel: "Leasingvertrag", confidence: 0.9, requirementId: "leasing", fields: {} },
    });
    const json = JSON.parse(abgleichCaseField(p, RULES, NOW)!);
    // Befund 2: a Leasingvertrag the answers did not ask for is «relevant», not «surplus».
    expect(json.documents.find((d: any) => d.datei?.includes("Leasingvertrag"))).toMatchObject({
      typ: "Leasingvertrag",
      requirement: null,
      benoetigt: false,
      erhalten: true,
      status: "extra",
      kategorie: "relevant",
      hinweis: "Von den Antworten nicht verlangt – fallrelevant, bitte prüfen.",
    });
  });

  it("a further copy of a document already there stays «surplus»", () => {
    const state = kaufState();
    const p = v5Payload(state, { signed: true });
    const lohn = reqList(state).find((i) => i.id === "lohnausweise")!;
    p.v3Completion.files.push({
      documentId: "x2",
      originalName: "lohn-kopie.pdf",
      storedName: `${CASE_NO}_01_ZUSATZ_Lohnausweis_Muster-Lea_2025-12-31.pdf`,
      url: null,
      instanceId: null,
      requirementId: lohn.id,
      extraKind: "surplus",
      removed: false,
      analysis: { status: "done", docTypeId: "lohnausweise", docTypeLabel: "Lohnausweis", confidence: 0.9, requirementId: "lohnausweise", fields: {} },
    });
    const json = JSON.parse(abgleichCaseField(p, RULES, NOW)!);
    expect(json.documents.find((d: any) => d.datei === `${CASE_NO}_01_ZUSATZ_Lohnausweis_Muster-Lea_2025-12-31.pdf`)).toMatchObject({ kategorie: "surplus", benoetigt: false });
  });
});

describe("the signature as a field (Befund 1: uncertain, never blocking)", () => {
  const unsignedPayload = () => {
    const p = v5Payload(kaufState(), { signed: true });
    for (const f of p.v3Completion.files) if (f.requirementId === SIGNATURE_REQUIREMENT_ID) f.analysis = { ...f.analysis, fields: { Unterschrift: { value: "fehlt", confidence: 0.62 } } };
    return p;
  };

  it("a doubted copy: «to_check» with the AI's note, counted in the summary, the document flagged", () => {
    const json = JSON.parse(abgleichCaseField(unsignedPayload(), RULES, NOW)!);
    const sig = json.fields.find((f: any) => f.key === SIGNATURE_FIELD_KEY);
    expect(sig).toMatchObject({
      label: { de: "Unterschrift Auskunftsermächtigung", en: "Signature on the authorisation", fr: expect.any(String), it: expect.any(String) },
      funnelValue: null,
      source: "dokument",
      extracted: [{ docType: "auskunftsermaechtigung", value: "fehlt", confidence: 0.62, ampel: "yellow", field: "Unterschrift", role: "primary" }],
      result: "to_check",
      explanation: { de: "AI-Hinweis: Unterschrift nicht erkannt – manuell prüfen", en: expect.any(String), fr: expect.any(String), it: expect.any(String) },
    });
    const plain = JSON.parse(abgleichCaseField(v5Payload(kaufState(), { signed: true }), RULES, NOW)!);
    expect(json.summary.toCheck).toBe(plain.summary.toCheck + 1);
    expect(json.documents.find((d: any) => d.requirement === SIGNATURE_REQUIREMENT_ID)).toMatchObject({
      erhalten: true,
      status: "ok",
      unsicher: true,
      hinweis: "AI-Hinweis: Unterschrift nicht erkannt – manuell prüfen",
    });
  });

  it("a good copy: «ok»; no copy («später»): no field, the document not received", () => {
    const good = JSON.parse(abgleichCaseField(v5Payload(kaufState(), { signed: true }), RULES, NOW)!);
    expect(good.fields.find((f: any) => f.key === SIGNATURE_FIELD_KEY)).toMatchObject({ result: "ok" });
    const later = JSON.parse(abgleichCaseField(v5Payload(kaufState({ sig: { choice: "later", at: "2026-10-15T09:00:00.000Z", method: "upload" } }), { signed: false }), RULES, NOW)!);
    expect(later.fields.find((f: any) => f.key === SIGNATURE_FIELD_KEY)).toBeUndefined();
    expect(later.documents.find((d: any) => d.requirement === SIGNATURE_REQUIREMENT_ID)).toMatchObject({ benoetigt: true, erhalten: false, datei: null });
  });

  it("buildAbgleichState without documents or a signature stays as before, with an empty list", () => {
    const state = kaufState();
    const lohnInst = reqList(state).find((i) => i.id === "lohnausweise")!.instanceId;
    const lohn: V3Analysis = { status: "done", docTypeId: "lohnausweise", docTypeLabel: "Lohnausweis", confidence: 0.95, requirementId: "lohnausweise", fields: { Bruttolohn: { value: "CHF 200'000", confidence: 0.95 } } };
    const docs: AbgleichDoc[] = [{ id: "d", instanceId: lohnInst, analysis: lohn }];
    const result = evaluateAbgleich({ state, docs });
    const json = buildAbgleichState({ result, submittedAt: NOW, mode: "schnell", role: "kunde", rulesFrom: "fallback", borrowerIds: ["b1"] });
    expect(json.documents).toEqual([]);
    expect(json.summary).toEqual(result.summary);
    expect(json.fields.some((f) => f.key === SIGNATURE_FIELD_KEY)).toBe(false);
  });
});
