"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/portal/actions";
import { audit } from "@/lib/portal/audit";
import {
  CHANGE_FIELD_DE,
  MAX_CHANGE_REQUESTS_PER_DAY,
  buildChangeRequest,
  changeRequestLines,
  changeRequestNr,
  changeTaskPayload,
  createChangeTask,
  defaultConnection,
  loadPartnerData,
  mergePartnerData,
} from "@/lib/portal/changeRequests";
import { RESET_TTL_MINUTES } from "@/lib/portal/config";
import { getDict } from "@/lib/portal/i18n/server";
import { isImageKind, removeImage, setLogoOnLight } from "@/lib/portal/images";
import { sendResetMail, sendTeamMail } from "@/lib/portal/mail";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { requestIp, requestOrigin, requireUser } from "@/lib/portal/session";
import { issueToken } from "@/lib/portal/tokens";

/**
 * Profile actions (handoff 4 «Profil»). Uploading a photo or logo goes through
 * /api/portal/image/[kind] (server actions take at most 1 MB); everything else is here.
 * Nothing here works while an admin only views the portal as a partner.
 */

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

// ---------------------------------------------------------------------------
// Photo and logo
// ---------------------------------------------------------------------------

export async function removeImageAction(kind: string): Promise<{ error?: string; ok?: string }> {
  const { t } = await getDict();
  const user = await requireUser();
  if (user.viewingAs) return { error: t.errors.readOnly };
  if (!isImageKind(kind)) return { error: t.errors.generic };
  const ownerId = kind === "photo" ? user.id : isSalesforceId(user.sfAccountId) ? user.sfAccountId : null;
  if (!ownerId) return { error: t.profileExtra.logo.noAccount };

  if (await removeImage(kind, ownerId)) {
    await audit({
      action: kind === "photo" ? "photo_removed" : "logo_removed",
      actorId: user.id,
      actorEmail: user.email,
      target: kind === "logo" ? `${user.company || "Partnerfirma"} · ${ownerId}` : null,
      ip: requestIp(),
    });
  }
  revalidatePath("/portal", "layout");
  return { ok: kind === "photo" ? t.profileExtra.photo.removed : t.profileExtra.logo.removed };
}

/** «Auf hellem Hintergrund anzeigen»: applies to the whole partner company, like the logo. */
export async function setLogoOnLightAction(on: boolean): Promise<{ error?: string }> {
  const { t } = await getDict();
  const user = await requireUser();
  if (user.viewingAs) return { error: t.errors.readOnly };
  if (!isSalesforceId(user.sfAccountId)) return { error: t.profileExtra.logo.noAccount };
  if (await setLogoOnLight(user.sfAccountId, on === true)) {
    await audit({
      action: "logo_display_changed",
      actorId: user.id,
      actorEmail: user.email,
      target: `${user.company || "Partnerfirma"} · ${on ? "heller Hintergrund" : "ohne Hintergrund"}`,
      ip: requestIp(),
    });
  }
  revalidatePath("/portal", "layout");
  return {};
}

// ---------------------------------------------------------------------------
// «Änderung beantragen»
// ---------------------------------------------------------------------------

/**
 * Store the request, put a Task on the partner's Contact in Salesforce and tell the team.
 * The Task may fail (an org rule, Salesforce down): the request is kept anyway, without
 * sfTaskId, and the mail asks HYPOTEQ to record it by hand.
 */
export async function submitChangeRequestAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDict();
  const tx = t.profileExtra.change.err;
  const user = await requireUser();
  if (user.viewingAs) return { error: t.errors.readOnly };
  const contactId = user.sfContactId;
  if (!isSalesforceId(contactId)) return { error: tx.noContact };

  const since = new Date(Date.now() - 24 * 3600_000);
  const recent = await prisma.portalChangeRequest.count({ where: { userId: user.id, createdAt: { gte: since } } });
  if (recent >= MAX_CHANGE_REQUESTS_PER_DAY) return { error: tx.tooMany };

  // The current value is read here, not taken from the form.
  let fromSf = null;
  try {
    fromSf = await loadPartnerData(contactId);
  } catch (err) {
    console.error("[portal] partner data for change request failed (continuing)", err);
  }
  const current = mergePartnerData(fromSf, user);
  const built = buildChangeRequest({ field: fd.get("field"), newValue: field(fd, "newValue"), note: field(fd, "note") }, current);
  if (!built.ok) return { error: tx[built.problem] };
  const request = built.value;

  const row = await prisma.portalChangeRequest.create({
    data: { userId: user.id, field: request.field, oldValue: request.oldValue, newValue: request.newValue, note: request.note },
  });
  const nr = changeRequestNr(row.id);
  const origin = requestOrigin();
  const ctx = {
    nr,
    request,
    partner: { name: current.name, email: user.email, company: current.company },
    adminUrl: `${origin}/portal/admin/aenderungen`,
  };

  const task = await createChangeTask(defaultConnection(), changeTaskPayload({ ...ctx, contactId, accountId: user.sfAccountId }));
  if (task.id) {
    await prisma.portalChangeRequest.update({ where: { id: row.id }, data: { sfTaskId: task.id } }).catch((err) => {
      console.error("[portal] could not store the Task id", err);
    });
  } else {
    console.error("[portal] change request Task failed", nr, task.error);
  }

  // No values in the audit log: an IBAN is not something to keep in a log.
  await audit({ action: "change_requested", actorId: user.id, actorEmail: user.email, target: `${nr} · ${CHANGE_FIELD_DE[request.field]}`, ip: requestIp() });
  try {
    await sendTeamMail({
      to: null,
      subject: `Partnerportal: Änderungsantrag ${nr} – ${CHANGE_FIELD_DE[request.field]} (${current.name || user.email})`,
      lines: [
        ...changeRequestLines(ctx),
        task.id
          ? `Salesforce-Task ${task.id} ist auf dem Kontakt ${contactId} angelegt.`
          : `Der Salesforce-Task konnte nicht angelegt werden (${task.error || "unbekannter Fehler"}). Bitte manuell auf dem Kontakt ${contactId} erfassen.`,
      ],
      origin,
      link: ctx.adminUrl,
    });
  } catch (err) {
    console.error("[portal] change request mail failed", err);
  }

  revalidatePath("/portal/profil");
  return { ok: t.profileExtra.change.sent(nr) };
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

/**
 * «Passwort ändern»: the existing reset flow, without typing the e-mail address — the link
 * goes to the login address, valid 30 minutes, and setting the new password there ends
 * every other session (resetPasswordAction).
 */
export async function sendPasswordLinkAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const { t, locale } = await getDict();
  const user = await requireUser();
  if (user.viewingAs) return { error: t.profileExtra.security.viewAs };
  try {
    const token = await issueToken(user.id, "reset", RESET_TTL_MINUTES);
    await sendResetMail({ to: user.email, name: user.name, origin: requestOrigin(), token, locale: user.locale || locale });
  } catch (err) {
    console.error("[portal] password link from the profile failed", err);
    return { error: t.errors.mailFailed };
  }
  await audit({ action: "password_reset_requested", actorId: user.id, actorEmail: user.email, target: "aus dem Profil", ip: requestIp() });
  return { ok: t.profileExtra.security.linkSent(user.email) };
}
