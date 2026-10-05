/**
 * Funnel v3 Nachreichung on the server (app/api/nachreichen/[token]; spec V2, 4, 5.1, 6.9,
 * 6.11). A v3 inquiry stores its missing documents as requirement instance ids and keeps the
 * answers they came from (`Inquiry.v3State`, `Inquiry.v3Skipped`). From those and the
 * inquiry's Document rows this module
 *
 *   GET   lists what is still open, labelled in the inquiry's language, and
 *   POST  adopts the newly uploaded files onto the inquiry, renames every file to its stored
 *         name and refreshes the Fall-Dossier (completion.ts — the same closing the submit
 *         runs), recomputes the requirement status from ALL documents, stores the new verdict,
 *         writes the v3 document fields onto the Case and confirms by mail.
 *
 * Legacy inquiries (no v3State, `funnel.*` keys) never reach this module.
 *
 * Every side effect after the adoption is non-fatal, like at submit: the files are in the case
 * folder and on the inquiry by then, and a SharePoint, Salesforce or mail hiccup must not tell
 * the customer that their upload failed. Test mode: uploads went to the ZZ-TEST_ folder; the
 * Case update and the mail are withheld by updateCaseV3Documents / routeMail.
 */

import {
  completeV3Inquiry,
  confirmationRecipients,
  planFiles,
  submittedDocumentsOf,
  v3DocumentCaseFields,
  v3DocumentStatus,
  v3StateOf,
  type CompletedFile,
  type CompletionDeps,
  type CompletionDocumentRow,
  type V3CompletionResult,
  type V3State,
} from "./completion";
import type { SubmittedDocument } from "./files";
import { isLang, type Lang } from "./i18n";
import { baseId } from "./requirements";
import type { RequirementStatus, StatusResult } from "./requirementStatus";
import { groupRows } from "@/components/funnel-v3/documents/view";
import { requirementLabel, type MissingRequirement, type NachreichV3View, type RemainingRequirement } from "./nachreichView";

// ---- Persisting at submit (/api/inquiry) ----------------------------------------------------

export interface StoredV3State extends V3State {
  version: number;
  /** The funnel language: labels and mails of the Nachreichung use it. */
  lang: Lang;
}

/**
 * The Inquiry columns a v3 submission stores for a later Nachreichung: the submitted `v3`
 * block (role, ans, txt, fin, borrowers) with the funnel language, and the «Habe ich nicht»
 * marks. Only for a v3 payload.
 */
export function v3InquiryColumns(data: any, lang: string): { v3State: StoredV3State; v3Skipped: string[] } | Record<string, never> {
  const v3 = data?.v3;
  if (!v3 || typeof v3 !== "object") return {};
  const skipped = data?.documentCompleteness?.skipped;
  return {
    v3State: {
      version: typeof v3.version === "number" ? v3.version : 1,
      role: v3.role ?? null,
      ans: v3.ans ?? null,
      txt: v3.txt ?? null,
      fin: v3.fin ?? null,
      borrowers: Array.isArray(v3.borrowers) ? v3.borrowers : [],
      lang: isLang(lang) ? lang : "de",
    },
    v3Skipped: Array.isArray(skipped) ? skipped.filter((s: unknown): s is string => typeof s === "string") : [],
  };
}

// ---- Reading an inquiry ---------------------------------------------------------------------

/** The Inquiry columns this module reads. */
export interface NachreichInquiryRow {
  id: string;
  caseNumber?: string | null;
  salesforceCaseId?: string | null;
  sharepointFolderId?: string | null;
  documentsMissing?: string | null;
  nachreichExpiresAt?: Date | string | null;
  v3State?: unknown;
  v3Skipped?: unknown;
  client?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
}

/** The stored answers of a v3 inquiry, or null for a legacy one. */
export function storedV3State(row: Pick<NachreichInquiryRow, "v3State"> | null | undefined): StoredV3State | null {
  const raw = row?.v3State as any;
  const state = v3StateOf({ v3: raw });
  if (!state) return null;
  return { ...state, version: typeof raw.version === "number" ? raw.version : 1, lang: isLang(raw.lang) ? raw.lang : "de" };
}

export function isV3Inquiry(row: Pick<NachreichInquiryRow, "v3State"> | null | undefined): boolean {
  return storedV3State(row) !== null;
}

function storedSkipped(row: NachreichInquiryRow): string[] {
  return Array.isArray(row.v3Skipped) ? row.v3Skipped.filter((s): s is string => typeof s === "string") : [];
}

const isRemoved = (r: CompletionDocumentRow) => Boolean((r.aiAnalysis as any)?.v3Completion?.removed);

/** Rows whose file is still in the case folder (a duplicate the closing deleted keeps its row). */
export function liveRows(rows: CompletionDocumentRow[]): CompletionDocumentRow[] {
  return rows.filter((r) => !isRemoved(r));
}

/** What the customer decided about a file when it was submitted (aiAnalysis.v3Submitted). */
export function storedSubmission(row: CompletionDocumentRow): SubmittedDocument | null {
  const s = (row.aiAnalysis as any)?.v3Submitted;
  if (!s || typeof s !== "object") return null;
  const { submittedAt: _at, documentId: _id, ...rest } = s;
  return { ...rest, documentId: row.id, instanceId: rest.instanceId ?? null, requirementId: rest.requirementId ?? null };
}

/** Rows with `aiAnalysis.v3Submitted` replaced by the given detail (for files the closing could not process). */
function withSubmissions(rows: CompletionDocumentRow[], subs: SubmittedDocument[]): CompletionDocumentRow[] {
  const byId = new Map(subs.map((s) => [s.documentId, s]));
  return rows.map((r) => {
    const sub = byId.get(r.id);
    if (!sub) return r;
    const ai = r.aiAnalysis && typeof r.aiAnalysis === "object" ? (r.aiAnalysis as Record<string, unknown>) : {};
    const { documentId: _id, ...detail } = sub;
    return { ...r, aiAnalysis: { ...ai, v3Submitted: detail } };
  });
}

/**
 * The inquiry's files as the requirement status sees them: placed by the stored submit detail,
 * else by the AI's verdict (planFiles — the closing's own rule).
 */
export function filesFromRows(state: V3State, rows: CompletionDocumentRow[]): CompletedFile[] {
  const live = liveRows(rows);
  const subs = live.map(storedSubmission).filter((s): s is SubmittedDocument => !!s);
  return planFiles(state, live, subs, null).map((p) => ({
    documentId: p.row.id,
    originalName: p.row.originalFileName || p.row.fileName,
    storedName: p.row.storedName ?? null,
    url: p.row.fileUrl ?? null,
    instanceId: p.instance?.instanceId ?? null,
    requirementId: p.instance?.id ?? p.sub?.requirementId ?? p.analysis?.docTypeId ?? null,
    ...(p.instance ? {} : { extraKind: p.extraKind }),
    ...(p.sub?.keep ? { keep: true } : {}),
    ...(p.sub?.outdatedOverride ? { outdatedOverride: true } : {}),
    ...(p.sub?.assignedByUser && p.instance ? { assignedByUser: true } : {}),
    removed: false,
    analysis: p.analysis,
  }));
}

function statusFor(state: V3State, files: CompletedFile[], skipped: string[]): StatusResult {
  return v3DocumentStatus({ v3: state, v3Completion: { files }, documentCompleteness: { skipped } })!.status;
}

/** Required requirements that are not fulfilled — what a Nachreichung asks for. */
export function openRequirements(status: StatusResult): RequirementStatus[] {
  return status.requirements.filter((r) => !r.instance.optional && r.state !== "ok");
}

export function missingRequirements(state: V3State, status: StatusResult, lang: Lang): MissingRequirement[] {
  const open = openRequirements(status);
  const groups = groupRows(open, state, lang);
  const groupOf = new Map<string, { key: string; title: string }>();
  for (const g of groups) for (const r of g.rows) groupOf.set(r.instance.instanceId, { key: g.key, title: g.title });
  // groupRows' order: Objekt · Hypothek · Person per Kreditnehmer · Eigenmittel.
  return groups.flatMap((g) =>
    g.rows.map((r): MissingRequirement => {
      const inst = r.instance;
      const g2 = groupOf.get(inst.instanceId)!;
      return {
        instanceId: inst.instanceId,
        id: inst.id,
        label: requirementLabel(inst, lang),
        group: inst.group,
        groupKey: g2.key,
        groupLabel: g2.title,
        reason: inst.reason,
        person: inst.person ?? null,
        expect: inst.expect,
        have: r.doneFiles,
        slots: r.state === "outdated" ? inst.expect : Math.max(1, inst.expect - r.doneFiles),
        state: r.state === "partial" || r.state === "outdated" || r.state === "analysing" ? r.state : "missing",
      };
    })
  );
}

/** GET for a v3 inquiry. Null when the row is not a v3 inquiry. */
export function nachreichV3View(row: NachreichInquiryRow, documents: CompletionDocumentRow[]): NachreichV3View | null {
  const state = storedV3State(row);
  if (!state) return null;
  const status = statusFor(state, filesFromRows(state, documents), storedSkipped(row));
  return {
    valid: true,
    v3: true,
    lang: state.lang,
    caseNumber: row.caseNumber ?? null,
    missing: missingRequirements(state, status, state.lang),
    expiresAt: row.nachreichExpiresAt ?? null,
    email: row.client?.email ?? null,
    folderId: row.sharepointFolderId ?? null,
    submissionId: row.id,
  };
}

// ---- POST ---------------------------------------------------------------------------------

export interface NachreichMailParams {
  to: string;
  cc?: string | null;
  name: string;
  locale: Lang;
  complete: boolean;
  remaining: string[];
  remainingLabels: string[];
}

export interface NachreichV3Deps {
  db: {
    findDocuments(inquiryId: string): Promise<CompletionDocumentRow[]>;
    /** Held uploads of this inquiry → Document rows (lib/sharepoint adoptHoldingDocuments). */
    adoptHeld(inquiryId: string, documents: SubmittedDocument[]): Promise<number>;
    updateDocument: CompletionDeps["db"]["updateDocument"];
    setInquiryFolder: CompletionDeps["db"]["setInquiryFolder"];
    updateInquiry(
      id: string,
      data: { documentsMissing: string | null; documentsComplete: boolean; nachreichCompletedAt: Date | null }
    ): Promise<void>;
  };
  /** Graph, dossier renderer, clock and log of the closing (completion.ts); its db is the one above. */
  completion?: Partial<Omit<CompletionDeps, "db">>;
  /** components/updateCaseCompleteness updateCaseV3Documents (test mode guarded there). */
  updateCase(caseId: string, build: (previous: string | null) => Record<string, boolean | string> | null): Promise<unknown>;
  sendMail(params: NachreichMailParams): Promise<void>;
  now(): Date;
  log: Pick<Console, "log" | "warn" | "error">;
}

export type NachreichV3Result =
  | {
      ok: true;
      complete: boolean;
      /** Instance ids still open. */
      remaining: string[];
      remainingLabels: RemainingRequirement[];
      adopted: number;
      /** Steps after the adoption that failed (each logged); empty when everything ran. */
      errors: string[];
    }
  | { ok: false; status: 400; error: string };

/** At most this many files per Nachreichung — a dossier is a few dozen documents. */
const MAX_DOCUMENTS = 200;

/**
 * Adopt, rename, recompute, report. `body` is the page's POST: `{ documents: SubmittedDocument[] }`.
 * The caller has checked the token (rejectNachreich) and that the row is a v3 inquiry.
 */
export async function submitV3Nachreichung(row: NachreichInquiryRow, body: any, deps?: Partial<NachreichV3Deps>): Promise<NachreichV3Result> {
  const state = storedV3State(row);
  if (!state) return { ok: false, status: 400, error: "not a v3 inquiry" };
  const d: NachreichV3Deps = { ...defaultDeps(), ...(deps || {}) } as NachreichV3Deps;
  const tag = `[v3 Nachreichung ${row.id}]`;
  const errors: string[] = [];
  const fail = (step: string, err: unknown) => {
    const msg = `${step}: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    d.log.error(`${tag} ${msg}`);
  };
  const lang = state.lang;
  const skipped = storedSkipped(row);

  const submitted = submittedDocumentsOf(body).slice(0, MAX_DOCUMENTS);
  if (!submitted.length) return { ok: false, status: 400, error: "No documents" };

  // What was open before this upload. Trust the token, not the payload: a file may only be
  // placed on a requirement this inquiry is still waiting for; anything else is kept as an
  // extra rather than rejected, so a stale tab cannot fail an otherwise good upload.
  const rowsBefore = liveRows(await d.db.findDocuments(row.id));
  const known = new Set(rowsBefore.map((r) => r.id));
  const filesBefore = filesFromRows(state, rowsBefore);
  const openBefore = new Set(openRequirements(statusFor(state, filesBefore, skipped)).map((r) => r.instance.instanceId));
  const fresh: SubmittedDocument[] = submitted
    .filter((s) => !known.has(s.documentId))
    .map((s) => {
      // Customers see the stored name, they do not set it (spec 5.1).
      const { storedName: _name, ...detail } = s;
      if (detail.instanceId && openBefore.has(detail.instanceId)) return { ...detail, requirementId: baseId(detail.instanceId) };
      const { extraKind } = detail;
      return { ...detail, instanceId: null, assignedByUser: false, extraKind: extraKind ?? (detail.instanceId ? "surplus" : "unknown") };
    });

  // The uploads were filed under this inquiry's id; they become its Document rows now.
  let adopted = 0;
  if (fresh.length) adopted = await d.db.adoptHeld(row.id, fresh);
  const rowsAfter = liveRows(await d.db.findDocuments(row.id));
  const newIds = new Set(rowsAfter.filter((r) => !known.has(r.id)).map((r) => r.id));
  const freshAdopted = fresh.filter((s) => newIds.has(s.documentId));
  if (!freshAdopted.length) return { ok: false, status: 400, error: "No new documents for this inquiry" };

  // The earlier files keep their placement — except an outdated document that a new one now
  // replaces («Aktuelles hochladen»): it stays in the dossier as an extra and stops counting.
  const receiving = new Set(freshAdopted.map((s) => s.instanceId).filter((x): x is string => !!x));
  const earlier: SubmittedDocument[] = filesBefore.map((f) => {
    const prior = storedSubmission(rowsBefore.find((r) => r.id === f.documentId)!);
    const replaced = !!f.instanceId && receiving.has(f.instanceId) && !!f.analysis?.outdated && !f.outdatedOverride;
    const instanceId = replaced ? null : f.instanceId;
    return {
      ...(prior ?? {}),
      documentId: f.documentId,
      instanceId,
      requirementId: f.requirementId,
      ...(instanceId ? { extraKind: undefined } : { extraKind: replaced ? "surplus" : f.extraKind ?? "unknown" }),
      ...(f.keep ? { keep: true } : {}),
      ...(f.outdatedOverride ? { outdatedOverride: true } : {}),
    };
  });
  const documents = [...earlier, ...freshAdopted];

  // The closing of the submit, run again over every file: stored names (collision-safe,
  // numbered across old and new files), removal of new duplicates, a refreshed Fall-Dossier.
  const data: any = {
    v3: state,
    locale: lang,
    documents,
    documentCompleteness: { skipped },
    sharepointFolderId: row.sharepointFolderId ?? null,
    client: { email: row.client?.email ?? "" },
  };
  let completion: V3CompletionResult | null = null;
  try {
    completion = await completeV3Inquiry(
      { inquiryId: row.id, submissionId: row.id, caseNumber: row.caseNumber ?? null, data },
      {
        ...(d.completion || {}),
        db: {
          findDocuments: async () => rowsAfter.map((r) => ({ ...r })),
          updateDocument: d.db.updateDocument,
          setInquiryFolder: d.db.setInquiryFolder,
        },
      }
    );
    if (completion?.errors.length) errors.push(...completion.errors);
  } catch (err) {
    fail("closing", err);
  }
  data.v3Completion = completion ?? {
    folderId: row.sharepointFolderId ?? null,
    folderWebUrl: null,
    files: filesFromRows(state, withSubmissions(rowsAfter, documents)),
    dossier: null,
    errors,
  };

  // The verdict over ALL documents of the inquiry.
  const status = v3DocumentStatus(data)!.status;
  const open = openRequirements(status);
  const remaining = open.map((r) => r.instance.instanceId);
  const remainingLabels = open.map((r) => ({ instanceId: r.instance.instanceId, label: requirementLabel(r.instance, lang) }));
  const complete = status.completeForSalesforce;
  const now = d.now();

  try {
    await d.db.updateInquiry(row.id, {
      documentsMissing: remaining.length ? remaining.join(",").slice(0, 4000) : null,
      documentsComplete: complete,
      // The link dies the moment the dossier is whole (as for legacy inquiries).
      nachreichCompletedAt: complete ? now : null,
    });
  } catch (err) {
    fail("store verdict", err);
  }

  if (row.salesforceCaseId) {
    try {
      await d.updateCase(row.salesforceCaseId, (previous) => v3DocumentCaseFields(data, previous, now));
    } catch (err) {
      fail("Salesforce", err);
    }
  }

  const recipients = confirmationRecipients({ v3: state, client: { email: row.client?.email ?? null, firstName: row.client?.firstName ?? "" } });
  if (recipients.to) {
    try {
      const name =
        [state.txt?.vor, state.txt?.nach].map((s) => (s || "").trim()).filter(Boolean).join(" ") ||
        `${row.client?.firstName || ""} ${row.client?.lastName || ""}`.trim();
      await d.sendMail({
        to: recipients.to,
        cc: recipients.cc,
        name,
        locale: lang,
        complete,
        remaining,
        remainingLabels: remainingLabels.map((r) => r.label),
      });
    } catch (err) {
      fail("mail", err);
    }
  }

  d.log.log(`${tag} +${freshAdopted.length} file(s), ${remaining.length} requirement(s) still open, ${errors.length} error(s)`);
  return { ok: true, complete, remaining, remainingLabels, adopted: Math.max(adopted, freshAdopted.length), errors };
}

// ---- Production dependencies ----------------------------------------------------------------

function defaultDeps(): NachreichV3Deps {
  const load = async () => (await import("@/lib/prisma")).prisma as any;
  return {
    db: {
      async findDocuments(inquiryId) {
        const prisma = await load();
        return prisma.document.findMany({ where: { inquiryId }, orderBy: { uploadedAt: "asc" } });
      },
      async adoptHeld(inquiryId, documents) {
        const { adoptHoldingDocuments } = await import("@/lib/sharepoint");
        // The page files its uploads under the inquiry id (its submission id).
        return adoptHoldingDocuments(inquiryId, inquiryId, documents as any);
      },
      async updateDocument(id, data) {
        const prisma = await load();
        // `storedName` (prisma/sql/2026-10-05-document-stored-name.sql): cast for an older client.
        await (prisma.document as any).update({ where: { id }, data, select: { id: true } });
      },
      async setInquiryFolder(inquiryId, folderId) {
        const prisma = await load();
        await prisma.inquiry.update({ where: { id: inquiryId }, data: { sharepointFolderId: folderId }, select: { id: true } });
      },
      async updateInquiry(id, data) {
        const prisma = await load();
        await prisma.inquiry.update({ where: { id }, data, select: { id: true } });
      },
    },
    async updateCase(caseId, build) {
      const { updateCaseV3Documents } = await import("@/components/updateCaseCompleteness");
      return updateCaseV3Documents(caseId, build);
    },
    async sendMail(params) {
      const { sendNachreichConfirmation } = await import("@/components/nachreichMail");
      await sendNachreichConfirmation(params);
    },
    now: () => new Date(),
    log: console,
  };
}
