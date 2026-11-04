/**
 * HYPOTEQ 03.11.2026 Befund 3 (DECISIONS V105): a floor plan inside the Verkaufsdokumentation is
 * recognised — the document fulfils «Bau- / Grundrisspläne» (and «Fotos») when they have no file
 * of their own, on the client, on the server and on the Case flags. Pure; no Salesforce.
 */
import { describe, it, expect } from "@jest/globals";
import { requirementStatus, type UploadedFile } from "@/lib/funnel-v3/requirementStatus";
import { embeddedRequirements, toUploadedFiles, type FileEntry } from "@/lib/funnel-v3/files";
import { reqList } from "@/lib/funnel-v3/requirements";
import { v3DocumentCaseFields, v3DocumentStatus } from "@/lib/funnel-v3/completion";
import { buildV3Instructions } from "@/components/documentIntelligence/v3/prompt";
import { kaufState, v5Payload } from "./v5Fixtures";

const brochure = (fields: Record<string, string>) => ({ status: "done" as const, docTypeId: "verkaufsdoku", docTypeLabel: "Verkaufsdokumentation", confidence: 0.95, requirementId: "verkaufsdoku", fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.9 }])) });

describe("what a document contains", () => {
  it("«ja» per field, only for the Verkaufsdokumentation", () => {
    expect(embeddedRequirements(brochure({ "Grundriss enthalten": "ja", "Fotos enthalten": "Ja, 12 Fotos" }))).toEqual(["stwe_plan", "fotos"]);
    expect(embeddedRequirements(brochure({ "Grundriss enthalten": "nein", "Fotos enthalten": "" }))).toEqual([]);
    expect(embeddedRequirements({ ...brochure({ "Grundriss enthalten": "ja" }), docTypeId: "grundbuch" })).toEqual([]);
    expect(embeddedRequirements(null)).toEqual([]);
  });

  it("the extraction asks for it", () => {
    const text = buildV3Instructions();
    expect(text).toContain("«Grundriss enthalten»");
    expect(text).toContain("«Fotos enthalten»");
  });
});

describe("the requirement status", () => {
  const list = reqList(kaufState());
  const vd: UploadedFile = { fileId: "vd", requirementId: "verkaufsdoku", status: "done", embeds: ["stwe_plan"] };

  it("an empty «Grundrisspläne» is fulfilled by the brochure that contains them", () => {
    const s = requirementStatus(list, [vd]);
    expect(s.requirements.find((r) => r.instance.id === "stwe_plan")).toMatchObject({ state: "ok", fileIds: ["vd"], embedded: true });
    expect(s.requirements.find((r) => r.instance.id === "verkaufsdoku")).toMatchObject({ state: "ok", fileIds: ["vd"] });
    expect(s.requirements.find((r) => r.instance.id === "fotos")?.state).toBe("missing");
    expect(s.dokFlags.Dok_Grundrissplaene__c).toBe(true);
  });

  it("a floor plan of its own wins; a brochure outside the list or still being read covers nothing", () => {
    const own: UploadedFile = { fileId: "plan", requirementId: "stwe_plan", status: "done" };
    expect(requirementStatus(list, [vd, own]).requirements.find((r) => r.instance.id === "stwe_plan")).toMatchObject({ fileIds: ["plan"] });
    expect(requirementStatus(list, [{ ...vd, requirementId: null, extraKind: "surplus" }]).requirements.find((r) => r.instance.id === "stwe_plan")?.state).toBe("missing");
    expect(requirementStatus(list, [{ ...vd, status: "analysing" }]).requirements.find((r) => r.instance.id === "stwe_plan")?.state).toBe("missing");
  });

  it("the store's files carry it", () => {
    const f = { id: "vd", name: "Expose.pdf", size: 1, uploadState: "uploaded", analysisState: "done", instanceId: "verkaufsdoku", analysis: brochure({ "Grundriss enthalten": "ja" }) } as FileEntry;
    expect(toUploadedFiles([f])[0].embeds).toEqual(["stwe_plan"]);
  });
});

describe("on the server and the Case", () => {
  it("v3DocumentStatus and Dok_Grundrissplaene__c follow the brochure", () => {
    const p = v5Payload(kaufState(), { signed: true, missing: ["stwe_plan"] });
    for (const f of p.v3Completion.files) if (f.requirementId === "verkaufsdoku") f.analysis = brochure({ "Grundriss enthalten": "ja" });
    const status = v3DocumentStatus(p)!.status;
    expect(status.requirements.find((r) => r.instance.id === "stwe_plan")).toMatchObject({ state: "ok", embedded: true });
    expect(v3DocumentCaseFields(p)!.Dok_Grundrissplaene__c).toBe(true);

    const without = v5Payload(kaufState(), { signed: true, missing: ["stwe_plan"] });
    expect(v3DocumentCaseFields(without)!.Dok_Grundrissplaene__c).toBe(false);
  });
});
