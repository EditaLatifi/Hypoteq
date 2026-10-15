"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { CHANGE_FIELD_DE, CHANGE_STATUS_DE, changeRequestNr, isChangeField, isChangeStatus } from "@/lib/portal/changeRequests";
import { PARTNER_DOC_KIND_DE, PARTNER_DOC_STATUS_DE, isPartnerDocKind, isPartnerDocStatus } from "@/lib/portal/partnerDocuments";
import { requestIp, requireAdmin } from "@/lib/portal/session";

/**
 * HYPOTEQ sets the status of a change request once it has applied (or declined) it in
 * Salesforce, and the status of a company document once it has checked it. The partner
 * sees both in the profile.
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

export async function setPartnerDocumentStatusAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") || "");
  const status = fd.get("status");
  if (!isPartnerDocStatus(status)) return;
  const doc = await prisma.portalPartnerDocument.findUnique({ where: { id } });
  if (!doc || doc.status === status) return;

  await prisma.portalPartnerDocument.update({ where: { id }, data: { status } });
  const label = isPartnerDocKind(doc.name) ? PARTNER_DOC_KIND_DE[doc.name] : doc.name;
  await audit({
    action: "partner_document_status",
    actorId: admin.id,
    actorEmail: admin.email,
    target: `${label} · ${doc.fileName} · ${doc.accountId || "–"} → ${PARTNER_DOC_STATUS_DE[status]}`,
    ip: requestIp(),
  });
  revalidatePath("/portal/admin/aenderungen");
}
