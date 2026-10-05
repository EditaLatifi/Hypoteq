/**
 * The v3 Nachreich page's client side: the funnel's upload pipeline bound to a page-local
 * store, placing files only on the requirements the inquiry still misses (fake server).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { createFunnelV3Store, useFunnelV3 } from "@/lib/funnel-v3/store";
import { EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { __resetUploadPipeline, addPickedFiles, bindUploadPipeline, removeFile, settleUploads } from "@/lib/funnel-v3/upload";
import { nachreichDocuments, nachreichInstances } from "@/lib/funnel-v3/nachreichPage";
import { nachreichV3View } from "@/lib/funnel-v3/nachreich";
import { existingRows, inquiryRow, INQUIRY } from "./nachreichFixtures";

const flush = async (n = 40) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const calls: { url: string; method: string; body?: any }[] = [];
const namesByDoc = new Map<string, string>();
let docSeq = 0;
const Y = new Date().getUTCFullYear();
const ANALYSES: Record<string, Partial<V3Analysis>> = {
  "IMG_2041.pdf": { docTypeId: "fotos" },
  "Lohnausweis alt.pdf": { docTypeId: "lohnausweise", docDate: String(Y - 3), personName: "Gerber Gary" },
  "ID Anna.pdf": { docTypeId: "id", personName: "Muster Anna" },
  "Grundbuch.pdf": { docTypeId: "grundbuch", docDate: `${Y}-01-02` },
};

const realFetch = (globalThis as any).fetch;
beforeEach(() => {
  __resetUploadPipeline();
  calls.length = 0;
  namesByDoc.clear();
  docSeq = 0;
  (globalThis as any).fetch = jest.fn(async (url: any, init: any = {}) => {
    const u = String(url);
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method, body });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    if (u === "/api/upload-doc/start") return json({ uploadUrl: `https://upload.example/${encodeURIComponent(body.fileName)}`, folderId: body.folderId || "NEW" });
    if (u.startsWith("https://upload.example/")) return json({ id: `item-${decodeURIComponent(u.split("/").pop()!)}` }, 201);
    if (u === "/api/upload-doc/finalize") {
      const id = `held-${++docSeq}`;
      namesByDoc.set(id, body.originalFileName);
      return json({ success: true, documentId: id, webUrl: `https://sp.example/${id}`, contentHash: `h-${body.originalFileName}` });
    }
    if (u === "/api/document-intelligence/analyse") {
      const a = ANALYSES[namesByDoc.get(body.documentId)!];
      if (!a) return json({ success: false, analysis: { status: "failed", docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, extraKind: "unknown", fields: {} } });
      return json({ success: true, analysis: { status: "done", docTypeLabel: a.docTypeId, confidence: 0.95, requirementId: a.docTypeId, fields: {}, ...a } });
    }
    if (u.startsWith("/api/upload-doc/") && method === "DELETE") return json({ success: true });
    return json({ error: "unexpected" }, 500);
  });
});
afterEach(() => {
  (globalThis as any).fetch = realFetch;
  __resetUploadPipeline();
});

const pdf = (name: string) => ({ file: new File(["%PDF-1.4 " + name], name, { type: "application/pdf" }) });

function page() {
  const view = nachreichV3View(inquiryRow(), existingRows())!;
  const store = createFunnelV3Store({ submissionId: view.submissionId, sharepointFolderId: view.folderId, txt: { ...EMPTY_TEXTS, mail: view.email ?? "" } });
  const instances = nachreichInstances(view.missing);
  const unbind = bindUploadPipeline(store, { instances: () => instances });
  return { view, store, instances, unbind };
}

describe("Nachreich page pipeline", () => {
  it("uploads into the inquiry's folder, analyses v3, places only on what is missing", async () => {
    const { store, instances } = page();
    const before = JSON.stringify(useFunnelV3.getState().files);
    addPickedFiles(["IMG_2041.pdf", "Lohnausweis alt.pdf", "ID Anna.pdf", "Grundbuch.pdf", "Notiz.pdf"].map(pdf));
    await flush();
    await settleUploads(0);
    await flush();

    // Filed under the inquiry: its id as submission, its folder, its address.
    const start = calls.find((c) => c.url === "/api/upload-doc/start")!;
    expect(start.body).toMatchObject({ inquiryId: INQUIRY, folderId: "FOLDER", email: "gary.gerber@example.ch" });
    expect(calls.find((c) => c.url === "/api/upload-doc/finalize")!.body).toMatchObject({ submissionId: INQUIRY, folderId: "FOLDER" });
    expect(calls.filter((c) => c.url === "/api/document-intelligence/analyse").every((c) => c.body.v3 === true && c.body.submissionId === INQUIRY)).toBe(true);

    const docs = nachreichDocuments(store.getState().files, instances);
    const where = (name: string) => docs.files.find((f) => f.name === name)!;
    expect(where("IMG_2041.pdf").instanceId).toBe("fotos");
    expect(where("Lohnausweis alt.pdf").instanceId).toBe("lohnausweise#b1");
    expect(where("ID Anna.pdf").instanceId).toBe("id#b2");
    // A Grundbuch is not missing on this inquiry: kept as an extra, not counted.
    expect(where("Grundbuch.pdf").instanceId ?? null).toBeNull();
    expect(docs.placements.get(where("Grundbuch.pdf").id)).toMatchObject({ extraKind: "surplus", reason: "offList" });
    expect(docs.placements.get(where("Notiz.pdf").id)).toMatchObject({ extraKind: "unknown" });

    const byInstance = new Map(docs.status.requirements.map((r) => [r.instance.instanceId, r.state]));
    expect(byInstance.get("fotos")).toBe("ok");
    expect(byInstance.get("lohnausweise#b1")).toBe("ok"); // the one missing Lohnausweis
    expect(byInstance.get("lohnausweise#b2")).toBe("missing");

    const sent = docs.submittedDocuments();
    expect(sent.find((d) => d.instanceId === "fotos")).toMatchObject({ requirementId: "fotos" });
    expect(sent.map((d) => d.instanceId)).toEqual(expect.arrayContaining(["fotos", "lohnausweise#b1", "id#b2"]));
    expect(sent.every((d) => d.documentId.startsWith("held-"))).toBe(true);

    // The funnel's own store (and its sessionStorage copy) is untouched.
    expect(JSON.stringify(useFunnelV3.getState().files)).toBe(before);
  });

  it("a second Lohnausweis for a requirement that needed one is surplus", async () => {
    const { store, instances } = page();
    ANALYSES["Lohnausweis alt 2.pdf"] = { docTypeId: "lohnausweise", docDate: String(Y - 3), personName: "Gerber Gary", confidence: 0.5 };
    addPickedFiles([pdf("Lohnausweis alt.pdf"), pdf("Lohnausweis alt 2.pdf")]);
    await flush();
    await settleUploads(0);
    await flush();
    const docs = nachreichDocuments(store.getState().files, instances);
    expect(docs.files.filter((f) => f.instanceId === "lohnausweise#b1")).toHaveLength(1);
    expect(docs.files.filter((f) => !f.instanceId && docs.placements.get(f.id)?.reason === "full")).toHaveLength(1);
  });

  it("removing a file takes it back from the held upload; unbinding restores the funnel binding", async () => {
    const { store, unbind } = page();
    addPickedFiles([pdf("IMG_2041.pdf")]);
    await flush();
    const f = store.getState().files[0];
    removeFile(f.id);
    expect(store.getState().files).toEqual([]);
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes(`submissionId=${INQUIRY}`))).toBe(true);
    unbind();
    // Back on the funnel store: a new file lands there, not on the page store.
    addPickedFiles([pdf("IMG_2041.pdf")]);
    expect(useFunnelV3.getState().files.length).toBe(1);
    expect(store.getState().files).toEqual([]);
    useFunnelV3.getState().reset();
  });
});
