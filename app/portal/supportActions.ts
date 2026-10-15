"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { getDict } from "@/lib/portal/i18n/server";
import { getPartnerCase } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import { requestIp, requestOrigin, requireAdmin, requireUser } from "@/lib/portal/session";
import { isSupportStatus, ticketRef } from "@/lib/portal/support";
import { createSupportTicket } from "@/lib/portal/supportServer";

export type SupportSendState = { ok: true; message: string } | { ok: false; error: string };

/** «Meldung senden» (Support & Feedback). Refused while an admin only views as a partner. */
export async function sendSupportAction(input: {
  type: string;
  caseId: string | null;
  subject: string;
  body: string;
  sendTech: boolean;
  tech: unknown;
}): Promise<SupportSendState> {
  const { t, locale } = await getDict();
  const user = await requireUser();
  if (user.viewingAs) return { ok: false, error: t.support.readOnly };
  try {
    const res = await createSupportTicket(user, input, {
      origin: requestOrigin(),
      ip: requestIp(),
      verifyCase: async (caseId) => {
        try {
          const scope = await scopeFor(user);
          const c = scope ? await getPartnerCase(scope, caseId, locale) : null;
          return c ? { nr: c.nr, kunde: c.kunde } : null;
        } catch (err) {
          console.error("[portal] support: Case check failed", err);
          return "unavailable";
        }
      },
    });
    if (!res.ok) return { ok: false, error: t.support.err[res.error] };
    revalidatePath("/portal/support");
    return { ok: true, message: t.support.sent(res.ref) };
  } catch (err) {
    console.error("[portal] support ticket failed", err);
    return { ok: false, error: t.support.err.failed };
  }
}

/** Admin: set a ticket's status (Eingegangen, In Prüfung, Behoben, Beantwortet). */
export async function setSupportStatusAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("ticketId") || "");
  const status = String(fd.get("status") || "");
  if (!id || !isSupportStatus(status)) return;
  const ticket = await prisma.portalSupportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!ticket || ticket.status === status) return;
  await prisma.portalSupportTicket.update({ where: { id }, data: { status } });
  await audit({ action: "support_status_changed", actorId: admin.id, actorEmail: admin.email, target: `${ticketRef(id)}: ${ticket.status} → ${status}`, ip: requestIp() });
  revalidatePath("/portal/admin/support");
  revalidatePath("/portal/support");
}
