/**
 * Contract for an uploaded file in Funnel v3, between the documents step (writes it), the
 * closing step and dossier (read it), and the server (stores it and renames the file).
 *
 * A file is uploaded to the submission's SharePoint folder the moment it is dropped, then
 * analysed on the server. The analysis decides which requirement it answers — the customer does
 * not assign files (spec 5), except for one the AI could not recognise.
 */

import type { UploadedFile } from "./requirementStatus";

/** Extraction of one value from a document. */
export interface ExtractedField {
  value: string | number | null;
  /** 0–1. Shown as «Erkannt / Prüfen» to customers, as a percentage to the internal role. */
  confidence: number;
}

/**
 * What the analyse route returns for v3 and stores on the row (`aiAnalysis.v3`).
 *
 * `requirementId` is a base requirement id from requirements.ts (e.g. "lohnausweise"), or null
 * when the file is not one of the requirements on the list — then `extraKind` says why.
 */
export interface V3Analysis {
  status: "done" | "failed";
  /** Base requirement id (REQ[].id) the document is, independent of the current list. */
  docTypeId: string | null;
  /** Label of the recognised type, German. */
  docTypeLabel: string | null;
  confidence: number;
  /** Requirement the file was placed on, when its type is on the current list. */
  requirementId: string | null;
  /** Set when the file is kept outside the list (spec 4.3). */
  extraKind?: "surplus" | "duplicate" | "notneeded" | "unknown";
  /** Why it is an extra, for the «Weitere Dateien» list (e.g. "Steuerrechnung"). */
  extraReason?: string;
  /** Person the document belongs to, «Nachname Vorname» as printed. */
  personName?: string | null;
  /** Bank on mortgage documents (for the stored name, spec 5.1). */
  bank?: string | null;
  /** Document date `JJJJ-MM-TT` or `JJJJ` (not the upload date; none on ID documents). */
  docDate?: string | null;
  /** Too old for its purpose (e.g. Grundbuchauszug older than 6 months). */
  outdated?: boolean;
  outdatedReason?: string | null;
  /** Remark for the bank, e.g. «3a-Police an ZKB verpfändet» (spec 3 Schritt 6). */
  note?: string | null;
  fields: Record<string, ExtractedField>;
  /** SHA-256 of the file content, for duplicate detection. */
  contentHash?: string | null;
}

/** One file in the funnel store. */
export interface FileEntry {
  /** Local id, stable for the lifetime of the funnel session. */
  id: string;
  name: string;
  size: number;
  /** Present only in the browser session that picked the file; never persisted. */
  file?: File;
  uploadState: "uploading" | "uploaded" | "failed";
  uploadError?: string | null;
  /** Row id returned by /api/upload-doc/finalize. */
  documentId?: string;
  sharepointUrl?: string | null;
  analysisState: "pending" | "analysing" | "done" | "failed";
  analysis?: V3Analysis;
  /** Requirement instance (requirements.ts instanceId) the file is placed on. */
  instanceId?: string | null;
  /** Chosen by hand for a file the AI could not recognise. */
  assignedByUser?: boolean;
  /** «Trotzdem verwenden» on an outdated document. */
  outdatedOverride?: boolean;
  /** The customer chose to keep a «nicht benötigt» file. */
  keep?: boolean;
}

/** Map store entries to the shape requirementStatus() expects. */
export function toUploadedFiles(files: FileEntry[]): UploadedFile[] {
  return files.map((f) => ({
    fileId: f.id,
    requirementId: f.instanceId ?? null,
    status:
      f.uploadState === "failed" || f.analysisState === "failed"
        ? "failed"
        : f.analysisState === "done"
          ? "done"
          : "analysing",
    outdated: Boolean(f.analysis?.outdated),
    outdatedOverride: Boolean(f.outdatedOverride),
    extraKind: f.instanceId ? undefined : f.analysis?.extraKind,
    note: f.analysis?.note ?? undefined,
  }));
}

/**
 * Per-file detail sent with the submit (`documents[]` in the /api/inquiry payload). The server
 * stores it beside the AI's own analysis and uses it to rename the file in the case folder.
 */
export interface SubmittedDocument {
  documentId: string;
  instanceId: string | null;
  requirementId: string | null;
  extraKind?: V3Analysis["extraKind"];
  keep?: boolean;
  outdatedOverride?: boolean;
  assignedByUser?: boolean;
  /** Values the customer confirmed or corrected in the detail view. */
  humanEdits?: Record<string, string>;
}
