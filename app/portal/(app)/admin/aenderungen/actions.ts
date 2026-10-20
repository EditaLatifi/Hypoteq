"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { CHANGE_FIELD_DE, CHANGE_STATUS_DE, changeRequestNr, isChangeField, isChangeStatus } from "@/lib/portal/changeRequests";
import { sendChangeDecisionMail } from "@/lib/portal/mail";
import { requestIp, requestOrigin, requireAdmin } from "@/lib/portal/session";

/**
 * HYPOTEQ sets the status of a change request once it has applied (or declined) it in
 * Salesforce. The partner sees it in the profile and, for «Übernommen» or «Abgelehnt», gets
 * mail M14 (HYPOTEQ Mail-Texte 20.10.2026) in their portal language — whatever
 * PORTAL_STATUS_MAILS and Send_Notification__c say, which only concern Case mails.
 */

export async function setChangeRequestStatusAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") || "");
  const status = fd.get("status");
  if (!isChangeStatus(status)) return;
  const row = await prisma.portalChangeRequest.findUnique({ where: { id } });
  if (!row || row.status === status) return;

  const open = status === "in_pruefung";
  await prisma.portalChangeRequest.update({
    where: { id },
    data: { status, decidedAt: open ? null : new Date(), decidedBy: open ? null : admin.email },
  });
  const nr = changeRequestNr(row.id);
  const label = isChangeField(row.field) ? CHANGE_FIELD_DE[row.field] : row.field;
  await audit({
    action: "change_request_decided",
    actorId: admin.id,
    actorEmail: admin.email,
    target: `${nr} · ${label} → ${CHANGE_STATUS_DE[status]}`,
    ip: requestIp(),
  });

  // The decision is saved either way: a mail that cannot go out is logged, not shown as a failure.
  if (!open) {
    try {
      const partner = await prisma.portalUser.findUnique({ where: { id: row.userId }, select: { email: true, name: true, locale: true, status: true } });
      // Like the Case mails (cron: active partners only), nothing to a deactivated access.
      if (partner && partner.status !== "disabled") {
        await sendChangeDecisionMail({
          to: partner.email,
          name: partner.name,
          origin: requestOrigin(),
          locale: partner.locale,
          nr,
          field: row.field,
          approved: status === "uebernommen",
        });
      }
    } catch (err) {
      console.error(`[portal] change request ${nr}: decision mail failed`, err);
    }
  }
  revalidatePath("/portal/admin/aenderungen");
}
