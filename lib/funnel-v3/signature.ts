/**
 * The HYPOTEQ Auskunftsermächtigung (Handover 6; requirement P0, `vollmacht`). Pure.
 *
 * Mandatory for every case, shown in its own block in the closing: download the template →
 * sign by hand → upload (DocuSign later replaces the upload: `method`). It is fulfilled by a
 * file on P0 — uploaded with the block's own button (placed by hand, whatever its name) or
 * recognised in the uploaded folder. The document AI checks the form, the signature
 * («Unterschrift») and the name («Vollmachtgeber» against the Kreditnehmer); when something is
 * missing the state is «Unterschrift fehlt», not «erhalten».
 *
 * «Später nachreichen» lets the case be closed with «Unterschrift ausstehend»; «Finanzierungs-
 * anfrage abschliessen» stays locked until a signed copy is there or that was chosen.
 */

import type { V3Analysis } from "./files";
import { fieldText, yesNoOf } from "./facts";
import { personScore } from "./placeFile";
import { SIGNATURE_REQUIREMENT_ID, baseId, type PersonRef } from "./requirements";
import type { SignatureState } from "./types";

/**
 *  - received   a signed copy is there (Handover 6 «Unterzeichnete Auskunftsermächtigung erhalten»)
 *  - unsigned   a copy is there, but the AI found no signature or another name («Unterschrift fehlt»)
 *  - analysing  a copy is being uploaded or read
 *  - later      none yet, «Später nachreichen» chosen («Unterschrift ausstehend»)
 *  - missing    none yet («Noch nicht hochgeladen»)
 */
export type SignatureStatus = "received" | "unsigned" | "analysing" | "later" | "missing";

export type SignatureProblem = "signature" | "name";

/** One file as the check needs it (from the store's FileEntry or the server's CompletedFile). */
export interface SignatureFile {
  fileId: string;
  /** The requirement instance it is placed on. */
  instanceId: string | null;
  /** Still uploading or being read. */
  pending?: boolean;
  analysis?: V3Analysis | null;
  /** Placed with the block's own button. */
  assignedByUser?: boolean;
}

export interface SignatureView {
  status: SignatureStatus;
  /** Files on P0. */
  fileIds: string[];
  /** Why a copy is «unsigned». */
  problems: SignatureProblem[];
  /** «Finanzierungsanfrage abschliessen» may be pressed (Handover 6). */
  canFinish: boolean;
}

/** What the AI says about one copy; [] = fine. An unreadable copy placed by hand is accepted. */
export function signatureProblems(a: V3Analysis | null | undefined, signer?: PersonRef): SignatureProblem[] {
  if (!a || a.status !== "done") return [];
  const out: SignatureProblem[] = [];
  if (yesNoOf(fieldText(a, "Unterschrift")) === false) out.push("signature");
  const printed = fieldText(a, "Vollmachtgeber") || a.personName || "";
  if (signer && printed && (signer.last || signer.company) && personScore(printed, signer) <= 0) out.push("name");
  return out;
}

/**
 * The block's state. `signer` is who must sign: the Kreditnehmer 1 (with Kreditnehmer 2 both —
 * the first one is checked), at a juristische Person the company (its signatory signs for it).
 */
export function signatureView(files: SignatureFile[], sig: SignatureState | null, signer?: PersonRef): SignatureView {
  const mine = files.filter((f) => f.instanceId && baseId(f.instanceId) === SIGNATURE_REQUIREMENT_ID);
  const fileIds = mine.map((f) => f.fileId);
  const later = sig?.choice === "later";
  const read = mine.filter((f) => !f.pending);
  const checked = read.map((f) => ({ f, problems: signatureProblems(f.analysis, signer) }));
  const good = checked.find((c) => !c.problems.length && (c.f.analysis?.status === "done" || c.f.assignedByUser));
  let status: SignatureStatus;
  let problems: SignatureProblem[] = [];
  if (good) status = "received";
  else if (mine.some((f) => f.pending)) status = "analysing";
  else if (checked.length) {
    status = "unsigned";
    problems = Array.from(new Set(checked.flatMap((c) => c.problems)));
  } else status = later ? "later" : "missing";
  return { status, fileIds, problems, canFinish: status === "received" || later };
}

/**
 * `Dokumenten_Check_State__c.signature` (Handover 8: «signature: uploaded | pending,
 * Zeitstempel, Methode»). `unsigned` / `missing` say what is not there yet.
 */
export interface SignatureJson {
  status: "uploaded" | "pending" | "unsigned" | "missing";
  /** ISO time of the upload or of «Später nachreichen». */
  at: string | null;
  method: "upload";
}

export function signatureJson(view: Pick<SignatureView, "status">, sig: SignatureState | null): SignatureJson {
  // «Später nachreichen» closes the case as «Unterschrift ausstehend», also over an unsigned copy.
  const status =
    view.status === "received" ? "uploaded" : sig?.choice === "later" ? "pending" : view.status === "unsigned" ? "unsigned" : "missing";
  return { status, at: sig?.at ?? null, method: sig?.method ?? "upload" };
}
