// STUB: replaced by the signature branch
/**
 * Server side of the Auskunftsermächtigung (Handover 6): the state at the closing, the signed
 * copy arriving later, the reminders after 2 and 5 days. The signature branch provides the
 * real module; this stub only fixes the contract for /api/inquiry and its tests.
 */

export type SignatureAtSubmit = { state: "uploaded" | "later" | null; fileName?: string | null; driveItemId?: string | null };

export async function recordSignatureAtSubmit(_inquiryId: string, _input: SignatureAtSubmit, _now?: Date): Promise<void> {}

export async function markSignatureReceived(_inquiryId: string, _file: { fileName: string; driveItemId?: string | null }, _now?: Date): Promise<void> {}

export async function sendSignatureReminders(_now?: Date): Promise<{ checked: number; sent: number }> {
  return { checked: 0, sent: 0 };
}
