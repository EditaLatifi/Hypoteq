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
 *
 * Funnel v5 (Handover 6, 7.1; DECISIONS V37):
 *  - The Auskunftsermächtigung stays open until a signed copy is there — also when a copy sits
 *    on P0 that the AI found unsigned (signature.ts): the page then offers its own slot, and a new
 *    copy takes the place of the unsigned one. A signed copy marks InquirySignature «received»
 *    (signatureServer.ts markSignatureReceived) and the Case JSON `signature` carries the server
 *    state (time, reminders, «ohne Unterschrift keine Anfrage an die Bank»). While it is open the
 *    dossier does not count as complete.
 *  - «Unterlagen nachgereicht → keine Mail; Zusammenfassung im Case aktualisieren»: an inquiry
 *    stored by the v5 funnel (state version ≥ 2) gets no confirmation mail; the Case update
 *    stays. Inquiries stored before v5 keep their confirmation mail.
 */

import {
  abgleichCaseField,
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
import { reuploadsForState } from "./reupload";
import { isLang, type Lang } from "./i18n";
import { FUNNEL_STATE_VERSION, normaliseFunnelState } from "./legacy";
import { baseId, isSignatureRequirement } from "./requirements";
import type { RequirementStatus, StatusResult } from "./requirementStatus";
import { CHECK_STATE_MAX_LENGTH } from "./checkState";
import { signatureProblems, signatureView, signatureWithServer, type SignatureServerState, type SignatureView } from "./signature";
import { groupRows } from "@/components/funnel-v3/documents/view";
import { requirementLabel, type MissingRequirement, type NachreichV3View, type RemainingRequirement } from "./nachreichView";

// ---- Persisting at submit (/api/inquiry) ----------------------------------------------------

export interface StoredV3State extends V3State {
  version: number;
  /** The funnel language: labels and mails of the Nachreichung use it. */
  lang: Lang;
}

/**
 * The Inquiry columns a funnel submission stores for a later Nachreichung: the submitted `v3`
 * block in the v5 shape (role, mode, ans, txt, fin, em, info, src, sig, borrowers — legacy.ts)
 * with its version and the funnel language, and the «Habe ich nicht» marks. Only for a v3
 * payload. Inquiries stored before v5 hold the v3 shape; storedV3State reads both.
 */
export function v3InquiryColumns(data: any, lang: string): { v3State: StoredV3State; v3Skipped: string[] } | Record<string, never> {
  const v3 = data?.v3;
  const state = normaliseFunnelState(v3);
  if (!state) return {};
  const skipped = data?.documentCompleteness?.skipped;
  return {
    v3State: {
      ...state,
      // Stored normalised, so always in the v5 shape.
      version: FUNNEL_STATE_VERSION,
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

/**
 * `aiAnalysis` for a file a partner uploaded in the portal for one requirement of a v3 inquiry
 * (app/api/portal/upload/finalize): placed by hand, like the funnel's «manuell zuordnen», so
 * the Nachreich page and its sync count it instead of asking for it again.
 */
export function placedByHand(instanceId: string, now: Date = new Date()) {
  return { v3Submitted: { instanceId, requirementId: baseId(instanceId), assignedByUser: true, submittedAt: now.toISOString() } };
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

/**
 * The Auskunftsermächtigung as signature.ts judges the inquiry's files (Handover 6): «received»
 * only with a signed copy on P0. Null when the list has no P0.
 */
export function serverSignatureView(state: V3State, status: StatusResult, files: CompletedFile[]): SignatureView | null {
  const p0 = status.requirements.find((r) => isSignatureRequirement(r.instance));
  if (!p0) return null;
  return signatureView(
    files.filter((f) => !f.removed).map((f) => ({ fileId: f.documentId, instanceId: f.instanceId, analysis: f.analysis ?? null, assignedByUser: f.assignedByUser })),
    state.sig ?? null,
    p0.instance.person
  );
}

/** P0 still asks for a signed copy (no copy, or only unsigned / wrong ones). */
export function signatureOpen(state: V3State, status: StatusResult, files: CompletedFile[]): boolean {
  const view = serverSignatureView(state, status, files);
  return !!view && view.status !== "received";
}

/**
 * Required requirements that are not fulfilled — what a Nachreichung asks for. With
 * `signatureOpen` the Auskunftsermächtigung counts as open even when an (unsigned) copy fills it.
 */
export function openRequirements(status: StatusResult, opts: { signatureOpen?: boolean } = {}): RequirementStatus[] {
  return status.requirements.filter(
    (r) => !r.instance.optional && (r.state !== "ok" || (opts.signatureOpen === true && isSignatureRequirement(r.instance)))
  );
}

export function missingRequirements(state: V3State, status: StatusResult, lang: Lang, opts: { signatureOpen?: boolean } = {}): MissingRequirement[] {
  const open = openRequirements(status, opts);
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

/**
 * GET for a v3 inquiry. Null when the row is not a v3 inquiry. `reuploads`: HYPOTEQ's open
 * Re-Upload requests — their requirement shows «Neues Dokument angefordert: {Grund}» (5.2).
 */
export function nachreichV3View(
  row: NachreichInquiryRow,
  documents: CompletionDocumentRow[],
  reuploads: readonly { requirement: string; reason: string; status: string }[] = []
): NachreichV3View | null {
  const state = storedV3State(row);
  if (!state) return null;
  const files = filesFromRows(state, documents);
  const status = statusFor(state, files, storedSkipped(row));
  const requested = new Map(reuploads.filter((r) => r.status === "open").map((r) => [r.requirement, r.reason]));
  return {
    valid: true,
    v3: true,
    lang: state.lang,
    caseNumber: row.caseNumber ?? null,
    missing: missingRequirements(state, status, state.lang, { signatureOpen: signatureOpen(state, status, files) }).map((m) =>
      requested.has(m.instanceId) ? { ...m, requested: requested.get(m.instanceId)! } : m
    ),
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
      data: {
        documentsMissing: string | null;
        documentsComplete: boolean;
        nachreichCompletedAt: Date | null;
        /** The stored answers with «Trotzdem einreichen» added (E.4), only when it was chosen here. */
        v3State?: StoredV3State;
      }
    ): Promise<void>;
  };
  /** Graph, dossier renderer, clock and log of the closing (completion.ts); its db is the one above. */
  completion?: Partial<Omit<CompletionDeps, "db">>;
  /** components/updateCaseCompleteness updateCaseV3Documents (test mode guarded there). */
  updateCase(caseId: string, build: (previous: string | null) => Record<string, boolean | string> | null): Promise<unknown>;
  /** lib/funnel-v3/abgleich/config.ts loadPruefregeln: the Abgleich JSON follows the new documents (Spezifikation Datenabgleich 5.4). */
  pruefregeln(): Promise<{ rules: readonly import("./abgleich/rules").PruefRegel[]; from: "salesforce" | "fallback" }>;
  /** lib/funnel-v3/reuploadServer.ts resolveReuploads: the Re-Upload requests this upload answers (5.4). Never throws. */
  resolveReuploads(inquiryId: string, state: V3State, rows: CompletionDocumentRow[], now: Date): Promise<{ requirement: string; requestedAt: Date; resolvedAt: Date | null }[]>;
  /** Pre-v5 inquiries only: v5 sends no mail for documents sent later (Handover 7.1). */
  sendMail(params: NachreichMailParams): Promise<void>;
  /** lib/funnel-v3/signatureServer.ts (InquirySignature), both fail soft. */
  signature: {
    markReceived(inquiryId: string, file: { fileName: string; driveItemId?: string | null }, now: Date): Promise<void>;
    state(inquiryId: string): Promise<SignatureServerState | null>;
  };
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
 * Adopt, rename, recompute, report. `body` is the page's POST: `{ documents: SubmittedDocument[],
 * signatureOverride?: true }` (the second: «Trotzdem einreichen» on the Auskunftsermächtigung).
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
  const statusBefore = statusFor(state, filesBefore, skipped);
  // An unsigned copy on P0 does not close it: the new copy may take its place (Handover 6).
  const sigOpenBefore = signatureOpen(state, statusBefore, filesBefore);
  const openBefore = new Set(openRequirements(statusBefore, { signatureOpen: sigOpenBefore }).map((r) => r.instance.instanceId));
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
  // The same for an Auskunftsermächtigung without a valid signature: a new copy replaces it.
  const earlier: SubmittedDocument[] = filesBefore.map((f) => {
    const prior = storedSubmission(rowsBefore.find((r) => r.id === f.documentId)!);
    const replaced =
      !!f.instanceId &&
      receiving.has(f.instanceId) &&
      ((!!f.analysis?.outdated && !f.outdatedOverride) || (sigOpenBefore && isSignatureRequirement(f.instanceId)));
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
  const now = d.now();

  // HYPOTEQ 19.10. E.4 on this page too: «Trotzdem einreichen – HYPOTEQ prüft manuell» over a
  // copy the AI doubts. Honoured only with a copy that arrives now on P0 (the page posts the
  // choice with it) and kept on the inquiry like the closing's: the page, the dossier, the Case
  // and the reminders then agree that it is received, flagged for the manual check.
  let sigState: StoredV3State = state;
  if (body?.signatureOverride === true && freshAdopted.some((s) => !!s.instanceId && isSignatureRequirement(s.instanceId))) {
    const at = now.toISOString();
    const base = state.sig?.choice === "uploaded" ? state.sig : { choice: "uploaded" as const, at, method: "upload" as const };
    sigState = { ...state, sig: { ...base, override: true, overrideAt: at } };
  }

  // The closing of the submit, run again over every file: stored names (collision-safe,
  // numbered across old and new files), removal of new duplicates, a refreshed Fall-Dossier.
  const data: any = {
    v3: sigState,
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

  // The verdict over ALL documents of the inquiry. Without a signed Auskunftsermächtigung the
  // dossier is not complete (Handover 6: «Ohne Unterschrift geht keine Anfrage an die Bank»).
  const status = v3DocumentStatus(data)!.status;
  const filesAfter: CompletedFile[] = data.v3Completion.files;
  const sigView = serverSignatureView(sigState, status, filesAfter);
  const sigOpenNow = !!sigView && sigView.status !== "received";
  const open = openRequirements(status, { signatureOpen: sigOpenNow });
  const remaining = open.map((r) => r.instance.instanceId);
  const remainingLabels = open.map((r) => ({ instanceId: r.instance.instanceId, label: requirementLabel(r.instance, lang) }));
  const complete = status.completeForSalesforce && !sigOpenNow;

  // A signed copy on P0 (or one submitted anyway, E.4): InquirySignature «received», the reminders stop.
  if (sigView?.status === "received") {
    const signer = status.requirements.find((r) => isSignatureRequirement(r.instance))?.instance.person;
    const fresh = new Set(freshAdopted.map((s) => s.documentId));
    const onP0 = filesAfter.filter((f) => !f.removed && sigView.fileIds.includes(f.documentId));
    const good = onP0.filter((f) => !signatureProblems(f.analysis, signer).length);
    const copy = good.find((f) => fresh.has(f.documentId)) ?? good[0] ?? onP0.find((f) => fresh.has(f.documentId)) ?? onP0[0];
    if (copy) {
      try {
        const driveItemId = rowsAfter.find((r) => r.id === copy.documentId)?.driveItemId ?? null;
        await d.signature.markReceived(row.id, { fileName: copy.storedName || copy.originalName, driveItemId }, now);
      } catch (err) {
        fail("signature", err);
      }
    }
  }

  try {
    await d.db.updateInquiry(row.id, {
      documentsMissing: remaining.length ? remaining.join(",").slice(0, 4000) : null,
      documentsComplete: complete,
      // The link dies the moment the dossier is whole (as for legacy inquiries).
      nachreichCompletedAt: complete ? now : null,
      ...(sigState !== state ? { v3State: sigState } : {}),
    });
  } catch (err) {
    fail("store verdict", err);
  }

  if (row.salesforceCaseId) {
    try {
      const server = await d.signature.state(row.id).catch(() => null);
      const rules = await d.pruefregeln().catch(() => null);
      const reuploads = await d.resolveReuploads(row.id, state, rowsAfter, now).catch(() => []);
      await d.updateCase(row.salesforceCaseId, (previous) => {
        const fields = caseFieldsWithSignature(v3DocumentCaseFields(data, previous, now), server, complete);
        const abgleich = fields && rules ? abgleichCaseField(data, rules, now, reuploadsForState(reuploads)) : null;
        return abgleich ? { ...fields, Funnel_Abgleich_State__c: abgleich } : fields;
      });
    } catch (err) {
      fail("Salesforce", err);
    }
  }

  // Handover 7.1: documents sent later trigger no mail for a v5 inquiry; the Case is the update.
  const v5 = state.version >= FUNNEL_STATE_VERSION;
  const recipients = confirmationRecipients({ v3: state, client: { email: row.client?.email ?? null, firstName: row.client?.firstName ?? "" } });
  if (v5) {
    d.log.log(`${tag} v5 inquiry: no confirmation mail (Handover 7.1)`);
  } else if (recipients.to) {
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

/**
 * The Case fields of the Nachreichung with the Auskunftsermächtigung as the server knows it
 * (Handover 8 «signature: uploaded | pending, Zeitstempel, Methode»): the JSON block gets the
 * InquirySignature state and, while it is open, «ohne Unterschrift keine Anfrage an die Bank»;
 * Documents_completed__c follows `complete` (false while the signature is open). If the enriched
 * JSON would pass the field limit, the block stays as computed.
 */
export function caseFieldsWithSignature(
  fields: Record<string, boolean | string> | null,
  server: SignatureServerState | null,
  complete: boolean
): Record<string, boolean | string> | null {
  if (!fields) return fields;
  const out = { ...fields };
  if ("Documents_completed__c" in out) out.Documents_completed__c = complete;
  const raw = out.Dokumenten_Check_State__c;
  if (typeof raw === "string") {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object" && obj.signature) {
        obj.signature = signatureWithServer(obj.signature, server);
        const json = JSON.stringify(obj);
        if (json.length <= CHECK_STATE_MAX_LENGTH) out.Dokumenten_Check_State__c = json;
      }
    } catch {
      /* not ours to fix: written as computed */
    }
  }
  return out;
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
    async pruefregeln() {
      const { loadPruefregeln } = await import("./abgleich/config");
      return loadPruefregeln();
    },
    async resolveReuploads(inquiryId, state, rows, now) {
      const { resolveReuploads } = await import("./reuploadServer");
      return resolveReuploads(inquiryId, state, rows, now);
    },
    async sendMail(params) {
      const { sendNachreichConfirmation } = await import("@/components/nachreichMail");
      await sendNachreichConfirmation(params);
    },
    signature: {
      async markReceived(inquiryId, file, now) {
        const { markSignatureReceived } = await import("./signatureServer");
        await markSignatureReceived(inquiryId, file, now);
      },
      async state(inquiryId) {
        const { signatureState } = await import("./signatureServer");
        return signatureState(inquiryId);
      },
    },
    now: () => new Date(),
    log: console,
  };
}
