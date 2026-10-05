"use client";

/**
 * Funnel v3 client upload pipeline (Spezifikation 5): drop → upload (chunked, straight to
 * SharePoint) → finalize (row + content hash) → analyse (v3) → placement on the list.
 *
 * Ported from the proven pipeline of app/funnel/steps/DocumentsStep.tsx and kept outside React
 * on purpose: the state lives in the zustand store and the bookkeeping of running work in
 * module-level maps, so an upload started before the step unmounts (navigation, a re-render
 * keyed on the answers) is still awaited, retried and placed after it. Every network failure
 * ends on the file (uploadState / analysisState), never as an exception out of here.
 */

import { useFunnelV3, newId } from "./store";
import type { FileAuditEntry, FileEntry, V3Analysis } from "./files";
import { placeAll, withPlacement } from "./placeFile";
import { reqList } from "./requirements";

// ---- Limits -------------------------------------------------------------------------------

/** The analysis reads at most 25 MB (app/api/document-intelligence/analyse/fileTypes.ts). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp"] as const;
/** 5 MiB — a multiple of 320 KiB as Microsoft Graph requires. */
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;
/** A stalled chunk must not hang the step. */
const CHUNK_TIMEOUT_MS = 120_000;
/** Parallel uploads / analyses: a dropped folder of 40 files must not open 40 connections. */
const UPLOAD_CONCURRENCY = 3;
const ANALYSE_CONCURRENCY = 4;
/** The analyse route itself gives up at 60 s. */
const ANALYSE_TIMEOUT_MS = 75_000;

// ---- Module state (survives remounts) -----------------------------------------------------

const inflightUploads = new Map<string, Promise<boolean>>();
const inflightAnalyses = new Map<string, Promise<void>>();
/** Removed while the upload was still running: delete it again when it lands. */
const removedWhileUploading = new Set<string>();
/** The browser File per entry id. The store copy loses it on reload; this one too. */
const localFiles = new Map<string, File>();
/** Object URLs handed out for «Dokument ansehen», revoked on remove. */
const objectUrls = new Map<string, string>();
/** Switched off on this deployment (the route said so): stop asking. */
let analysisDisabled = false;

function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
const uploadSlot = limiter(UPLOAD_CONCURRENCY);
const analyseSlot = limiter(ANALYSE_CONCURRENCY);

// ---- Store helpers ------------------------------------------------------------------------

const S = () => useFunnelV3.getState();
const fileById = (id: string) => S().files.find((f) => f.id === id);

export function auditEntry(key: string, params?: FileAuditEntry["params"]): FileAuditEntry {
  return { ts: new Date().toISOString(), key, ...(params ? { params } : {}) };
}

function patch(id: string, p: Partial<FileEntry>, audit?: FileAuditEntry) {
  S().updateFile(id, (f) => ({ ...p, ...(audit ? { audit: [...(f.audit ?? []), audit] } : {}) }));
}

// ---- Picking and dropping -----------------------------------------------------------------

export interface PickedFile {
  file: File;
  relativePath?: string;
}

export type RejectReason = "type" | "size" | "empty";
export interface Rejected {
  name: string;
  reason: RejectReason;
}

/** Hidden and system files a folder drop brings along (macOS, Windows, Office lock files). */
export function isSystemFile(name: string, path = ""): boolean {
  const n = name.toLowerCase();
  if (n.startsWith(".") || n.startsWith("~$") || n.startsWith("._")) return true;
  if (n === "thumbs.db" || n === "desktop.ini" || n === "icon\r") return true;
  return /(^|\/)(__macosx|\.[^/]+)\//i.test(path);
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Accepted, and why the others are not (system files are dropped silently). */
export function screenFiles(picked: PickedFile[]): { accepted: PickedFile[]; rejected: Rejected[] } {
  const accepted: PickedFile[] = [];
  const rejected: Rejected[] = [];
  for (const p of picked) {
    const name = p.file.name;
    if (isSystemFile(name, p.relativePath)) continue;
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(name))) rejected.push({ name, reason: "type" });
    else if (p.file.size === 0) rejected.push({ name, reason: "empty" });
    else if (p.file.size > MAX_FILE_BYTES) rejected.push({ name, reason: "size" });
    else accepted.push(p);
  }
  return { accepted, rejected };
}

// Minimal shapes of the (non-standard but universal) File and Directory Entries API.
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (ok: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void };
}

function readAllEntries(dir: FsEntry): Promise<FsEntry[]> {
  // readEntries returns at most ~100 entries per call: read until it returns none.
  const reader = dir.createReader!();
  const all: FsEntry[] = [];
  return new Promise((resolve) => {
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (!batch.length) return resolve(all);
          all.push(...batch);
          next();
        },
        () => resolve(all)
      );
    next();
  });
}

async function walk(entry: FsEntry, out: PickedFile[], prefix: string): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File | null>((resolve) => entry.file!(resolve, () => resolve(null)));
    if (file) out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : undefined });
  } else if (entry.isDirectory && entry.createReader) {
    if (isSystemFile(entry.name)) return; // .git, __MACOSX …
    if (entry.name.toLowerCase() === "__macosx") return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const child of await readAllEntries(entry)) await walk(child, out, path);
  }
}

/**
 * Files of a drop, folders included (recursively). The entries must be taken from the
 * DataTransfer synchronously, before the first await — the browser empties it afterwards.
 */
export async function filesFromDataTransfer(dt: DataTransfer | null): Promise<PickedFile[]> {
  if (!dt) return [];
  const entries: FsEntry[] = [];
  const items = dt.items ? Array.from(dt.items) : [];
  for (const it of items) {
    if (it.kind !== "file") continue;
    const e = (it as any).webkitGetAsEntry?.() as FsEntry | null;
    if (e) entries.push(e);
  }
  if (!entries.length) return Array.from(dt.files || []).map((file) => ({ file }));
  const out: PickedFile[] = [];
  for (const e of entries) await walk(e, out, "");
  return out;
}

/** From an <input type=file> (with or without `webkitdirectory`). */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return Array.from(list || []).map((file) => {
    const rel = (file as any).webkitRelativePath as string | undefined;
    return { file, ...(rel ? { relativePath: rel } : {}) };
  });
}

// ---- Upload -------------------------------------------------------------------------------

type UploadResult =
  | { success: true; documentId: string; webUrl: string | null; folderId: string | null; contentHash: string | null }
  | { success: false; error: string };

async function uploadToSharepoint(file: File, submissionId: string, email: string, folderId: string | null): Promise<UploadResult> {
  try {
    const startRes = await fetch("/api/upload-doc/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, email, inquiryId: submissionId, folderId }),
    });
    const startJson = await startRes.json().catch(() => null);
    if (!startRes.ok || !startJson?.uploadUrl) {
      return { success: false, error: startJson?.details || startJson?.error || "Failed to start upload" };
    }
    const { uploadUrl, folderId: resolvedFolderId } = startJson;

    const total = file.size;
    let driveItem: any = null;
    let offset = 0;
    while (offset < total) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE, total);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Range": `bytes ${offset}-${end - 1}/${total}` },
          body: file.slice(offset, end),
          signal: controller.signal,
        });
      } catch (err: any) {
        return { success: false, error: err?.name === "AbortError" ? `Upload stalled on chunk ${offset}-${end - 1}` : err?.message || "Network error during chunk upload" };
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 202) {
        offset = end;
        continue;
      }
      if (res.status === 200 || res.status === 201) {
        driveItem = await res.json().catch(() => null);
        break;
      }
      const errBody = await res.json().catch(() => null);
      return { success: false, error: errBody?.error?.message || `Chunk upload failed: HTTP ${res.status}` };
    }
    if (!driveItem?.id) return { success: false, error: "Upload completed without a final response from SharePoint" };

    const finRes = await fetch("/api/upload-doc/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveItemId: driveItem.id, folderId: resolvedFolderId, originalFileName: file.name, email, submissionId, docType: null }),
    });
    const fin = await finRes.json().catch(() => null);
    if (!finRes.ok || !fin?.success || !fin?.documentId) {
      return { success: false, error: fin?.details || fin?.error || "Failed to finalize upload" };
    }
    return {
      success: true,
      documentId: fin.documentId,
      webUrl: fin.webUrl ?? null,
      folderId: resolvedFolderId ?? null,
      contentHash: typeof fin.contentHash === "string" ? fin.contentHash : null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/** The e-mail the upload folder is filed under: the customer's, else the Berater's. */
function folderEmail(): string {
  const t = S().txt;
  return (t.mail || t.bmail || "").trim() || "funnel-v3@hypoteq.ch";
}

/** Upload one entry, then analyse it. Resolves true when the upload succeeded. */
export function uploadFile(id: string): Promise<boolean> {
  const running = inflightUploads.get(id);
  if (running) return running;
  const run = (async () => {
    const file = localFiles.get(id) ?? fileById(id)?.file;
    if (!file) {
      patch(id, { uploadState: "failed", uploadError: "lost" });
      return false;
    }
    patch(id, { uploadState: "uploading", uploadError: null });
    const res = await uploadSlot(() => uploadToSharepoint(file, S().submissionId, folderEmail(), S().sharepointFolderId));
    if (!res.success) {
      if (removedWhileUploading.delete(id)) return false;
      patch(id, { uploadState: "failed", uploadError: res.error }, auditEntry("docs.audit.uploadFailed"));
      return false;
    }
    if (res.folderId && !S().sharepointFolderId) S().setSharepointFolderId(res.folderId);
    if (removedWhileUploading.delete(id) || !fileById(id)) {
      await deleteRemote(res.documentId);
      return false;
    }
    patch(
      id,
      {
        uploadState: "uploaded",
        uploadError: null,
        documentId: res.documentId,
        sharepointUrl: res.webUrl,
        analysisState: "pending",
      },
      auditEntry("docs.audit.uploaded")
    );
    void analyseFile(id);
    return true;
  })();
  inflightUploads.set(id, run);
  run.finally(() => {
    if (inflightUploads.get(id) === run) inflightUploads.delete(id);
  });
  return run;
}

// ---- Analysis -----------------------------------------------------------------------------

/** Analyse an uploaded entry (or fetch the stored verdict with `reuse`). Never throws. */
export function analyseFile(id: string, reuse = false): Promise<void> {
  const running = inflightAnalyses.get(id);
  if (running) return running;
  const run = (async () => {
    const f = fileById(id);
    if (!f?.documentId) return;
    if (analysisDisabled) {
      settleUnanalysed(id, "docs.audit.aiOff");
      return;
    }
    patch(id, { analysisState: "analysing" });
    let json: any = null;
    for (let attempt = 0; attempt < 2 && !json; attempt++) {
      try {
        json = await analyseSlot(async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ANALYSE_TIMEOUT_MS);
          try {
            const res = await fetch("/api/document-intelligence/analyse", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: f.documentId, submissionId: S().submissionId, v3: true, reuse }),
              signal: controller.signal,
            });
            // 4xx: the request itself is wrong (e.g. the row is gone) — retrying will not help.
            if (res.status >= 400 && res.status < 500) return { success: false, analysis: null };
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
          } finally {
            clearTimeout(timer);
          }
        });
      } catch {
        json = null; // network error or our timeout: one more try
      }
    }
    if (!fileById(id)) return; // removed meanwhile
    if (json?.disabled) {
      analysisDisabled = true;
      settleUnanalysed(id, "docs.audit.aiOff");
      return;
    }
    const analysis: V3Analysis | null = json?.analysis && typeof json.analysis === "object" ? json.analysis : null;
    if (!analysis) {
      patch(id, { analysisState: "failed" }, auditEntry("docs.audit.analysisFailed"));
    } else {
      const hash = analysis.contentHash ?? fileById(id)?.analysis?.contentHash ?? null;
      patch(
        id,
        { analysisState: "done", analysis: { ...analysis, contentHash: hash } },
        analysis.status === "done" && analysis.docTypeId
          ? auditEntry("docs.audit.recognised", { label: analysis.docTypeLabel || analysis.docTypeId, pct: Math.round(analysis.confidence * 100) })
          : auditEntry(analysis.status === "failed" ? "docs.audit.analysisFailed" : "docs.audit.notRecognised")
      );
    }
    syncPlacement();
  })();
  inflightAnalyses.set(id, run);
  run.finally(() => {
    if (inflightAnalyses.get(id) === run) inflightAnalyses.delete(id);
  });
  return run;
}

/** No analysis possible: the file is «Nicht erkannt» and can be assigned by hand. */
function settleUnanalysed(id: string, key: string) {
  patch(
    id,
    { analysisState: "done", analysis: { status: "failed", docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, extraKind: "unknown", fields: {}, contentHash: fileById(id)?.analysis?.contentHash ?? null } },
    auditEntry(key)
  );
  syncPlacement();
}

// ---- Placement ----------------------------------------------------------------------------

/**
 * Write the placement for the current answers into the stored entries (instanceId and the
 * analysis' requirementId / extraKind / extraReason). Only changed entries are replaced, so
 * calling it from a store subscription settles after one round.
 */
export function syncPlacement(): void {
  const s = S();
  if (!s.files.length) return;
  const map = placeAll(s.files, s, { dismissed: s.dismissed });
  let changed = false;
  const instances = new Map(reqList(s).map((i) => [i.instanceId, i]));
  const next = s.files.map((f) => {
    const g = withPlacement(f, map.get(f.id));
    if (g !== f) {
      changed = true;
      if (g.instanceId && g.instanceId !== f.instanceId) {
        const inst = instances.get(g.instanceId);
        return { ...g, audit: [...(g.audit ?? []), auditEntry("docs.audit.placed", { label: inst?.labelDe ?? g.instanceId })] };
      }
      if (!g.instanceId && g.analysis?.extraKind && g.analysis.extraKind !== f.analysis?.extraKind) {
        return { ...g, audit: [...(g.audit ?? []), auditEntry("docs.audit.extra", { kind: g.analysis.extraKind })] };
      }
    }
    return g;
  });
  if (changed) s.setFiles(next);
}

let placementUnsub: (() => void) | null = null;

/**
 * Keep placement in step with the answers while the funnel is open: a file moves from
 * «Weitere Dateien» to a requirement the moment an answer puts that requirement on the list.
 * Idempotent; returns the unsubscribe.
 */
export function startPlacementSync(): () => void {
  if (placementUnsub) return placementUnsub;
  let last = { ans: S().ans, borrowers: S().borrowers, txt: S().txt, dismissed: S().dismissed, n: S().files.length };
  const unsub = useFunnelV3.subscribe((s) => {
    const cur = { ans: s.ans, borrowers: s.borrowers, txt: s.txt, dismissed: s.dismissed, n: s.files.length };
    if (cur.ans === last.ans && cur.borrowers === last.borrowers && cur.txt === last.txt && cur.dismissed === last.dismissed && cur.n === last.n) return;
    last = cur;
    syncPlacement();
  });
  placementUnsub = () => {
    unsub();
    placementUnsub = null;
  };
  syncPlacement();
  return placementUnsub;
}

// ---- Public actions -----------------------------------------------------------------------

/** Add picked files: entries appear at once, uploads start (a few at a time). */
export function addPickedFiles(picked: PickedFile[]): FileEntry[] {
  const existing = S().files;
  // The same file picked twice in one session (name + size + path) is not uploaded twice;
  // a renamed copy is still caught as a duplicate by its content hash.
  const seen = new Set(existing.map((f) => `${f.relativePath ?? ""}|${f.name}|${f.size}`));
  const entries: FileEntry[] = [];
  const sorted = [...picked].sort((x, y) => (x.relativePath ?? x.file.name).localeCompare(y.relativePath ?? y.file.name));
  for (const p of sorted) {
    const key = `${p.relativePath ?? ""}|${p.file.name}|${p.file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = newId();
    localFiles.set(id, p.file);
    entries.push({
      id,
      name: p.file.name,
      size: p.file.size,
      file: p.file,
      uploadState: "uploading",
      analysisState: "pending",
      addedAt: new Date().toISOString(),
      ...(p.relativePath ? { relativePath: p.relativePath } : {}),
      audit: [auditEntry("docs.audit.added", { name: p.relativePath || p.file.name })],
    });
  }
  if (!entries.length) return [];
  S().addFiles(entries);
  for (const e of entries) void uploadFile(e.id);
  return entries;
}

/** «Erneut versuchen» on a failed upload (or a failed analysis). */
export function retryFile(id: string): Promise<boolean> {
  const f = fileById(id);
  if (!f) return Promise.resolve(false);
  if (f.uploadState === "failed") return uploadFile(id);
  if (f.documentId && f.analysisState === "failed") return analyseFile(id).then(() => true);
  return Promise.resolve(f.uploadState === "uploaded");
}

async function deleteRemote(documentId: string): Promise<void> {
  try {
    await fetch(`/api/upload-doc/${encodeURIComponent(documentId)}?submissionId=${encodeURIComponent(S().submissionId)}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Could not remove the uploaded file:", err);
  }
}

/** Remove a file: from the list, and from SharePoint and the database (best effort). */
export function removeFile(id: string): void {
  const f = fileById(id);
  if (!f) return;
  S().removeFile(id);
  localFiles.delete(id);
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
  if (f.documentId) void deleteRemote(f.documentId);
  else if (inflightUploads.has(id)) removedWhileUploading.add(id);
  syncPlacement();
}

/** Manual assignment of a file the AI could not place (spec 4.3 «Nicht erkannt», D15). */
export function assignFile(id: string, instanceId: string, label: string): void {
  S().updateFile(id, (f) => ({
    instanceId,
    assignedByUser: true,
    // A file without a usable analysis still has to count once a person placed it.
    ...(f.analysisState !== "done"
      ? { analysisState: "done" as const, analysis: { status: "failed" as const, docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, fields: {}, contentHash: f.analysis?.contentHash ?? null } }
      : {}),
    audit: [...(f.audit ?? []), auditEntry("docs.audit.assigned", { label })],
  }));
  syncPlacement();
}

/** «Trotzdem verwenden» on an outdated document. */
export function acceptOutdated(id: string): void {
  patch(id, { outdatedOverride: true }, auditEntry("docs.audit.override"));
}

/** «Behalten» / undo on a not-needed file. */
export function keepFile(id: string, keep: boolean): void {
  patch(id, { keep }, auditEntry(keep ? "docs.audit.kept" : "docs.audit.unkept"));
}

/** Detail view: corrected values and «Angaben bestätigen». */
export function saveEdits(id: string, edits: Record<string, string>, confirm: boolean): void {
  S().updateFile(id, (f) => {
    const before = { ...(f.humanEdits ?? {}) };
    const changed = Object.entries(edits).filter(([k, v]) => (before[k] ?? String(f.analysis?.fields?.[k]?.value ?? "")) !== v);
    const humanEdits = { ...before, ...Object.fromEntries(changed) };
    const audit = [
      ...(f.audit ?? []),
      ...changed.map(([field, value]) => auditEntry("docs.audit.edited", { field, value })),
      ...(confirm ? [auditEntry("docs.audit.confirmed")] : []),
    ];
    return { humanEdits, audit, ...(confirm ? { confirmed: true } : {}) };
  });
}

/** Berater / intern: the stored name (spec 5.1). Empty restores the generated name. */
export function renameFile(id: string, name: string): void {
  const v = name.trim();
  patch(id, { nameOverride: v || undefined }, auditEntry("docs.audit.renamed", { name: v || "–" }));
}

/** A URL to show the file: the local copy when this browser has it, else the SharePoint link. */
export function viewUrl(id: string): string | null {
  const f = fileById(id);
  const file = localFiles.get(id) ?? f?.file;
  if (file && typeof URL !== "undefined" && URL.createObjectURL) {
    let url = objectUrls.get(id);
    if (!url) {
      url = URL.createObjectURL(file);
      objectUrls.set(id, url);
    }
    return url;
  }
  return f?.sharepointUrl ?? null;
}

/** Whether this browser still has the file's bytes (for an inline preview). */
export function hasLocalFile(id: string): boolean {
  return localFiles.has(id) || Boolean(fileById(id)?.file);
}

/**
 * After a mount (or a reload of the page): pick up what the previous instance left running.
 *  - an upload still running: wait for it (it analyses itself);
 *  - an upload interrupted by a reload: the File is gone → failed («Erneut hochladen»);
 *  - an uploaded file without a verdict here: ask the route, which answers from the row.
 */
export function resumePipeline(): void {
  for (const f of S().files) {
    if (inflightUploads.has(f.id) || inflightAnalyses.has(f.id)) continue;
    if (f.uploadState === "uploading") {
      if (localFiles.has(f.id) || f.file) void uploadFile(f.id);
      else patch(f.id, { uploadState: "failed", uploadError: "lost" });
    } else if (f.uploadState === "uploaded" && f.documentId && f.analysisState !== "done") {
      void analyseFile(f.id, true);
    }
  }
  syncPlacement();
}

/**
 * Before leaving the step / submitting: wait for running uploads, retry failed ones once, and
 * give running analyses up to `analysisWaitMs` to land. Resolves with the names of files that
 * still could not be uploaded (an empty list means everything is in SharePoint).
 */
export async function settleUploads(analysisWaitMs = 20_000): Promise<string[]> {
  await Promise.allSettled(Array.from(inflightUploads.values()));
  const failed = S().files.filter((f) => f.uploadState === "failed");
  const still: string[] = [];
  for (const f of failed) {
    if (!(localFiles.has(f.id) || f.file)) {
      still.push(f.name);
      continue;
    }
    if (!(await uploadFile(f.id))) still.push(f.name);
  }
  if (inflightAnalyses.size) {
    await Promise.race([
      Promise.allSettled(Array.from(inflightAnalyses.values())),
      new Promise((resolve) => setTimeout(resolve, analysisWaitMs)),
    ]);
  }
  syncPlacement();
  return still;
}

/** Work still running (for a «wird gelesen» indicator outside step 5). */
export function pipelineBusy(): boolean {
  return inflightUploads.size > 0 || inflightAnalyses.size > 0;
}

/** Test hook: forget module state between tests. */
export function __resetUploadPipeline(): void {
  inflightUploads.clear();
  inflightAnalyses.clear();
  removedWhileUploading.clear();
  localFiles.clear();
  objectUrls.clear();
  analysisDisabled = false;
  placementUnsub?.();
}
