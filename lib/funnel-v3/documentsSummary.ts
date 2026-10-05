// PROVISIONAL: replaced by the documents engineer
//
// The contract step 6 (Abschluss), the submit and the dossier preview code against:
//
//   documentsSummary(state) → { status, files, hints, suggestions, submittedDocuments() }
//
// This thin version derives everything from the store with the merged pure modules
// (requirements, requirementStatus, files). The documents step replaces it with the real one;
// keep the exported names and shapes.

import type { FileEntry, SubmittedDocument } from "./files";
import { toUploadedFiles } from "./files";
import { reqList, type ReqState } from "./requirements";
import {
  answerCorrections,
  bankHints,
  requirementStatus,
  type AnswerCorrection,
  type BankHint,
  type StatusResult,
} from "./requirementStatus";

export interface DocumentsSummaryInput extends ReqState {
  files: FileEntry[] | unknown[];
  /** Instance ids marked «Habe ich nicht». */
  skipped?: Iterable<string>;
}

export interface DocumentsSummary {
  status: StatusResult;
  files: FileEntry[];
  hints: BankHint[];
  suggestions: AnswerCorrection[];
  submittedDocuments(): SubmittedDocument[];
}

export function documentsSummary(state: DocumentsSummaryInput): DocumentsSummary {
  const files = (Array.isArray(state.files) ? state.files : []).filter(
    (f): f is FileEntry => !!f && typeof f === "object" && typeof (f as FileEntry).id === "string"
  );
  const uploaded = toUploadedFiles(files);
  const status = requirementStatus(reqList(state), uploaded, state.skipped ?? []);
  const recognised = files.map((f) => f.instanceId || f.analysis?.requirementId || f.analysis?.docTypeId).filter((x): x is string => !!x);
  return {
    status,
    files,
    hints: bankHints(status, uploaded),
    suggestions: answerCorrections(state, recognised),
    submittedDocuments: () =>
      files
        .filter((f) => f.documentId && f.uploadState === "uploaded")
        .map((f) => ({
          documentId: f.documentId!,
          instanceId: f.instanceId ?? null,
          requirementId: f.analysis?.requirementId ?? f.analysis?.docTypeId ?? null,
          ...(f.instanceId ? {} : f.analysis?.extraKind ? { extraKind: f.analysis.extraKind } : {}),
          ...(f.keep ? { keep: true } : {}),
          ...(f.outdatedOverride ? { outdatedOverride: true } : {}),
          ...(f.assignedByUser ? { assignedByUser: true } : {}),
        })),
  };
}
