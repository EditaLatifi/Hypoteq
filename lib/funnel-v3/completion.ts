/**
 * What happens on the server when a Funnel v3 request is completed (Spezifikation 3 Schritt 6,
 * 5.1, 6.9, 6.11; DECISIONS D1, D11, D12, D17, S3). Called by /api/inquiry after the Inquiry
 * exists, its case number is allocated and its uploads are adopted — and only for a v3
 * payload (`data.v3`).
 *
 *   a. store the customer's per-file decisions beside the AI analysis (aiAnalysis.v3Submitted)
 *   b. rename every kept file in the case folder to its stored name (spec 5.1), persist
 *      `Document.storedName`; delete duplicates and not-needed files the customer did not keep
 *   c. generate the Fall-Dossier PDF and upload it as `{Fallnummer}_00_Fall-Dossier.pdf`
 *   d. hand the sync what it needs for the Case: folder URL, files with stored names
 *      (`v3DocumentCaseFields` below builds the Salesforce fields from it)
 *
 * Every step is non-fatal and logged: the lead is saved before this runs, and a SharePoint
 * hiccup must never turn a good submission into an error. Test mode changes nothing here —
 * the uploads already went to a ZZ-TEST_ folder; only Salesforce and mail are withheld, by the
 * existing guards in the route.
 *
 * DELETED FILES KEEP THEIR ROW. A duplicate or a not-needed file is removed from SharePoint
 * (spec 4.3: «wird nicht doppelt gespeichert», «nicht abgelegt»), but its Document row stays,
 * with `driveItemId` cleared and `aiAnalysis.v3Completion.removed` recording when, why and
 * which item: the audit trail (spec section 36 / 5.1 «Der Originalname bleibt im Audit Trail»)
 * must be able to say what the customer uploaded, what the AI made of it and what became of it.
 *
 * Imports of Prisma and the Graph helpers are dynamic (default deps only), so the pure parts
 * — the naming plan and the Salesforce fields — can be used by the sync and by tests.
 */

import { buildCheckState, type CheckStateDetail } from "./checkState";
import { createDossierPdf, dossierFileName, type DossierFile, type DossierInput } from "./dossier";
import type { SubmittedDocument, V3Analysis } from "./files";
import { isLang, type Lang } from "./i18n";
import { getRequirement, reqList, type RequirementDef, type RequirementInstance } from "./requirements";
import { bankHints, requirementStatus, type ExtraKind, type StatusResult, type UploadedFile } from "./requirementStatus";
import { cleanNamePart, storedName } from "./storedName";
import type { FunnelState } from "./types";

// ---- Types --------------------------------------------------------------------------------

/** The Document columns this module reads. */
export interface CompletionDocumentRow {
  id: string;
  fileName: string;
  fileUrl: string;
  originalFileName: string | null;
  driveItemId: string | null;
  uploadedAt: Date | string;
  aiAnalysis: unknown;
  storedName?: string | null;
}

export interface DocumentUpdate {
  aiAnalysis?: unknown;
  storedName?: string | null;
  fileName?: string;
  fileUrl?: string;
  driveItemId?: string | null;
}

export interface DriveItemRef {
  id: string;
  name: string;
  webUrl: string;
  parentId?: string | null;
}

export type RenameOutcome = { ok: true; item: DriveItemRef } | { ok: false; conflict: true };

export interface CompletionDeps {
  db: {
    findDocuments(inquiryId: string): Promise<CompletionDocumentRow[]>;
    updateDocument(id: string, data: DocumentUpdate): Promise<void>;
    setInquiryFolder(inquiryId: string, folderId: string): Promise<void>;
  };
  graph: {
    token(): Promise<string>;
    getItem(itemId: string, token: string): Promise<DriveItemRef | null>;
    /** Rename without overwriting: a taken name answers `{ ok: false, conflict: true }`. */
    rename(itemId: string, name: string, token: string): Promise<RenameOutcome>;
    remove(itemId: string, token: string): Promise<void>;
    /** Upload (replacing a file of the same name) into the folder. */
    upload(folderId: string, name: string, bytes: Uint8Array, contentType: string, token: string): Promise<DriveItemRef>;
    /** The submission's folder, created when no upload made it yet. */
    ensureFolder(email: string, submissionId: string, token: string): Promise<string>;
  };
  renderDossier(input: DossierInput): Promise<Uint8Array>;
  now(): Date;
  log: Pick<Console, "log" | "warn" | "error">;
}

/** One file after the closing, as the sync and the dossier see it. */
export interface CompletedFile {
  documentId: string;
  originalName: string;
  /** Name in the case folder; null when not renamed (no case number, rename failed, removed). */
  storedName: string | null;
  /** Current link (after the rename); null when removed. */
  url: string | null;
  instanceId: string | null;
  requirementId: string | null;
  extraKind?: ExtraKind;
  keep?: boolean;
  outdatedOverride?: boolean;
  /** Placed by hand (a file the AI could not read still counts once a person placed it). */
  assignedByUser?: boolean;
  removed: boolean;
  analysis?: V3Analysis | null;
}

export interface V3CompletionResult {
  folderId: string | null;
  folderWebUrl: string | null;
  files: CompletedFile[];
  dossier: { name: string; webUrl: string; driveItemId: string } | null;
  /** Steps that failed (each logged); empty when everything ran. */
  errors: string[];
}

export interface CompletionInput {
  inquiryId: string;
  submissionId: string;
  caseNumber: string | null;
  /** The /api/inquiry body (v3 payload). */
  data: any;
}

export type V3State = Pick<FunnelState, "role" | "ans" | "txt" | "fin" | "borrowers">;

// ---- Reading the payload ------------------------------------------------------------------

export function v3StateOf(data: any): V3State | null {
  const v3 = data?.v3;
  if (!v3 || typeof v3 !== "object" || !v3.ans || !v3.txt) return null;
  return {
    role: v3.role ?? null,
    ans: v3.ans,
    txt: v3.txt,
    fin: v3.fin ?? { old: 0, up: 0, kaufpreis: 0, inc: 0, val: 0 },
    borrowers: Array.isArray(v3.borrowers) ? v3.borrowers : [],
  };
}

export function submittedDocumentsOf(data: any): SubmittedDocument[] {
  return (Array.isArray(data?.documents) ? data.documents : []).filter(
    (d: any): d is SubmittedDocument => !!d && typeof d === "object" && typeof d.documentId === "string"
  );
}

export function skippedOf(data: any): string[] {
  const s = data?.documentCompleteness?.skipped;
  return Array.isArray(s) ? s.filter((x: unknown): x is string => typeof x === "string") : [];
}

function langOf(data: any): Lang {
  return isLang(data?.locale) ? data.locale : "de";
}

const v3AnalysisOf = (ai: unknown): V3Analysis | null => {
  const v3 = (ai as any)?.v3;
  return v3 && typeof v3 === "object" ? (v3 as V3Analysis) : null;
};

const extOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || "");
  return m ? m[1].toLowerCase() : "pdf";
};

const baseOf = (name: string) => (name || "").replace(/\.[A-Za-z0-9]{1,8}$/, "");

const time = (d: Date | string) => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
};

// ---- Classification and naming (pure) ------------------------------------------------------

export interface FilePlan {
  row: CompletionDocumentRow;
  sub: SubmittedDocument | null;
  analysis: V3Analysis | null;
  instance: RequirementInstance | null;
  extraKind?: ExtraKind;
  /** Duplicate / not needed, and the customer did not keep it. */
  remove: boolean;
  /** Stored name before collision handling; null = keep the current name. */
  target: string | null;
}

/**
 * «Nachname Vorname» as the analysis prints it (files.ts) → first / last.
 */
function personFromAnalysis(personName: string | null | undefined): { first: string; last: string } | undefined {
  const parts = (personName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return undefined;
  return { last: parts[0], first: parts.slice(1).join(" ") };
}

function hasPersonName(inst: RequirementInstance | null): boolean {
  const p = inst?.person;
  return !!p && !!(p.company?.trim() || p.first?.trim() || p.last?.trim());
}

/** The order of files within one requirement: document date, then upload time, then id. */
function fileOrder(a: FilePlan, b: FilePlan): number {
  const da = a.analysis?.docDate || "";
  const db = b.analysis?.docDate || "";
  if (da !== db) return da < db ? -1 : 1;
  const ta = time(a.row.uploadedAt);
  const tb = time(b.row.uploadedAt);
  if (ta !== tb) return ta - tb;
  return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
}

/**
 * What becomes of every file: which requirement it answers, whether it is deleted, and its
 * stored name (spec 5.1). Pure.
 */
export function planFiles(
  state: V3State,
  rows: CompletionDocumentRow[],
  submitted: SubmittedDocument[],
  caseNumber: string | null
): FilePlan[] {
  const instances = reqList(state);
  const byInstance = new Map(instances.map((i) => [i.instanceId, i]));
  const perId = new Map<string, RequirementInstance[]>();
  for (const i of instances) perId.set(i.id, [...(perId.get(i.id) || []), i]);
  const subs = new Map(submitted.map((d) => [d.documentId, d]));

  const plans: FilePlan[] = rows.map((row) => {
    const sub = subs.get(row.id) ?? null;
    const analysis = v3AnalysisOf(row.aiAnalysis);
    let instance: RequirementInstance | null = null;
    if (sub) {
      instance = sub.instanceId ? byInstance.get(sub.instanceId) ?? null : null;
    } else if (analysis?.requirementId && !analysis.extraKind) {
      // A row the submit did not describe (an older client): the AI's placement, when unambiguous.
      const only = perId.get(analysis.requirementId);
      instance = byInstance.get(analysis.requirementId) ?? (only?.length === 1 ? only[0] : null);
    }
    const extraKind: ExtraKind | undefined = instance ? undefined : sub?.extraKind ?? analysis?.extraKind ?? "unknown";
    const remove = !instance && !sub?.keep && (extraKind === "duplicate" || extraKind === "notneeded");
    return { row, sub, analysis, instance, extraKind, remove, target: null };
  });

  if (!caseNumber) return plans;

  // Files on a requirement: Nr only when the requirement has several (spec 5.1).
  const groups = new Map<string, FilePlan[]>();
  for (const p of plans) if (p.instance) groups.set(p.instance.instanceId, [...(groups.get(p.instance.instanceId) || []), p]);
  for (const list of groups.values()) {
    list.sort(fileOrder);
    list.forEach((p, i) => {
      const inst = p.instance!;
      p.target = storedName({
        caseNumber,
        requirement: inst,
        ...(hasPersonName(inst) ? {} : { person: personFromAnalysis(p.analysis?.personName) }),
        bank: p.analysis?.bank ?? undefined,
        docDate: p.analysis?.docDate ?? null,
        index: i + 1,
        total: list.length,
        ext: extOf(p.row.originalFileName || p.row.fileName),
      });
    });
  }

  // Kept files outside the list: _ZUSATZ_ / _DUPLIKAT_ after the group.
  const mainBorrower = state.ans.kn === "Juristische Person" ? undefined : state.borrowers[0];
  for (const p of plans) {
    if (p.instance || p.remove) continue;
    const ext = extOf(p.row.originalFileName || p.row.fileName);
    const def: RequirementDef | undefined = getRequirement(p.analysis?.docTypeId || p.sub?.requirementId || "");
    if (def) {
      const fromAnalysis = personFromAnalysis(p.analysis?.personName);
      const person =
        def.personKind === "borrower" ? fromAnalysis ?? (mainBorrower ? { first: mainBorrower.vor || state.txt.vor, last: mainBorrower.nach || state.txt.nach } : undefined)
        : def.personKind === "company" ? { company: state.txt.firma }
        : fromAnalysis;
      p.target = storedName({ caseNumber, requirement: def, person, bank: p.analysis?.bank ?? undefined, docDate: p.analysis?.docDate ?? null, ext, extraKind: p.extraKind });
    } else {
      const marker = p.extraKind === "duplicate" ? "DUPLIKAT" : "ZUSATZ";
      const base = cleanNamePart(baseOf(p.row.originalFileName || p.row.fileName).replace(/[\s_]+/g, "-")).slice(0, 80) || "Datei";
      p.target = `${caseNumber}_${marker}_${base}.${ext}`;
    }
  }

  resolveCollisions(plans);
  return plans;
}

/** `name.pdf` → `name_2.pdf`. */
export function withSuffix(name: string, k: number): string {
  const m = /^(.*)(\.[^.]+)$/.exec(name);
  return m ? `${m[1]}_${k}${m[2]}` : `${name}_${k}`;
}

/**
 * Two files must never get the same name in one folder (SharePoint compares names without
 * case). Within the batch: the first in (upload time, id) order keeps the name, the others
 * get `_2`, `_3` … — deterministic, whatever order the rows came in.
 */
function resolveCollisions(plans: FilePlan[]) {
  const named = plans.filter((p) => p.target).sort((a, b) => time(a.row.uploadedAt) - time(b.row.uploadedAt) || (a.row.id < b.row.id ? -1 : 1));
  const taken = new Set<string>();
  const firstPass = new Map<string, FilePlan[]>();
  for (const p of named) {
    const key = p.target!.toLowerCase();
    firstPass.set(key, [...(firstPass.get(key) || []), p]);
  }
  for (const p of named) if (firstPass.get(p.target!.toLowerCase())!.length === 1) taken.add(p.target!.toLowerCase());
  for (const list of firstPass.values()) {
    if (list.length < 2) continue;
    taken.add(list[0].target!.toLowerCase());
    for (const p of list.slice(1)) {
      let k = 2;
      while (taken.has(withSuffix(p.target!, k).toLowerCase())) k++;
      p.target = withSuffix(p.target!, k);
      taken.add(p.target.toLowerCase());
    }
  }
}

// ---- The closing --------------------------------------------------------------------------

const RENAME_CONCURRENCY = 4;
const MAX_SUFFIX = 30;

async function inBatches<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn));
}

export async function completeV3Inquiry(input: CompletionInput, deps?: Partial<CompletionDeps>): Promise<V3CompletionResult | null> {
  const state = v3StateOf(input.data);
  if (!state) return null;
  const d: CompletionDeps = { ...(await defaultDeps()), ...(deps || {}) } as CompletionDeps;
  const { log } = d;
  const tag = `[v3 completion ${input.inquiryId}]`;
  const errors: string[] = [];
  const fail = (step: string, err: unknown) => {
    const msg = `${step}: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    log.error(`${tag} ${msg}`);
  };

  const submitted = submittedDocumentsOf(input.data);
  let rows: CompletionDocumentRow[] = [];
  try {
    rows = await d.db.findDocuments(input.inquiryId);
  } catch (err) {
    fail("read documents", err);
  }
  const plans = planFiles(state, rows, submitted, input.caseNumber);
  const now = d.now();

  // a. The customer's decisions beside the AI analysis.
  for (const p of plans) {
    if (!p.sub) continue;
    try {
      const ai = p.row.aiAnalysis && typeof p.row.aiAnalysis === "object" ? (p.row.aiAnalysis as Record<string, unknown>) : {};
      const { documentId: _id, ...detail } = p.sub;
      const aiAnalysis = { ...ai, v3Submitted: { ...detail, submittedAt: now.toISOString() } };
      await d.db.updateDocument(p.row.id, { aiAnalysis });
      p.row.aiAnalysis = aiAnalysis;
    } catch (err) {
      fail(`store submitted detail ${p.row.id}`, err);
    }
  }

  // The case folder.
  let token: string | null = null;
  let folderId: string | null = typeof input.data?.sharepointFolderId === "string" && input.data.sharepointFolderId ? input.data.sharepointFolderId : null;
  let folderWebUrl: string | null = null;
  try {
    token = await d.graph.token();
    if (!folderId) {
      const withItem = rows.find((r) => r.driveItemId);
      if (withItem) folderId = (await d.graph.getItem(withItem.driveItemId!, token))?.parentId ?? null;
    }
    if (!folderId) {
      const email = String(input.data?.client?.email || input.data?.v3?.txt?.mail || "");
      folderId = await d.graph.ensureFolder(email, input.submissionId, token);
      await d.db.setInquiryFolder(input.inquiryId, folderId).catch((err) => fail("remember folder", err));
    }
    folderWebUrl = (await d.graph.getItem(folderId, token))?.webUrl ?? null;
  } catch (err) {
    fail("case folder", err);
  }

  const current = new Map(plans.map((p) => [p.row.id, { name: p.row.fileName, url: p.row.fileUrl as string | null, stored: p.row.storedName ?? null }]));

  // b. Delete what is not stored, rename the rest.
  if (token) {
    for (const p of plans.filter((x) => x.remove)) {
      try {
        if (p.row.driveItemId) await d.graph.remove(p.row.driveItemId, token);
        const ai = p.row.aiAnalysis && typeof p.row.aiAnalysis === "object" ? (p.row.aiAnalysis as Record<string, unknown>) : {};
        await d.db.updateDocument(p.row.id, {
          driveItemId: null,
          aiAnalysis: { ...ai, v3Completion: { removed: true, reason: p.extraKind, removedAt: now.toISOString(), driveItemId: p.row.driveItemId } },
        });
        current.set(p.row.id, { name: p.row.fileName, url: null, stored: null });
      } catch (err) {
        fail(`delete ${p.row.id}`, err);
      }
    }

    const toRename = plans.filter((p) => p.target && !p.remove && p.row.driveItemId);
    const persist = async (p: FilePlan, item: DriveItemRef) => {
      current.set(p.row.id, { name: item.name, url: item.webUrl, stored: item.name });
      await d.db.updateDocument(p.row.id, { storedName: item.name, fileName: item.name, fileUrl: item.webUrl });
    };
    const conflicts: FilePlan[] = [];
    await inBatches(toRename, RENAME_CONCURRENCY, async (p) => {
      try {
        if (p.row.fileName === p.target) {
          if (p.row.storedName !== p.target) await persist(p, { id: p.row.driveItemId!, name: p.target!, webUrl: p.row.fileUrl });
          else current.set(p.row.id, { name: p.target!, url: p.row.fileUrl, stored: p.target! });
          return;
        }
        const res = await d.graph.rename(p.row.driveItemId!, p.target!, token!);
        if (res.ok) await persist(p, res.item);
        else conflicts.push(p);
      } catch (err) {
        fail(`rename ${p.row.id} → ${p.target}`, err);
      }
    });

    // A name already taken in the folder: retried after the others (it may have been one of
    // them, renamed away), then `_2`, `_3` … — one at a time, in a fixed order.
    const reserved = new Set(toRename.map((p) => p.target!.toLowerCase()));
    conflicts.sort((a, b) => (a.target! < b.target! ? -1 : a.target! > b.target! ? 1 : 0));
    for (const p of conflicts) {
      try {
        let done = false;
        const again = await d.graph.rename(p.row.driveItemId!, p.target!, token);
        if (again.ok) {
          await persist(p, again.item);
          done = true;
        }
        for (let k = 2; !done && k <= MAX_SUFFIX; k++) {
          const name = withSuffix(p.target!, k);
          if (reserved.has(name.toLowerCase())) continue;
          const res = await d.graph.rename(p.row.driveItemId!, name, token);
          if (res.ok) {
            reserved.add(name.toLowerCase());
            await persist(p, res.item);
            done = true;
          }
        }
        if (!done) throw new Error("no free name");
      } catch (err) {
        fail(`rename ${p.row.id} → ${p.target}`, err);
      }
    }
  } else if (plans.some((p) => p.target || p.remove)) {
    errors.push("renames skipped: no SharePoint access");
  }
  if (!input.caseNumber) log.warn(`${tag} no case number — files keep their original names`);

  const files: CompletedFile[] = plans.map((p) => {
    const c = current.get(p.row.id)!;
    const removed = p.remove && c.url === null;
    return {
      documentId: p.row.id,
      originalName: p.row.originalFileName || p.row.fileName,
      storedName: removed ? null : c.stored,
      url: removed ? null : c.url,
      instanceId: p.instance?.instanceId ?? null,
      requirementId: p.instance?.id ?? p.sub?.requirementId ?? p.analysis?.docTypeId ?? null,
      ...(p.extraKind ? { extraKind: p.extraKind } : {}),
      ...(p.sub?.keep ? { keep: true } : {}),
      ...(p.sub?.outdatedOverride ? { outdatedOverride: true } : {}),
      ...(p.sub?.assignedByUser && p.instance ? { assignedByUser: true } : {}),
      removed,
      analysis: p.analysis,
    };
  });

  // c. The Fall-Dossier.
  let dossier: V3CompletionResult["dossier"] = null;
  try {
    const bytes = await d.renderDossier(dossierInputFor(input.data, state, files, input.caseNumber, now));
    if (token && folderId) {
      const name = dossierFileName(input.caseNumber);
      const item = await d.graph.upload(folderId, name, bytes, "application/pdf", token);
      dossier = { name: item.name, webUrl: item.webUrl, driveItemId: item.id };
      log.log(`${tag} dossier stored as ${item.name}`);
    } else {
      errors.push("dossier not stored: no case folder");
    }
  } catch (err) {
    fail("dossier", err);
  }

  log.log(`${tag} ${files.filter((f) => f.storedName).length} renamed, ${files.filter((f) => f.removed).length} removed, ${errors.length} error(s)`);
  return { folderId, folderWebUrl, files, dossier, errors };
}

export function dossierInputFor(data: any, state: V3State, files: CompletedFile[], caseNumber: string | null, date: Date): DossierInput {
  return {
    lang: langOf(data),
    draft: false,
    caseNumber,
    date,
    state,
    skipped: skippedOf(data),
    files: files.map(
      (f): DossierFile => ({
        id: f.documentId,
        name: f.storedName || f.originalName,
        originalName: f.originalName,
        instanceId: f.instanceId,
        extraKind: f.extraKind,
        keep: f.keep,
        outdatedOverride: f.outdatedOverride,
        removed: f.removed,
        analysis: f.analysis ?? null,
      })
    ),
  };
}

// ---- Salesforce (spec 6.9, 6.11) — pure, used by syncFunnelStepsToSalesforce ---------------

function pctLabel(c: number | undefined) {
  return typeof c === "number" && Number.isFinite(c) ? ` · Konfidenz ${Math.round(c * 100)} %` : "";
}

/** CompletedFiles from the closing, or — when it did not run — from the submitted detail. */
function filesForSync(data: any): CompletedFile[] {
  const done = data?.v3Completion?.files;
  if (Array.isArray(done)) return done as CompletedFile[];
  return submittedDocumentsOf(data).map((s) => ({
    documentId: s.documentId,
    originalName: s.documentId,
    storedName: null,
    url: null,
    instanceId: s.instanceId ?? null,
    requirementId: s.requirementId ?? null,
    ...(s.instanceId ? {} : { extraKind: s.extraKind ?? "unknown" }),
    ...(s.keep ? { keep: true } : {}),
    ...(s.outdatedOverride ? { outdatedOverride: true } : {}),
    ...(s.assignedByUser && s.instanceId ? { assignedByUser: true } : {}),
    removed: false,
    analysis: null,
  }));
}

/**
 * The Case fields of the v3 documents: Dok_*__c and Documents_completed__c from the requirement
 * status, Dokumenten_Check_State__c (spec 6.11, merged onto `previous`, legacy `checked` kept),
 * SharePoint_Doc__c (the case folder). Null when the payload is not v3.
 */
export interface V3DocumentStatus {
  state: V3State;
  /** The files still in the case folder (removed ones left out). */
  files: CompletedFile[];
  uploaded: UploadedFile[];
  status: StatusResult;
}

/**
 * The requirement status of a v3 payload's documents: from the closing result when it ran,
 * else from the submitted detail. What Salesforce gets (below) and what a Nachreichung
 * recomputes (nachreich.ts) — one rule for both. Null when the payload is not v3.
 */
export function v3DocumentStatus(data: any): V3DocumentStatus | null {
  const state = v3StateOf(data);
  if (!state) return null;
  const files = filesForSync(data).filter((f) => !f.removed);
  const uploaded: UploadedFile[] = files.map((f) => ({
    fileId: f.documentId,
    requirementId: f.instanceId,
    // A file the analysis could not read counts once a person placed it (spec 4.3 «manuell zuordnen»).
    status: f.analysis?.status === "failed" && !(f.assignedByUser && f.instanceId) ? "failed" : "done",
    outdated: Boolean(f.analysis?.outdated),
    outdatedOverride: Boolean(f.outdatedOverride),
    extraKind: f.instanceId ? undefined : f.extraKind ?? "unknown",
    note: f.analysis?.note ?? undefined,
  }));
  const status = requirementStatus(reqList(state), uploaded, skippedOf(data));
  return { state, files, uploaded, status };
}

export function v3DocumentCaseFields(data: any, previous?: string | null, now: Date = new Date()): Record<string, boolean | string> | null {
  const computed = v3DocumentStatus(data);
  if (!computed) return null;
  const { state, files, uploaded, status } = computed;
  const hints = bankHints(status, uploaded);

  const byId = new Map(files.map((f) => [f.documentId, f]));
  const details: Record<string, CheckStateDetail> = {};
  for (const r of status.requirements) {
    const mine = r.fileIds.map((id) => byId.get(id)).filter((f): f is CompletedFile => !!f);
    if (!mine.length) continue;
    details[r.instance.instanceId] = {
      files: mine.map((f) => ({
        originalName: f.originalName,
        ...(f.storedName ? { storedName: f.storedName } : {}),
        ...(f.url ? { url: f.url } : {}),
        ...(typeof f.analysis?.confidence === "number" ? { confidence: f.analysis.confidence } : {}),
      })),
      fields: mine.flatMap((f) =>
        Object.entries(f.analysis?.fields || {})
          .filter(([, v]) => v && v.value !== null && v.value !== undefined && String(v.value).trim() !== "")
          .map(([key, v]) => ({ key, value: String(v.value), confidence: v.confidence }))
      ),
      audit: mine
        .filter((f) => f.analysis?.docTypeLabel || f.analysis?.docTypeId)
        .map((f) => ({ ts: formatTs(now), text: `${f.originalName}: erkannt als «${f.analysis!.docTypeLabel || f.analysis!.docTypeId}»${pctLabel(f.analysis!.confidence)}` })),
    };
  }
  const extras = filesForSync(data)
    .filter((f) => !f.instanceId || !status.requirements.some((r) => r.fileIds.includes(f.documentId)))
    .map((f) => ({ name: f.storedName || f.originalName, kind: (f.extraKind ?? "unknown") as ExtraKind }));

  const out: Record<string, boolean | string> = { ...status.dokFlags };
  out.Dokumenten_Check_State__c = buildCheckState({ state, status, details, extras, hints, previous, now });
  const folderUrl = data?.v3Completion?.folderWebUrl;
  if (typeof folderUrl === "string" && folderUrl) out.SharePoint_Doc__c = folderUrl;
  return out;
}

function formatTs(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- Mail recipients (DECISIONS D17) ------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who gets the customer confirmation. A v3 Berater submission: the customer from step 1
 * (txt.mail), with a copy to the Berater (D17). Everything else: unchanged (client.email).
 */
export function confirmationRecipients(data: any): { to: string | null; cc: string | null; firstName: string } {
  const v3 = data?.v3;
  const customer = String(v3?.txt?.mail || "").trim();
  if (v3?.role === "berater" && EMAIL_RE.test(customer)) {
    const partner = String(v3?.txt?.bmail || data?.client?.email || "").trim();
    return {
      to: customer,
      cc: EMAIL_RE.test(partner) && partner.toLowerCase() !== customer.toLowerCase() ? partner : null,
      firstName: String(v3?.txt?.vor || "").trim(),
    };
  }
  return { to: data?.client?.email || null, cc: null, firstName: data?.client?.firstName || data?.client?.vorname || "" };
}

// ---- Production dependencies ----------------------------------------------------------------

async function defaultDeps(): Promise<CompletionDeps> {
  return {
    db: prismaDb(),
    graph: graphFiles(),
    renderDossier: createDossierPdf,
    now: () => new Date(),
    log: console,
  };
}

function prismaDb(): CompletionDeps["db"] {
  const load = async () => (await import("@/lib/prisma")).prisma as any;
  return {
    async findDocuments(inquiryId) {
      const prisma = await load();
      return prisma.document.findMany({ where: { inquiryId }, orderBy: { uploadedAt: "asc" } });
    },
    async updateDocument(id, data) {
      const prisma = await load();
      // `storedName` is new (prisma/sql/2026-10-05-document-stored-name.sql); the cast covers a
      // Prisma client generated before it.
      await (prisma.document as any).update({ where: { id }, data, select: { id: true } });
    },
    async setInquiryFolder(inquiryId, folderId) {
      const prisma = await load();
      await prisma.inquiry.update({ where: { id: inquiryId }, data: { sharepointFolderId: folderId }, select: { id: true } });
    },
  };
}

const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_TIMEOUT_MS = 20_000;

function graphFiles(): CompletionDeps["graph"] {
  const drive = () => process.env.DRIVE_ID!;
  const call = (url: string, init: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
  const ref = (j: any): DriveItemRef => ({ id: j.id, name: j.name, webUrl: j.webUrl, parentId: j.parentReference?.id ?? null });
  return {
    async token() {
      return (await import("@/lib/sharepoint")).getAccessToken();
    },
    async getItem(itemId, token) {
      const res = await call(`${GRAPH}/drives/${drive()}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,parentReference`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Graph item lookup failed (${res.status})`);
      return ref(await res.json());
    },
    async rename(itemId, name, token) {
      const res = await call(`${GRAPH}/drives/${drive()}/items/${encodeURIComponent(itemId)}?@microsoft.graph.conflictBehavior=fail`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) return { ok: false, conflict: true };
      if (!res.ok) throw new Error(`Graph rename failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return { ok: true, item: ref(await res.json()) };
    },
    async remove(itemId, token) {
      const { deleteDriveItem } = await import("@/lib/sharepoint");
      await deleteDriveItem(itemId, token);
    },
    async upload(folderId, name, bytes, contentType, token) {
      const res = await call(
        `${GRAPH}/drives/${drive()}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=replace`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: Buffer.from(bytes) }
      );
      if (!res.ok) throw new Error(`Graph upload failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return ref(await res.json());
    },
    async ensureFolder(email, submissionId, token) {
      const { getOrCreateSubmissionFolder } = await import("@/lib/sharepoint");
      return getOrCreateSubmissionFolder(email, submissionId, token);
    },
  };
}
