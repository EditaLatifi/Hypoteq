/**
 * The Nachreich page's documents, derived in one place (like documentsSummary for step 5):
 * placement of the uploaded files on the requirements the inquiry still misses, their states,
 * and the per-file detail the page posts. Pure.
 */

import { isSubmitted, toSubmittedDocument } from "./documentsSummary";
import { toUploadedFiles, type FileEntry, type SubmittedDocument } from "./files";
import { placeAll, withPlacement, type Placement } from "./placeFile";
import { isSignatureRequirement, type ReqState, type RequirementInstance } from "./requirements";
import { requirementStatus, type StatusResult } from "./requirementStatus";
import { signatureView, type SignatureView } from "./signature";
import { DEFAULT_ANSWERS, EMPTY_TEXTS } from "./types";
import { instanceFromMissing, type MissingRequirement } from "./nachreichView";

/** placeAll's answer state; unused when the instances are given, as they are here. */
const NO_ANSWERS: ReqState = { ans: DEFAULT_ANSWERS, borrowers: [], txt: EMPTY_TEXTS };

export function nachreichInstances(missing: MissingRequirement[]): RequirementInstance[] {
  return missing.map(instanceFromMissing).filter((i): i is RequirementInstance => !!i);
}

export interface NachreichDocuments {
  files: FileEntry[];
  placements: Map<string, Placement>;
  status: StatusResult;
  /** Uploading or being read. */
  busy: number;
  /**
   * The Auskunftsermächtigung slot (Handover 6) when the inquiry still waits for it: the copies
   * uploaded on this page, judged like the closing's block. Null when it is not open.
   */
  signature: SignatureView | null;
  /** `documents` for POST /api/nachreichen/[token]. */
  submittedDocuments(): SubmittedDocument[];
}

const pendingOf = (f: FileEntry) => f.uploadState === "uploading" || (f.uploadState === "uploaded" && (f.analysisState === "pending" || f.analysisState === "analysing"));

export function nachreichDocuments(raw: FileEntry[], instances: RequirementInstance[], opts: { now?: Date } = {}): NachreichDocuments {
  const placements = placeAll(raw, NO_ANSWERS, { instances, now: opts.now });
  const files = raw.map((f) => withPlacement(f, placements.get(f.id)));
  const status = requirementStatus(instances, toUploadedFiles(files));
  const p0 = instances.find((i) => isSignatureRequirement(i));
  const signature = p0
    ? signatureView(
        files.map((f) => ({ fileId: f.id, instanceId: f.instanceId ?? null, pending: pendingOf(f), analysis: f.analysis ?? null, assignedByUser: f.assignedByUser, failed: f.uploadState === "failed" })),
        null,
        p0.person
      )
    : null;
  return {
    files,
    placements,
    status,
    signature,
    busy: files.filter(pendingOf).length,
    submittedDocuments: () => files.filter(isSubmitted).map(toSubmittedDocument),
  };
}
