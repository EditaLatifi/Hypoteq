/**
 * Recognition of the signed Auskunftsermächtigung (Handover 6 «richtiges Formular, Unterschrift
 * vorhanden, Name passt»; DECISIONS V21, V38) — the additions to lib/funnel-v3/signature.ts.
 */
import { describe, it, expect } from "@jest/globals";
import { signatureProblems, signatureView, type SignatureFile } from "@/lib/funnel-v3/signature";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { gerberFiles, gerberState } from "./gerberCase";

const SIGNER = { kind: "borrower" as const, first: "Gary", last: "Gerber", display: "Gary Gerber" };
const an = (docTypeId: string | null, fields: Record<string, string> = {}, status: "done" | "failed" = "done"): V3Analysis => ({
  status,
  docTypeId,
  docTypeLabel: docTypeId,
  confidence: 0.9,
  requirementId: docTypeId,
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.9 }])),
});
const onP0 = (a: V3Analysis | null, over: Partial<SignatureFile> = {}): SignatureFile => ({ fileId: "s", instanceId: "vollmacht", analysis: a, assignedByUser: true, ...over });

describe("the right form", () => {
  it("another document placed on P0 with the block's button: «form», not received", () => {
    expect(signatureProblems(an("lohnausweise", { Unterschrift: "vorhanden" }), SIGNER)).toEqual(["form"]);
    expect(signatureView([onP0(an("id"))], null, SIGNER)).toMatchObject({ status: "unsigned", problems: ["form"], canFinish: false });
  });

  it("an unrecognised or unreadable copy placed by hand still counts (V21)", () => {
    expect(signatureView([onP0(an(null))], null, SIGNER).status).toBe("received");
    expect(signatureView([onP0(an(null, {}, "failed"))], null, SIGNER).status).toBe("received");
  });

  it("the signed form with the borrower's name: received", () => {
    expect(signatureView([onP0(an("vollmacht", { Unterschrift: "vorhanden", Vollmachtgeber: "Gerber Gary; Muster Anna" }))], null, SIGNER).status).toBe("received");
  });
});

describe("a failed upload on P0", () => {
  it("is not a copy: the block stays open, «später» still closes", () => {
    expect(signatureView([onP0(null, { failed: true })], null, SIGNER)).toMatchObject({ status: "missing", fileIds: [], canFinish: false });
    expect(signatureView([onP0(null, { failed: true })], { choice: "later", at: "2026-10-15T08:00:00.000Z", method: "upload" }, SIGNER)).toMatchObject({ status: "later", canFinish: true });
  });

  it("documentsSummary passes the upload state on", () => {
    const st = gerberState();
    const files = gerberFiles().filter((f) => f.analysis?.docTypeId !== "vollmacht");
    const failed = { id: "sig", name: "scan.jpg", size: 10, uploadState: "failed" as const, analysisState: "pending" as const, instanceId: "vollmacht", assignedByUser: true };
    expect(documentsSummary({ ...st, files: [...files, failed] }).signature.status).toBe("missing");
  });
});
