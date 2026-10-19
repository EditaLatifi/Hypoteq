/**
 * HYPOTEQ 19.10. A.4 «nichts blockiert je den Nutzer» and E.6 «Konfidenzwerte weiterhin pro
 * Feld/Dokument ins JSON» (DECISIONS V67): no AI verdict on a document stops «Weiter» or the
 * closing, and Dokumenten_Check_State__c keeps the confidence of every placed document and of
 * every extracted field. The Salesforce API is a fake — nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "unknown" })),
}));

import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { validateScreen } from "@/lib/funnel-v3/validate";
import { finishGate } from "@/components/funnel-v3/logic";
import { SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { kaufState, v5Payload } from "./v5Fixtures";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("E.6: the confidences stay in Dokumenten_Check_State__c", () => {
  it("per document (files[].confidence, audit) and per field (fields[].confidence)", async () => {
    const p = v5Payload(kaufState());
    const lohn = p.v3Completion.files.find((f: any) => f.requirementId === "lohnausweise");
    expect(lohn).toBeDefined();
    lohn.analysis = {
      ...lohn.analysis,
      confidence: 0.87,
      fields: { Bruttolohn: { value: "120000", confidence: 0.93 }, Arbeitgeber: { value: "Muster AG", confidence: 0.71 }, Leer: { value: "", confidence: 0.2 } },
    };
    const cases: any[] = [];
    await syncFunnelStepsToSalesforce(p, {
      findAccountByEmail: async () => null,
      createAccount: async () => ({ id: "001A" }),
      updatePersonAccount: async () => ({}),
      findAccountByName: async () => ({ Id: "001HYPOTEQ" }),
      createOrUpdateCase: async (d: any) => {
        cases.push(d);
        return { id: "500CASE" };
      },
    });
    const json = JSON.parse(cases[0].Dokumenten_Check_State__c);
    const req = json.requirements.find((r: any) => (r.requirementId ?? r.id) === "lohnausweise");
    expect(req.files[0]).toMatchObject({ confidence: 0.87 });
    // Empty values are left out; every value keeps its own confidence.
    expect(req.fields).toEqual([
      { key: "Bruttolohn", value: "120000", confidence: 0.93 },
      { key: "Arbeitgeber", value: "Muster AG", confidence: 0.71 },
    ]);
    expect(req.audit[0].text).toContain("Konfidenz 87 %");
    // Every other placed document keeps its document confidence too.
    for (const r of json.requirements.filter((x: any) => x.files?.length)) for (const f of r.files) expect(typeof f.confidence).toBe("number");
  });
});

describe("A.4: no AI verdict blocks", () => {
  const file = (id: string, analysis: Partial<V3Analysis> | null, over: Partial<FileEntry> = {}): FileEntry => ({
    id,
    name: `${id}.pdf`,
    size: 1000,
    uploadState: "uploaded",
    documentId: `doc-${id}`,
    analysisState: analysis?.status === "failed" ? "failed" : "done",
    analysis: analysis ? ({ status: "done", docTypeId: null, docTypeLabel: null, confidence: 0.4, requirementId: null, fields: {}, ...analysis } as V3Analysis) : undefined,
    ...over,
  });

  it("«Weiter» checks the answers only, never the documents", () => {
    const s = kaufState();
    for (const screen of ["upload", "abschluss"] as const) expect(validateScreen(screen, s)).toEqual({});
  });

  it("unrecognised, unreadable and outdated documents leave the closing open", () => {
    const s = kaufState();
    const files = [
      file("unknown", { docTypeId: null }),
      file("unreadable", { status: "failed" }),
      file("old", { docTypeId: "grundbuch", docTypeLabel: "Grundbuchauszug", confidence: 0.95, outdated: true, outdatedReason: "älter als 6 Monate" }),
      file("sig", { docTypeId: SIGNATURE_REQUIREMENT_ID, docTypeLabel: "vollmacht", confidence: 0.9 }, { instanceId: SIGNATURE_REQUIREMENT_ID, assignedByUser: true }),
    ];
    const summary = documentsSummary({ ans: s.ans, borrowers: s.borrowers, txt: s.txt, em: s.em, info: s.info, mode: "begleitet", sig: s.sig, files });
    expect(summary.signature).toMatchObject({ status: "received", canFinish: true });
    expect(finishGate(summary.signature).enabled).toBe(true);
    // The outdated one is shown as such, it does not hold anything up.
    expect(summary.status.requirements.find((r) => r.instance.id === "grundbuch")?.state).toBe("outdated");
  });

  it("an unsigned authorisation does not block either: «Trotzdem einreichen» (E.4) or «Später nachreichen»", () => {
    const s = kaufState();
    const unsigned = file("sig", { docTypeId: SIGNATURE_REQUIREMENT_ID, fields: { Unterschrift: { value: "fehlt", confidence: 0.9 } } as any }, { instanceId: SIGNATURE_REQUIREMENT_ID, assignedByUser: true });
    const base = { ans: s.ans, borrowers: s.borrowers, txt: s.txt, em: s.em, info: s.info, files: [unsigned] };
    expect(finishGate(documentsSummary({ ...base, sig: { choice: "uploaded", at: "x", method: "upload" } }).signature).enabled).toBe(false);
    expect(finishGate(documentsSummary({ ...base, sig: { choice: "uploaded", at: "x", method: "upload", override: true, overrideAt: "y" } }).signature).enabled).toBe(true);
    expect(finishGate(documentsSummary({ ...base, sig: { choice: "later", at: "x", method: "upload" } }).signature).enabled).toBe(true);
  });
});
