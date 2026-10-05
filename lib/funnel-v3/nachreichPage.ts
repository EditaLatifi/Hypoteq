/**
 * The Nachreich page's documents, derived in one place (like documentsSummary for step 5):
 * placement of the uploaded files on the requirements the inquiry still misses, their states,
 * and the per-file detail the page posts. Pure.
 */

import { isSubmitted, toSubmittedDocument } from "./documentsSummary";
import { toUploadedFiles, type FileEntry, type SubmittedDocument } from "./files";
import { placeAll, withPlacement, type Placement } from "./placeFile";
import type { ReqState, RequirementInstance } from "./requirements";
import { requirementStatus, type StatusResult } from "./requirementStatus";
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
  /** `documents` for POST /api/nachreichen/[token]. */
  submittedDocuments(): SubmittedDocument[];
}

export function nachreichDocuments(raw: FileEntry[], instances: RequirementInstance[], opts: { now?: Date } = {}): NachreichDocuments {
  const placements = placeAll(raw, NO_ANSWERS, { instances, now: opts.now });
  const files = raw.map((f) => withPlacement(f, placements.get(f.id)));
  const status = requirementStatus(instances, toUploadedFiles(files));
  return {
    files,
    placements,
    status,
    busy: files.filter((f) => f.uploadState === "uploading" || (f.uploadState === "uploaded" && (f.analysisState === "pending" || f.analysisState === "analysing"))).length,
    submittedDocuments: () => files.filter(isSubmitted).map(toSubmittedDocument),
  };
}
