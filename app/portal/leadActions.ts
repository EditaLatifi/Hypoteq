"use server";

import { revalidatePath } from "next/cache";
import { getDict } from "@/lib/portal/i18n/server";
import type { LeadInput } from "@/lib/portal/lead";
import { createLead, resendLead } from "@/lib/portal/leadServer";
import { requestIp, requestOrigin, requireUser } from "@/lib/portal/session";

export type LeadActionState = { ok: true; message: string } | { ok: false; error: string };

const PAGE = "/portal/kunde-einladen";

/**
 * «Einladung senden» (Partner Fast Lead, DECISIONS P39). Everything is checked again on the
 * server (lib/portal/lead.ts validateLead); refused while an admin only views as a partner and
 * for a login without a Salesforce Contact — the Case would have no partner to go to.
 */
export async function inviteCustomerAction(input: LeadInput): Promise<LeadActionState> {
  const { t } = await getDict();
  // Outside the try: an expired session must still redirect to the login.
  const user = await requireUser();
  if (user.viewingAs) return { ok: false, error: t.lead.readOnly };
  if (!user.sfContactId) return { ok: false, error: t.lead.noContact };
  try {
    const res = await createLead(user, input, { origin: requestOrigin(), ip: requestIp() });
    revalidatePath(PAGE);
    if (!res.ok) return { ok: false, error: t.lead.err[res.error] };
    return { ok: true, message: t.lead.sent(res.name, res.email) };
  } catch (err) {
    console.error("[portal] lead invitation failed", err);
    return { ok: false, error: t.lead.err.failed };
  }
}

/** «Erneut senden» in the list of invitations. */
export async function resendLeadAction(leadId: string): Promise<LeadActionState> {
  const { t } = await getDict();
  const user = await requireUser();
  if (user.viewingAs) return { ok: false, error: t.lead.readOnly };
  try {
    const res = await resendLead(user, typeof leadId === "string" ? leadId : "", { origin: requestOrigin(), ip: requestIp() });
    revalidatePath(PAGE);
    if (!res.ok) return { ok: false, error: t.lead.err[res.error] };
    return { ok: true, message: t.lead.resent(res.email) };
  } catch (err) {
    console.error("[portal] lead resend failed", err);
    return { ok: false, error: t.lead.err.failed };
  }
}
