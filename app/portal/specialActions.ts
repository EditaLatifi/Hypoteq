"use server";

import { revalidatePath } from "next/cache";
import { getDict } from "@/lib/portal/i18n/server";
import { requestIp, requestOrigin, requireUser } from "@/lib/portal/session";
import { submitSpecialRequest } from "@/lib/portal/specialServer";

export type SpecialSubmitState =
  | { ok: true; requestId: string; caseId: string | null; caseNr: string | null }
  | { ok: false; error: string; step?: number };

/**
 * «Anfrage einreichen» of the Spezialfinanzierung wizard. Everything is validated again
 * here (lib/portal/special.ts); refused while an admin only views the portal as a partner.
 */
export async function submitSpecialAction(input: { requestId: string | null; answers: unknown; ack: boolean; itemIds: string[] }): Promise<SpecialSubmitState> {
  const { t } = await getDict();
  // Outside the try: an expired session must still redirect to the login.
  const user = await requireUser();
  if (user.viewingAs) return { ok: false, error: t.special.readOnly };
  if (!user.contactId) return { ok: false, error: t.special.noContact };
  try {
    const res = await submitSpecialRequest({ ...user, contactId: user.contactId }, input, { origin: requestOrigin(), ip: requestIp() });
    if (!res.ok) return { ok: false, error: t.special.err[res.error], step: res.step };
    revalidatePath("/portal/spezialfinanzierung");
    revalidatePath("/portal/cases");
    return res;
  } catch (err) {
    console.error("[portal] special financing submit failed", err);
    return { ok: false, error: t.special.err.failed };
  }
}
