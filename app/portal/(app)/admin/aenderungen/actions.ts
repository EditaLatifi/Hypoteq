"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { CHANGE_FIELD_DE, CHANGE_STATUS_DE, changeRequestNr, isChangeField, isChangeStatus } from "@/lib/portal/changeRequests";
import { requestIp, requireAdmin } from "@/lib/portal/session";

/**
 * HYPOTEQ sets the status of a change request once it has applied (or declined) it in
 * Salesforce. The partner sees it in the profile.
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
  const label = isChangeField(row.field) ? CHANGE_FIELD_DE[row.field] : row.field;
  await audit({
    action: "change_request_decided",
    actorId: admin.id,
    actorEmail: admin.email,
    target: `${changeRequestNr(row.id)} · ${label} → ${CHANGE_STATUS_DE[status]}`,
    ip: requestIp(),
  });
  revalidatePath("/portal/admin/aenderungen");
}
