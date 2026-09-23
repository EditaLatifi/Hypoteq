"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { INVITE_TTL_HOURS, isPlausibleEmail, normalizeEmail } from "@/lib/portal/config";
import { localeFromSalesforce } from "@/lib/portal/i18n/dict";
import { getDict } from "@/lib/portal/i18n/server";
import { sendInviteMail } from "@/lib/portal/mail";
import { findContactByEmail, isSalesforceId, setCasePartner } from "@/lib/portal/salesforce";
import { requestIp, requestOrigin, requireAdmin, revokeAllSessions } from "@/lib/portal/session";
import { issueToken } from "@/lib/portal/tokens";

export type AdminFormState = { error?: string; ok?: string } | undefined;

async function sendInvite(userId: string) {
  const user = await prisma.portalUser.findUniqueOrThrow({ where: { id: userId } });
  const token = await issueToken(user.id, "invite", INVITE_TTL_HOURS * 60);
  await sendInviteMail({ to: user.email, name: user.name, company: user.company, origin: requestOrigin(), token, locale: user.locale });
}

/**
 * Invite a partner by e-mail. A partner must exist as a Contact in Salesforce: that
 * Contact is what their Cases point at, so without it the portal would show them nothing.
 */
export async function invitePartnerAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const { t, locale } = await getDict();
  const email = normalizeEmail(String(fd.get("email") || ""));
  const asAdmin = fd.get("role") === "admin";
  if (!isPlausibleEmail(email)) return { error: t.admin.err.email };

  const existing = await prisma.portalUser.findUnique({ where: { email } });
  if (existing?.status === "active") return { error: t.admin.err.alreadyActive(email) };
  if (existing?.status === "disabled") return { error: t.admin.err.isDisabled(email) };

  let data: { name: string | null; company: string | null; phone: string | null; sfContactId: string | null; sfAccountId: string | null; locale: string | null };
  if (asAdmin) {
    data = { name: null, company: "HYPOTEQ AG", phone: null, sfContactId: null, sfAccountId: null, locale };
  } else {
    let contact;
    try {
      contact = await findContactByEmail(email);
    } catch (err) {
      console.error("[portal] Salesforce contact lookup failed", err);
      return { error: t.admin.err.sfDown };
    }
    if (!contact) return { error: t.admin.err.noContact(email) };
    data = {
      name: contact.Name,
      company: contact.Account?.Name ?? null,
      phone: contact.Phone || contact.MobilePhone || null,
      sfContactId: contact.Id,
      sfAccountId: contact.AccountId,
      // Invite in the partner's correspondence language from Salesforce.
      locale: localeFromSalesforce(contact.Korrespondenzsprache__c) || "de",
    };
  }

  const user = await prisma.portalUser.upsert({
    where: { email },
    create: { email, role: asAdmin ? "admin" : "partner", status: "invited", invitedAt: new Date(), invitedBy: admin.email, ...data },
    update: { role: asAdmin ? "admin" : "partner", invitedAt: new Date(), invitedBy: admin.email, ...data },
  });

  try {
    await sendInvite(user.id);
  } catch (err) {
    console.error("[portal] invite mail failed", err);
    return { error: t.admin.err.mailFailed };
  }
  await audit({ action: "partner_invited", actorId: admin.id, actorEmail: admin.email, target: `${data.name || email} · ${email}`, ip: requestIp() });
  revalidatePath("/portal/admin/partner");
  return { ok: t.admin.ok.invited(email) };
}

export async function resendInviteAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("userId") || "");
  const user = await prisma.portalUser.findUnique({ where: { id } });
  if (!user || user.status !== "invited") return;
  await prisma.portalUser.update({ where: { id }, data: { invitedAt: new Date(), invitedBy: admin.email } });
  await sendInvite(id);
  await audit({ action: "invite_resent", actorId: admin.id, actorEmail: admin.email, target: `${user.name || user.email} · ${user.email}`, ip: requestIp() });
  revalidatePath("/portal/admin/partner");
  revalidatePath(`/portal/admin/partner/${id}`);
}

export async function setPartnerStatusAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("userId") || "");
  const to = fd.get("to") === "disabled" ? "disabled" : "active";
  const user = await prisma.portalUser.findUnique({ where: { id } });
  if (!user || user.id === admin.id) return; // an admin cannot lock themselves out

  if (to === "disabled") {
    await prisma.portalUser.update({ where: { id }, data: { status: "disabled" } });
    await revokeAllSessions(id);
    await audit({ action: "partner_disabled", actorId: admin.id, actorEmail: admin.email, target: `${user.name || user.email} · ${user.email}`, ip: requestIp() });
  } else {
    // Someone who never finished activation goes back to "invited" and gets a fresh link.
    const neverActivated = !user.activatedAt;
    await prisma.portalUser.update({ where: { id }, data: { status: neverActivated ? "invited" : "active" } });
    if (neverActivated) await sendInvite(id);
    await audit({ action: "partner_enabled", actorId: admin.id, actorEmail: admin.email, target: `${user.name || user.email} · ${user.email}`, ip: requestIp() });
  }
  revalidatePath("/portal/admin/partner");
  revalidatePath(`/portal/admin/partner/${id}`);
}

/** Assign an open Case to the partner (writes Partner_Consultant__c in Salesforce). */
export async function assignCaseAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(fd.get("userId") || "");
  const caseId = String(fd.get("caseId") || "");
  const p = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!p?.sfContactId || !isSalesforceId(caseId)) return;
  await setCasePartner(caseId, p.sfContactId);
  await audit({ action: "case_assigned", actorId: admin.id, actorEmail: admin.email, target: `${caseId} → ${p.name || p.email}`, ip: requestIp() });
  revalidatePath(`/portal/admin/partner/${userId}`);
}

export async function unassignCaseAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(fd.get("userId") || "");
  const caseId = String(fd.get("caseId") || "");
  const p = await prisma.portalUser.findUnique({ where: { id: userId } });
  if (!p?.sfContactId || !isSalesforceId(caseId)) return;
  await setCasePartner(caseId, null);
  await prisma.portalCaseState.deleteMany({ where: { caseId } });
  await audit({ action: "case_unassigned", actorId: admin.id, actorEmail: admin.email, target: `${caseId} ✕ ${p.name || p.email}`, ip: requestIp() });
  revalidatePath(`/portal/admin/partner/${userId}`);
}
