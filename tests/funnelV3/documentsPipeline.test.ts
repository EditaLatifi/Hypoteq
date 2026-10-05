/**
 * Store file actions and the client upload pipeline (lib/funnel-v3/upload.ts) against a fake
 * server: start → chunk PUT → finalize → analyse v3 → placement; retry; remove → DELETE.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import {
  __resetUploadPipeline,
  acceptOutdated,
  addPickedFiles,
  assignFile,
  filesFromDataTransfer,
  isSystemFile,
  keepFile,
  removeFile,
  resumePipeline,
  retryFile,
  saveEdits,
  screenFiles,
  settleUploads,
  startPlacementSync,
  MAX_FILE_BYTES,
} from "@/lib/funnel-v3/upload";
import { GERBER_ANSWERS } from "./helpers";

const S = () => useFunnelV3.getState();
const flush = async (n = 30) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---- fake server ---------------------------------------------------------------------------
let docSeq = 0;
let failStart = 0;
let analysisFor: (name: string) => Partial<V3Analysis> | null = () => null;
const calls: { url: string; method: string; body?: any }[] = [];
const namesByDoc = new Map<string, string>();
let pendingName = "";

(globalThis as any).fetch = jest.fn(async (url: any, init: any = {}) => {
  const u = String(url);
  const method = init.method || "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  calls.push({ url: u, method, body });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (u === "/api/upload-doc/start") {
    if (failStart > 0) {
      failStart--;
      return json({ error: "boom" }, 500);
    }
    pendingName = body.fileName;
    return json({ uploadUrl: `https://upload.example/${encodeURIComponent(body.fileName)}`, folderId: "folder-1" });
  }
  if (u.startsWith("https://upload.example/")) return json({ id: `item-${decodeURIComponent(u.split("/").pop()!)}` }, 201);
  if (u === "/api/upload-doc/finalize") {
    const id = `doc-${++docSeq}`;
    namesByDoc.set(id, body.originalFileName || pendingName);
    return json({ success: true, documentId: id, webUrl: `https://sp.example/${id}`, contentHash: `h-${body.originalFileName}` });
  }
  if (u === "/api/document-intelligence/analyse") {
    expect(body.v3).toBe(true);
    const name = namesByDoc.get(body.documentId)!;
    const a = analysisFor(name);
    if (!a) return json({ success: false, analysis: { status: "failed", docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, extraKind: "unknown", fields: {} } });
    return json({
      success: true,
      analysis: { status: "done", docTypeLabel: a.docTypeId, confidence: 0.95, requirementId: a.docTypeId, fields: {}, contentHash: `h-${name}`, ...a },
    });
  }
  if (u.startsWith("/api/upload-doc/") && method === "DELETE") return json({ success: true });
  return json({ error: "unexpected" }, 500);
});

const pdf = (name: string, bytes = "%PDF-1.4") => ({ file: new File([bytes], name, { type: "application/pdf" }) });

beforeEach(() => {
  __resetUploadPipeline();
  S().reset();
  calls.length = 0;
  docSeq = 0;
  failStart = 0;
  namesByDoc.clear();
  analysisFor = () => null;
  S().setTxt("vor", "Gary");
  S().setTxt("nach", "Gerber");
  S().setTxt("mail", "gary@example.com");
});

describe("store file actions", () => {
  const entry = (id: string): FileEntry => ({ id, name: `${id}.pdf`, size: 1, uploadState: "uploaded", analysisState: "done" });

  it("add, update, remove", () => {
    S().addFiles([entry("a"), entry("b")]);
    S().addFiles([entry("a")]);
    expect(S().files.map((f) => f.id)).toEqual(["a", "b"]);
    S().updateFile("a", { keep: true });
    S().updateFile("a", (f) => ({ name: f.name.toUpperCase() }));
    S().updateFile("zzz", { keep: true });
    expect(S().files[0]).toMatchObject({ id: "a", keep: true, name: "A.PDF" });
    S().dismissSuggestion(["b"]);
    S().removeFile("b");
    expect(S().files.map((f) => f.id)).toEqual(["a"]);
    expect(S().dismissed).toEqual([]);
  });

  it("skipped set and dismissed suggestions", () => {
    S().setSkipped("verkaufsdoku", true);
    S().setSkipped("verkaufsdoku", true);
    expect(S().skipped).toEqual(["verkaufsdoku"]);
    S().setSkipped("verkaufsdoku", false);
    expect(S().skipped).toEqual([]);
    S().dismissSuggestion(["x", "y"]);
    S().dismissSuggestion(["x"]);
    expect(S().dismissed).toEqual(["x", "y"]);
    S().reset();
    expect(S().dismissed).toEqual([]);
  });
});

describe("screening dropped files", () => {
  it("ignores hidden and system files, refuses wrong types, empty and too large files", () => {
    const big = { file: { name: "scan.pdf", size: MAX_FILE_BYTES + 1 } as File };
    const { accepted, rejected } = screenFiles([
      pdf("a.pdf"),
      { file: new File(["x"], "foto.HEIC") },
      { file: new File(["x"], ".DS_Store") },
      { file: new File(["x"], "Thumbs.db") },
      { file: new File(["x"], "~$brief.docx") },
      { file: new File(["x"], "x.pdf") , relativePath: "__MACOSX/x.pdf" },
      { file: new File(["x"], "brief.docx") },
      { file: new File([], "leer.pdf") },
      big,
    ]);
    expect(accepted.map((p) => p.file.name)).toEqual(["a.pdf", "foto.HEIC"]);
    expect(rejected).toEqual([
      { name: "brief.docx", reason: "type" },
      { name: "leer.pdf", reason: "empty" },
      { name: "scan.pdf", reason: "size" },
    ]);
    expect(isSystemFile("desktop.ini")).toBe(true);
  });

  it("walks dropped folders recursively, reading every batch", async () => {
    const fileEntry = (name: string) => ({ isFile: true, isDirectory: false, name, file: (ok: any) => ok(new File(["x"], name)) });
    const dir = (name: string, children: any[], batch = 2) => ({
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => {
        let i = 0;
        return { readEntries: (ok: any) => { const b = children.slice(i, i + batch); i += batch; ok(b); } };
      },
    });
    const tree = dir("Unterlagen", [fileEntry("a.pdf"), dir("Lohn", [fileEntry("2024.pdf"), fileEntry("2025.pdf"), fileEntry("2023.pdf")]), fileEntry("b.png"), dir("__MACOSX", [fileEntry("._a.pdf")])]);
    const dt: any = { items: [{ kind: "file", webkitGetAsEntry: () => tree }, { kind: "file", webkitGetAsEntry: () => fileEntry("solo.pdf") }], files: [] };
    const got = await filesFromDataTransfer(dt);
    expect(got.map((p) => p.relativePath ?? p.file.name)).toEqual([
      "Unterlagen/a.pdf",
      "Unterlagen/Lohn/2024.pdf",
      "Unterlagen/Lohn/2025.pdf",
      "Unterlagen/Lohn/2023.pdf",
      "Unterlagen/b.png",
      "solo.pdf",
    ]);
  });

  it("falls back to dataTransfer.files without the entries API", async () => {
    const f = new File(["x"], "a.pdf");
    expect((await filesFromDataTransfer({ items: [], files: [f] } as any)).map((p) => p.file)).toEqual([f]);
  });
});

describe("upload pipeline", () => {
  it("uploads, analyses and places each file", async () => {
    for (const [k, v] of Object.entries(GERBER_ANSWERS)) S().setAns(k as any, v as any);
    analysisFor = (name) => (name.startsWith("Grundbuch") ? { docTypeId: "grundbuch", docDate: "2026-09-01" } : name.startsWith("Rechnung") ? { docTypeId: "nn_rechnung", extraKind: "notneeded" } : null);
    addPickedFiles([pdf("Grundbuch.pdf"), pdf("Rechnung.pdf"), pdf("IMG_1.pdf")]);
    expect(S().files.map((f) => f.uploadState)).toEqual(["uploading", "uploading", "uploading"]);
    await flush();
    const [gb, img, rech] = S().files; // sorted by name
    expect(gb).toMatchObject({ uploadState: "uploaded", documentId: expect.any(String), analysisState: "done", instanceId: "grundbuch" });
    expect(gb.analysis!.contentHash).toBe("h-Grundbuch.pdf");
    expect(rech.instanceId ?? null).toBeNull();
    expect(rech.analysis!.extraKind).toBe("notneeded");
    expect(img.analysis!.extraKind).toBe("unknown");
    expect(S().sharepointFolderId).toBe("folder-1");
    expect(gb.audit!.map((a) => a.key)).toEqual(["audit.added", "audit.uploaded", "audit.recognised", "audit.placed"]);
    // the same file again (same name, size, folder) is not uploaded twice
    expect(addPickedFiles([pdf("Grundbuch.pdf")])).toEqual([]);
  });

  it("retries a failed upload", async () => {
    failStart = 1;
    addPickedFiles([pdf("a.pdf")]);
    await flush();
    expect(S().files[0]).toMatchObject({ uploadState: "failed", uploadError: "boom" });
    expect(await retryFile(S().files[0].id)).toBe(true);
    await flush();
    expect(S().files[0].uploadState).toBe("uploaded");
  });

  it("settleUploads retries failures and reports what still failed", async () => {
    failStart = 2;
    addPickedFiles([pdf("a.pdf")]);
    await flush();
    expect(await settleUploads(0)).toEqual(["a.pdf"]);
    expect(await settleUploads(0)).toEqual([]);
  });

  it("remove deletes the uploaded copy; removing during the upload deletes it when it lands", async () => {
    addPickedFiles([pdf("a.pdf")]);
    await flush();
    const id = S().files[0].id;
    const docId = S().files[0].documentId!;
    removeFile(id);
    await flush();
    expect(S().files).toEqual([]);
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes(docId) && c.url.includes(S().submissionId))).toBe(true);

    calls.length = 0;
    addPickedFiles([pdf("b.pdf")]);
    removeFile(S().files[0].id);
    await flush();
    expect(S().files).toEqual([]);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("a file moves when an answer changes", async () => {
    startPlacementSync();
    analysisFor = () => ({ docTypeId: "kredit", note: "Wird abgelöst." });
    addPickedFiles([pdf("Kredit.pdf")]);
    await flush();
    expect(S().files[0].instanceId ?? null).toBeNull();
    expect(S().files[0].analysis!.extraKind).toBe("surplus");
    S().setAns("kredite", "Ja");
    expect(S().files[0].instanceId).toBe("kredit");
    S().setAns("kredite", "Nein");
    expect(S().files[0].instanceId).toBeNull();
  });

  it("manual assignment, keep, outdated override and edits", async () => {
    addPickedFiles([pdf("IMG_1.pdf")]);
    await flush();
    const id = S().files[0].id;
    assignFile(id, "fotos", "Fotos");
    expect(S().files[0]).toMatchObject({ instanceId: "fotos", assignedByUser: true });
    keepFile(id, true);
    acceptOutdated(id);
    saveEdits(id, { Objekt: "Etzelstrasse 52" }, true);
    expect(S().files[0]).toMatchObject({ keep: true, outdatedOverride: true, confirmed: true, humanEdits: { Objekt: "Etzelstrasse 52" } });
    expect(S().files[0].audit!.map((a) => a.key)).toEqual(expect.arrayContaining(["audit.assigned", "audit.kept", "audit.override", "audit.edited", "audit.confirmed"]));
  });

  it("after a reload: lost uploads fail, uploaded files fetch their stored verdict", async () => {
    analysisFor = () => ({ docTypeId: "fotos" });
    S().addFiles([
      { id: "lost", name: "x.pdf", size: 1, uploadState: "uploading", analysisState: "pending" },
      { id: "done", name: "Foto.pdf", size: 1, uploadState: "uploaded", documentId: "doc-9", analysisState: "analysing" },
    ]);
    namesByDoc.set("doc-9", "Foto.pdf");
    resumePipeline();
    await flush();
    expect(S().files[0]).toMatchObject({ uploadState: "failed", uploadError: "lost" });
    expect(S().files[1]).toMatchObject({ analysisState: "done", instanceId: "fotos" });
    expect(calls.find((c) => c.url === "/api/document-intelligence/analyse")!.body.reuse).toBe(true);
  });
});
