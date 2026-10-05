/**
 * «Finanzierungsanfrage abschliessen» (Spezifikation 3, Schritt 6): wait for what is still
 * running, build the /api/inquiry body, send it.
 *
 *   1. Uploads still running are waited for (they are part of the dossier); a file whose
 *      upload failed stops the submit with its name, so the dossier never silently arrives
 *      without it.
 *   2. Analyses still running are waited for at most ANALYSIS_WAIT_MS (20 s, like the old
 *      documents step): an analysis is not required for the submit, its result is stored with
 *      the file either way; waiting a little only lets a verdict about to land count.
 *   3. The body is toInquiryPayload(...) with the per-file detail (submittedDocuments()) and
 *      the completeness verdict of the requirement status.
 *
 * Idempotent: the body carries the store's submissionId, and /api/inquiry answers a repeated
 * submission with the inquiry it already created — so «Erneut versuchen» after a dropped
 * response can never create a second lead.
 *
 * Framework-free (no React, no store import): the caller passes a getter for the current
 * state, so a test can drive it with a plain object and a fake fetch.
 */

import { documentsSummary, type DocumentsSummary } from "./documentsSummary";
import type { FileEntry } from "./files";
import { translate, type Lang } from "./i18n";
import { toInquiryPayload, type InquiryPayload } from "./toInquiryPayload";
import type { FunnelState } from "./types";

export const ANALYSIS_WAIT_MS = 20_000;
/** Uploads are chunked and can be large; past this the customer is told to wait and retry. */
export const UPLOAD_WAIT_MS = 120_000;
export const POLL_MS = 400;

export type SubmitPhase = "uploading" | "analysing" | "sending";

export type SubmitErrorCode = "network" | "invalid" | "server" | "upload" | "uploadPending";

/** A submit failure with a message in the funnel language, ready to show. */
export class SubmitError extends Error {
  constructor(
    public readonly code: SubmitErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "SubmitError";
  }
}

export interface SubmitState extends FunnelState {
  submissionId: string;
  sharepointFolderId: string | null;
  files: FileEntry[] | unknown[];
  skipped?: Iterable<string>;
}

export interface SubmitOptions {
  getState: () => SubmitState;
  lang: Lang;
  fetchImpl?: typeof fetch;
  onPhase?: (phase: SubmitPhase) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  analysisWaitMs?: number;
  uploadWaitMs?: number;
  pollMs?: number;
}

export interface SubmitResult {
  inquiryId: string;
  /** HQ-JJ-MM-NNNNNN; null when the server could not allocate one (the inquiry is saved). */
  caseNumber: string | null;
  alreadySubmitted: boolean;
}

export interface DocumentCompleteness {
  /** Every required requirement ok — `completeForSalesforce`. */
  complete: boolean;
  /** Instance ids of required requirements that are not ok. */
  missing: string[];
  /** The same, as German labels (Salesforce, internal mail). */
  missingLabels: string[];
  /** The same, in the funnel language (the customer's «fehlende Unterlagen» mail). */
  missingLabelsLocale: string[];
  /** Instance ids marked «Habe ich nicht». */
  skipped: string[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isUploading = (f: FileEntry) => f.uploadState === "uploading";
const isAnalysing = (f: FileEntry) => f.uploadState === "uploaded" && (f.analysisState === "pending" || f.analysisState === "analysing");

/** The completeness verdict sent with the submit (stored on the Inquiry, read by the mails). */
export function documentCompleteness(summary: DocumentsSummary, lang: Lang): DocumentCompleteness {
  const open = summary.status.requirements.filter((r) => !r.instance.optional && r.state !== "ok");
  const who = (display?: string) => (display ? ` – ${display}` : "");
  return {
    complete: summary.status.completeForSalesforce,
    missing: open.map((r) => r.instance.instanceId),
    missingLabels: open.map((r) => r.instance.labelDe + who(r.instance.person?.display)),
    missingLabelsLocale: open.map((r) => translate(lang, r.instance.labelKey) + who(r.instance.person?.display)),
    skipped: summary.status.requirements.filter((r) => r.state === "skipped").map((r) => r.instance.instanceId),
  };
}

/** The /api/inquiry body for the current state. */
export function buildSubmitPayload(state: SubmitState, lang: Lang): InquiryPayload {
  const summary = documentsSummary(state);
  return toInquiryPayload(state, {
    locale: lang,
    submissionId: state.submissionId,
    sharepointFolderId: state.sharepointFolderId,
    documents: summary.submittedDocuments(),
    documentCompleteness: documentCompleteness(summary, lang),
  });
}

/** Wait for uploads (required) and analyses (capped). Throws a SubmitError for a failed upload. */
export async function waitForFiles(opts: SubmitOptions): Promise<void> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const t = (key: string, params?: Record<string, string | number>) => translate(opts.lang, key, params);
  const start = now();
  let analysisStart: number | null = null;
  for (;;) {
    const files = documentsSummary(opts.getState()).files;
    const failed = files.find((f) => f.uploadState === "failed");
    if (failed) throw new SubmitError("upload", t("s6.err.upload", { name: failed.name }), failed.name);
    if (files.some(isUploading)) {
      if (now() - start >= (opts.uploadWaitMs ?? UPLOAD_WAIT_MS)) throw new SubmitError("uploadPending", t("s6.err.uploadPending"));
      opts.onPhase?.("uploading");
    } else if (files.some(isAnalysing)) {
      analysisStart ??= now();
      if (now() - analysisStart >= (opts.analysisWaitMs ?? ANALYSIS_WAIT_MS)) return;
      opts.onPhase?.("analysing");
    } else {
      return;
    }
    await sleep(opts.pollMs ?? POLL_MS);
  }
}

export async function submitFunnel(opts: SubmitOptions): Promise<SubmitResult> {
  const t = (key: string) => translate(opts.lang, key);
  const doFetch = opts.fetchImpl ?? fetch;

  await waitForFiles(opts);

  opts.onPhase?.("sending");
  const payload = buildSubmitPayload(opts.getState(), opts.lang);

  let res: Response;
  try {
    res = await doFetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": opts.lang },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new SubmitError("network", t("s6.err.network"), err instanceof Error ? err.message : String(err));
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* an HTML error page or an empty body */
  }

  if (res.status === 400) throw new SubmitError("invalid", t("s6.err.invalid"), json?.error);
  if (!res.ok || !json?.success || typeof json.inquiryId !== "string") {
    throw new SubmitError("server", t("s6.err.submit"), json?.error ?? `HTTP ${res.status}`);
  }
  return {
    inquiryId: json.inquiryId,
    caseNumber: typeof json.caseNumber === "string" && json.caseNumber ? json.caseNumber : null,
    alreadySubmitted: json.alreadySubmitted === true,
  };
}
