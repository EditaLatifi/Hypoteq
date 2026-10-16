/**
 * What /api/inquiry hands `recordSignatureAtSubmit` (signatureServer.ts, Handover 6): the
 * Auskunftsermächtigung as the closing judged it — `uploaded` (a signed copy on P0), `later`
 * («Später nachreichen»: Unterschrift ausstehend, reminders after 2 and 5 days) or null — and,
 * for an uploaded copy, its file in the case folder.
 *
 * The state is the one the Salesforce JSON gets (summary.ts closingSignature), so the mail, the
 * Case and the reminders agree. The drive item is looked up by the caller (the closing result
 * names the file, not its SharePoint item); a failed lookup leaves it null.
 */

import { SIGNATURE_REQUIREMENT_ID } from "../requirements";
import type { SignatureAtSubmit } from "../signatureServer";
import { closingFacts } from "./summary";

export async function signatureAtSubmit(data: any, driveItemIdOf: (documentId: string) => Promise<string | null>): Promise<SignatureAtSubmit> {
  const facts = closingFacts(data);
  if (!facts) return { state: null };
  const status = facts.signature.status;
  const state: SignatureAtSubmit["state"] = status === "uploaded" ? "uploaded" : status === "pending" ? "later" : null;
  if (state !== "uploaded") return { state };
  const p0 = facts.computed.status.requirements.find((r) => r.instance.id === SIGNATURE_REQUIREMENT_ID);
  const ids = p0?.fileIds ?? [];
  // The newest copy: the closing lists the files in upload order.
  const file = [...facts.computed.files].reverse().find((f) => ids.includes(f.documentId));
  if (!file) return { state };
  let driveItemId: string | null = null;
  try {
    driveItemId = await driveItemIdOf(file.documentId);
  } catch {
    driveItemId = null;
  }
  return { state, fileName: file.storedName || file.originalName, driveItemId };
}
