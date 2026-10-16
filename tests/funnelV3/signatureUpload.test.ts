/**
 * «Unterzeichnet hochladen» (Handover 6 «eigener Upload-Button, unabhängig vom Dateinamen»):
 * the block's file goes through the funnel's upload pipeline against a fake server and is
 * placed on P0 at once; the AI's reading decides «erhalten» / «Unterschrift fehlt».
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { __resetUploadPipeline, startPlacementSync, addPickedFiles } from "@/lib/funnel-v3/upload";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { addSignatureCopy, downloadAuthorization } from "@/components/funnel-v3/finish/signatureActions";
import { gerberState } from "./gerberCase";

const S = () => useFunnelV3.getState();
const flush = async (n = 40) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

let docSeq = 0;
let analysisFor: (name: string) => Partial<V3Analysis> = () => ({});
const names = new Map<string, string>();
const calls: { url: string; body?: any }[] = [];

(globalThis as any).fetch = jest.fn(async (url: any, init: any = {}) => {
  const u = String(url);
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  calls.push({ url: u, body });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (u === "/api/upload-doc/start") return json({ uploadUrl: `https://upload.example/${encodeURIComponent(body.fileName)}`, folderId: "folder-1" });
  if (u.startsWith("https://upload.example/")) return json({ id: `item-${docSeq}` }, 201);
  if (u === "/api/upload-doc/finalize") {
    const id = `doc-${++docSeq}`;
    names.set(id, body.originalFileName);
    return json({ success: true, documentId: id, webUrl: `https://sp.example/${id}`, contentHash: `h-${body.originalFileName}` });
  }
  if (u === "/api/document-intelligence/analyse") {
    const a = analysisFor(names.get(body.documentId)!);
    return json({ success: true, analysis: { status: "done", docTypeId: "vollmacht", docTypeLabel: "vollmacht", confidence: 0.93, requirementId: "vollmacht", fields: {}, contentHash: `h-${names.get(body.documentId)}`, ...a } });
  }
  if (u === "/api/funnel/authorization") return json({ error: "boom" }, 500);
  return json({ error: "unexpected" }, 500);
});

const file = (name: string) => new File(["%PDF-1.4 signed"], name, { type: "application/pdf" });
const summary = () => documentsSummary({ ...S(), files: S().files });

beforeEach(() => {
  __resetUploadPipeline();
  S().reset();
  const st = gerberState();
  useFunnelV3.setState({ ans: st.ans, txt: st.txt, borrowers: st.borrowers, em: st.em, fin: st.fin });
  calls.length = 0;
  docSeq = 0;
  startPlacementSync();
});

describe("addSignatureCopy", () => {
  it("places any file name on P0 at once; the signed form with the borrower's name is «erhalten»", async () => {
    analysisFor = () => ({ fields: { Unterschrift: { value: "vorhanden", confidence: 0.9 }, Vollmachtgeber: { value: "Gerber Gary", confidence: 0.9 } } });
    const res = addSignatureCopy(useFunnelV3, file("IMG_4711.pdf"));
    expect(res.ok).toBe(true);
    const f = S().files[0];
    expect(f).toMatchObject({ name: "IMG_4711.pdf", instanceId: "vollmacht", assignedByUser: true });
    expect(f.audit?.at(-1)?.key).toBe("docs.audit.assigned");
    expect(summary().signature.status).toBe("analysing");
    await flush();
    expect(S().files[0]).toMatchObject({ uploadState: "uploaded", analysisState: "done", instanceId: "vollmacht", assignedByUser: true });
    expect(summary().signature).toMatchObject({ status: "received", canFinish: true });
  });

  it("unsigned → «Unterschrift fehlt»; a new copy replaces the hand-placed one", async () => {
    analysisFor = (n) => ({ fields: { Unterschrift: { value: n.includes("v2") ? "vorhanden" : "fehlt", confidence: 0.9 } } });
    addSignatureCopy(useFunnelV3, file("auskunft.pdf"));
    await flush();
    expect(summary().signature).toMatchObject({ status: "unsigned", problems: ["signature"], canFinish: false });

    addSignatureCopy(useFunnelV3, file("auskunft-v2.pdf"));
    await flush();
    const [first, second] = S().files;
    expect(second).toMatchObject({ instanceId: "vollmacht", assignedByUser: true });
    // The old copy is no longer the block's; placement keeps it in the folder, not on P0.
    expect(first.assignedByUser).toBe(false);
    expect(first.instanceId).not.toBe("vollmacht");
    expect(summary().signature.status).toBe("received");
  });

  it("another document through the block's button: «form»", async () => {
    analysisFor = () => ({ docTypeId: "lohnausweise", requirementId: "lohnausweise" });
    addSignatureCopy(useFunnelV3, file("Lohnausweis.pdf"));
    await flush();
    expect(S().files[0].instanceId).toBe("vollmacht");
    expect(summary().signature).toMatchObject({ status: "unsigned", problems: ["form"] });
  });

  it("a file already dropped into the folder is placed, not uploaded twice", async () => {
    analysisFor = () => ({ docTypeId: null, requirementId: null, extraKind: "unknown", status: "done" as const });
    addPickedFiles([{ file: file("scan.pdf") }]);
    await flush();
    expect(S().files[0].instanceId).toBeFalsy();
    const before = calls.filter((c) => c.url === "/api/upload-doc/start").length;
    addSignatureCopy(useFunnelV3, file("scan.pdf"));
    await flush();
    expect(calls.filter((c) => c.url === "/api/upload-doc/start").length).toBe(before);
    expect(S().files).toHaveLength(1);
    // Not recognised but placed by hand: counts (V21).
    expect(summary().signature.status).toBe("received");
  });

  it("refuses what the pipeline refuses", () => {
    expect(addSignatureCopy(useFunnelV3, new File(["x"], "notes.docx"))).toEqual({ ok: false, reason: "type" });
    expect(addSignatureCopy(useFunnelV3, new File([], "empty.pdf"))).toEqual({ ok: false, reason: "empty" });
    expect(S().files).toEqual([]);
  });
});

describe("downloadAuthorization", () => {
  it("posts the prefill to the route and fails visibly when it fails", async () => {
    const data = { lang: "de" as const, signers: [{ vor: "Gary", nach: "Gerber" }], objekt: "8820 Wädenswil", zweck: "Ablösung" as const };
    await expect(downloadAuthorization(data)).rejects.toThrow("HTTP 500");
    expect(calls.at(-1)).toEqual({ url: "/api/funnel/authorization", body: data });
  });
});
