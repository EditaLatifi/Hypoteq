/**
 * Everything the closing step (and the step 5 UI) needs about the documents, derived in one
 * place from the store: placement for the CURRENT answers, requirement states, bank hints,
 * answer-correction suggestions and the per-file detail sent with the submit.
 *
 * Pure (`documentsSummary`) plus a hook (`useDocumentsSummary`). Placement is recomputed here
 * rather than read from the stored `instanceId`, so the summary is right even when the answers
 * changed while step 5 was not mounted.
 */

import { useMemo } from "react";
import { useFunnelV3 } from "./store";
import { toUploadedFiles, type FileEntry, type SubmittedDocument } from "./files";
import { placeAll, withPlacement, type Placement } from "./placeFile";
import { baseId, reqList, type ReqState, type RequirementInstance } from "./requirements";
import {
  answerCorrections,
  bankHints,
  requirementStatus,
  type AnswerCorrection,
  type BankHint,
  type StatusResult,
  type UploadedFile,
} from "./requirementStatus";
import { familyMembers, v3DocType } from "@/components/documentIntelligence/v3/catalogue";

export interface DocumentsSummaryInput extends ReqState {
  files: FileEntry[];
  skipped: string[];
  dismissed: string[];
}

export interface DocumentSuggestion extends AnswerCorrection {
  /** The uploaded files that triggered it («Dokument nicht verwenden» dismisses these). */
  fileIds: string[];
}

export interface DocumentsSummary {
  instances: RequirementInstance[];
  /** Files with the placement for the current answers applied. */
  files: FileEntry[];
  placements: Map<string, Placement>;
  uploaded: UploadedFile[];
  status: StatusResult;
  hints: BankHint[];
  suggestions: DocumentSuggestion[];
  /** Files still uploading or being read. */
  busy: number;
  /** Recognised values on counted files («Aus Dokumenten übernommen: N Angaben»). */
  fieldsRead: number;
  /** Files whose values the customer confirmed («m manuell bestätigt»). */
  confirmed: number;
  /** `documents[]` for the /api/inquiry payload (only uploaded files; see below). */
  submittedDocuments(): SubmittedDocument[];
}

/** Whether a file goes to the dossier (spec 5.1: not-needed files only when kept). */
export function isSubmitted(f: FileEntry): boolean {
  if (!f.documentId || f.uploadState !== "uploaded") return false;
  if (f.instanceId) return true;
  return f.analysis?.extraKind !== "notneeded" || Boolean(f.keep);
}

export function toSubmittedDocument(f: FileEntry): SubmittedDocument {
  const typeId = f.analysis?.docTypeId;
  const reqType = typeId && v3DocType(typeId)?.kind === "requirement" ? typeId : null;
  const edits = f.humanEdits && Object.keys(f.humanEdits).length ? f.humanEdits : undefined;
  return {
    documentId: f.documentId!,
    instanceId: f.instanceId ?? null,
    requirementId: f.instanceId ? baseId(f.instanceId) : f.analysis?.requirementId ?? reqType,
    ...(f.instanceId ? {} : f.analysis?.extraKind ? { extraKind: f.analysis.extraKind } : {}),
    ...(f.keep ? { keep: true } : {}),
    ...(f.outdatedOverride ? { outdatedOverride: true } : {}),
    ...(f.assignedByUser ? { assignedByUser: true } : {}),
    ...(edits ? { humanEdits: edits } : {}),
    ...(f.confirmed ? { confirmed: true } : {}),
    ...(f.nameOverride ? { storedName: f.nameOverride } : {}),
  };
}

export function documentsSummary(input: DocumentsSummaryInput, opts: { now?: Date } = {}): DocumentsSummary {
  const state: ReqState = { ans: input.ans, borrowers: input.borrowers, txt: input.txt };
  const instances = reqList(state);
  const placements = placeAll(input.files, state, { now: opts.now, dismissed: input.dismissed });
  const files = input.files.map((f) => withPlacement(f, placements.get(f.id)));
  const uploaded = toUploadedFiles(files);
  const status = requirementStatus(instances, uploaded, input.skipped);
  const hints = bankHints(status, uploaded);

  // Spec 4.4: recognised documents that are not on the list (and not turned down).
  const dismissed = new Set(input.dismissed);
  const offList = files.filter(
    (f) => f.analysisState === "done" && placements.get(f.id)?.reason === "offList" && !dismissed.has(f.id)
  );
  const suggestions: DocumentSuggestion[] = answerCorrections(
    state,
    offList.map((f) => f.analysis!.docTypeId!).filter(Boolean)
  ).map((c) => {
    const ids = new Set(c.requirementIds.flatMap((id) => familyMembers(id)));
    return { ...c, fileIds: offList.filter((f) => ids.has(f.analysis!.docTypeId!)).map((f) => f.id) };
  });

  const counted = new Set(status.requirements.flatMap((r) => r.fileIds));
  const fieldsRead = files
    .filter((f) => counted.has(f.id) && f.analysis)
    .reduce((n, f) => n + Object.keys(f.analysis!.fields || {}).length, 0);

  return {
    instances,
    files,
    placements,
    uploaded,
    status,
    hints,
    suggestions,
    busy: files.filter((f) => f.uploadState === "uploading" || (f.uploadState === "uploaded" && (f.analysisState === "pending" || f.analysisState === "analysing"))).length,
    fieldsRead,
    confirmed: files.filter((f) => f.confirmed).length,
    submittedDocuments: () => files.filter(isSubmitted).map(toSubmittedDocument),
  };
}

/** React binding: recomputed when answers, borrowers, texts or files change. */
export function useDocumentsSummary(opts: { now?: Date } = {}): DocumentsSummary {
  const ans = useFunnelV3((s) => s.ans);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const txt = useFunnelV3((s) => s.txt);
  const files = useFunnelV3((s) => s.files);
  const skipped = useFunnelV3((s) => s.skipped);
  const dismissed = useFunnelV3((s) => s.dismissed);
  const now = opts.now;
  return useMemo(
    () => documentsSummary({ ans, borrowers, txt, files, skipped, dismissed }, { now }),
    [ans, borrowers, txt, files, skipped, dismissed, now]
  );
}
