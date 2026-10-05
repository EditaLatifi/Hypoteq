/**
 * The closing's outcome, kept per submission in sessionStorage so a reload of the closing step
 * still shows «Anfrage … ist bei HYPOTEQ» instead of offering to submit again. (A second submit
 * would be harmless — /api/inquiry is idempotent — but confusing.) Storage failures are ignored:
 * the screen then simply falls back to the submit button.
 */

export interface DoneInfo {
  submissionId: string;
  inquiryId: string;
  caseNumber: string | null;
  /** Who gets the confirmation (spec Schritt 6: «{name} erhält eine Bestätigung an {email}»). */
  name: string;
  email: string;
}

const KEY = (submissionId: string) => `hypoteq-funnel-v3-done:${submissionId}`;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readDone(submissionId: string): DoneInfo | null {
  try {
    const raw = storage()?.getItem(KEY(submissionId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.submissionId === submissionId && typeof v.inquiryId === "string" ? (v as DoneInfo) : null;
  } catch {
    return null;
  }
}

export function saveDone(info: DoneInfo): void {
  try {
    storage()?.setItem(KEY(info.submissionId), JSON.stringify(info));
  } catch {
    /* private mode / quota: the done state just does not survive a reload */
  }
}

export function clearDone(submissionId: string): void {
  try {
    storage()?.removeItem(KEY(submissionId));
  } catch {
    /* nothing to clear */
  }
}

/** The stored dossier after the closing (guarded by the submission id). */
export function storedDossierUrl(info: Pick<DoneInfo, "inquiryId" | "submissionId">): string {
  return `/api/dossier/${encodeURIComponent(info.inquiryId)}?submissionId=${encodeURIComponent(info.submissionId)}`;
}
