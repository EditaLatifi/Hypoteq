"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import {
  INVITE_TTL_HOURS,
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_MAX_FAILURES,
  MAGIC_TTL_MINUTES,
  RESET_TTL_MINUTES,
  adminEmails,
  isPlausibleEmail,
  normalizeEmail,
} from "@/lib/portal/config";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/portal/crypto";
import { isLocale } from "@/lib/portal/i18n/dict";
import { LOCALE_COOKIE, getDict } from "@/lib/portal/i18n/server";
import { sendInviteMail, sendMagicLinkMail, sendResetMail, sendTeamMail } from "@/lib/portal/mail";
import { NOTIFY_KINDS, notifyPrefs } from "@/lib/portal/notifications";
import { addCaseComment, getContact, getPartnerCase, isSalesforceId } from "@/lib/portal/salesforce";
import {
  createSession,
  destroySession,
  readSession,
  requestIp,
  requestOrigin,
  requireActingPartner,
  requireAdmin,
  requireUser,
  revokeAllSessions,
} from "@/lib/portal/session";
import { consumeToken, issueToken, peekToken } from "@/lib/portal/tokens";

export type FormState = { error?: string; sent?: string; ok?: string } | undefined;

// Compared against when the e-mail is unknown, so a wrong e-mail costs the same time as a
// wrong password and response times do not reveal which addresses have an account.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

/** Where a fresh session goes: step 2 of the first login for partners who have not confirmed yet. */
async function landingFor(userId: string): Promise<string> {
  const u = await prisma.portalUser.findUnique({ where: { id: userId }, select: { role: true, sfContactId: true, profileConfirmedAt: true } });
  return u && u.role !== "admin" && u.sfContactId && !u.profileConfirmedAt ? "/portal/angaben" : "/portal/dashboard";
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  const s = await readSession();
  if (s.state === "ok" && !s.user.viewingAs) {
    await prisma.portalUser.update({ where: { id: s.user.id }, data: { locale } });
  }
  revalidatePath("/portal", "layout");
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDict();
  const email = normalizeEmail(field(fd, "email"));
  const password = field(fd, "password");
  if (!isPlausibleEmail(email) || !password) return { error: t.errors.enterEmailPassword };

  const ip = requestIp();
  const since = new Date(Date.now() - LOGIN_FAILURE_WINDOW_MINUTES * 60_000);
  const failures = await prisma.portalAuditLog.count({
    where: { actorEmail: email, action: "login_failed", at: { gte: since } },
  });
  if (failures >= LOGIN_MAX_FAILURES) {
    await audit({ action: "login_blocked", actorEmail: email, ip });
    return { error: t.errors.tooMany(LOGIN_FAILURE_WINDOW_MINUTES) };
  }

  const user = await prisma.portalUser.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok || user.status !== "active") {
    await audit({ action: "login_failed", actorEmail: email, actorId: user?.id, ip });
    if (user && ok && user.status === "disabled") return { error: t.errors.disabled };
    return { error: t.errors.wrongCredentials };
  }

  await createSession(user.id);
  await audit({ action: "login", actorId: user.id, actorEmail: user.email, ip });
  redirect(await landingFor(user.id));
}

export async function requestMagicLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t, locale } = await getDict();
  const email = normalizeEmail(field(fd, "email"));
  if (!isPlausibleEmail(email)) return { error: t.errors.enterEmail };

  let user = await prisma.portalUser.findUnique({ where: { email } });

  // HYPOTEQ administrators listed in PORTAL_ADMIN_EMAILS need no invite: the first magic
  // link creates their account. This is how the very first admin gets in.
  if (!user && adminEmails().includes(email)) {
    user = await prisma.portalUser.create({
      data: { email, role: "admin", status: "active", activatedAt: new Date(), company: "HYPOTEQ AG", locale },
    });
  }

  try {
    if (user?.status === "active") {
      const token = await issueToken(user.id, "magic", MAGIC_TTL_MINUTES);
      await sendMagicLinkMail({ to: user.email, name: user.name, origin: requestOrigin(), token, locale: user.locale || locale });
      await audit({ action: "magic_link_requested", actorId: user.id, actorEmail: user.email, ip: requestIp() });
    } else if (user?.status === "invited") {
      // Not activated yet: the invite is what they need, not a login link.
      const token = await issueToken(user.id, "invite", INVITE_TTL_HOURS * 60);
      await sendInviteMail({ to: user.email, name: user.name, company: user.company, origin: requestOrigin(), token, locale: user.locale || locale });
      await audit({ action: "invite_resent", actorId: user.id, actorEmail: user.email, target: "via Login", ip: requestIp() });
    }
  } catch (err) {
    console.error("[portal] magic link mail failed", err);
    return { error: t.errors.mailFailed };
  }
  return { sent: t.errors.sent(email) };
}

export async function requestResetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t, locale } = await getDict();
  const email = normalizeEmail(field(fd, "email"));
  if (!isPlausibleEmail(email)) return { error: t.errors.enterEmail };

  const user = await prisma.portalUser.findUnique({ where: { email } });
  try {
    if (user?.status === "active") {
      const token = await issueToken(user.id, "reset", RESET_TTL_MINUTES);
      await sendResetMail({ to: user.email, name: user.name, origin: requestOrigin(), token, locale: user.locale || locale });
      await audit({ action: "password_reset_requested", actorId: user.id, actorEmail: user.email, ip: requestIp() });
    }
  } catch (err) {
    console.error("[portal] reset mail failed", err);
    return { error: t.errors.mailFailed };
  }
  return { sent: t.errors.sent(email) };
}

export async function activateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t, locale } = await getDict();
  const token = field(fd, "token");
  const mode = field(fd, "mode") === "magic" ? "magic" : "password";
  const pw1 = field(fd, "password");
  const pw2 = field(fd, "password2");

  // Validate before using the token, so a typo in the password does not burn the link.
  const pending = await peekToken(token, "invite");
  if (!pending) return { error: t.errors.activationInvalid };
  if (fd.get("privacy") !== "on" || fd.get("terms") !== "on") return { error: t.errors.acceptTerms };
  if (mode === "password") {
    const problem = passwordProblem(pw1);
    if (problem) return { error: t.errors[problem] };
    if (pw1 !== pw2) return { error: t.errors.pwMismatch };
  }

  const row = await consumeToken(token, "invite");
  if (!row) return { error: t.errors.linkUsed };
  if (row.user.status === "disabled") return { error: t.errors.accountDisabled };

  const now = new Date();
  await prisma.portalUser.update({
    where: { id: row.userId },
    data: {
      status: "active",
      activatedAt: row.user.activatedAt ?? now,
      termsAcceptedAt: now,
      locale: row.user.locale || locale,
      // Choosing magic links clears any earlier password: the partner said they don't want one.
      passwordHash: mode === "password" ? await hashPassword(pw1) : null,
    },
  });
  await createSession(row.userId);
  await audit({ action: "access_activated", actorId: row.userId, actorEmail: row.user.email, target: mode === "password" ? "Passwort" : "Magic Link", ip: requestIp() });
  redirect(await landingFor(row.userId));
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDict();
  const token = field(fd, "token");
  const pw1 = field(fd, "password");
  const pw2 = field(fd, "password2");

  const pending = await peekToken(token, "reset");
  if (!pending) return { error: t.errors.resetInvalid };
  const problem = passwordProblem(pw1);
  if (problem) return { error: t.errors[problem] };
  if (pw1 !== pw2) return { error: t.errors.pwMismatch };

  const row = await consumeToken(token, "reset");
  if (!row || row.user.status !== "active") return { error: t.errors.linkUsed };

  await prisma.portalUser.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(pw1) } });
  // A new password ends every other session — the usual reason to reset is suspicion.
  await revokeAllSessions(row.userId);
  await createSession(row.userId);
  await audit({ action: "password_reset", actorId: row.userId, actorEmail: row.user.email, ip: requestIp() });
  redirect(await landingFor(row.userId));
}

export async function magicLoginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDict();
  const row = await consumeToken(field(fd, "token"), "magic");
  if (!row || row.user.status !== "active") return { error: t.errors.magicInvalid };
  await createSession(row.userId);
  await audit({ action: "magic_link_login", actorId: row.userId, actorEmail: row.user.email, ip: requestIp() });
  redirect(await landingFor(row.userId));
}

export async function logoutAction(): Promise<void> {
  const s = await readSession();
  if (s.state === "ok") await audit({ action: "logout", actorId: s.user.id, actorEmail: s.user.email, ip: requestIp() });
  await destroySession();
  redirect("/portal/login");
}

// ---------------------------------------------------------------------------
// First login, step 2: confirm the data HYPOTEQ holds
// ---------------------------------------------------------------------------

export async function confirmProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDict();
  const user = await requireUser();
  const name = field(fd, "name").trim().slice(0, 120);
  const company = field(fd, "company").trim().slice(0, 160);
  const phone = field(fd, "phone").trim().slice(0, 40);
  if (!name) return { error: t.errors.nameRequired };

  const changes: string[] = [];
  if (name !== (user.name || "")) changes.push(`Name: «${user.name || "–"}» → «${name}»`);
  if (company !== (user.company || "")) changes.push(`Firma: «${user.company || "–"}» → «${company || "–"}»`);
  if (phone !== (user.phone || "")) changes.push(`Telefon: «${user.phone || "–"}» → «${phone || "–"}»`);

  await prisma.portalUser.update({
    where: { id: user.id },
    data: { name, company: company || null, phone: phone || null, profileConfirmedAt: new Date() },
  });
  await audit({ action: "profile_confirmed", actorId: user.id, actorEmail: user.email, target: changes.length ? `${changes.length} Korrektur(en)` : "unverändert", ip: requestIp() });

  // Salesforce stays the master: corrections go to HYPOTEQ to apply there, not into the org.
  if (changes.length) {
    try {
      await sendTeamMail({
        to: null,
        subject: `Partnerportal: Korrektur der Partnerdaten – ${name}`,
        lines: [
          `${name} (${user.email}) hat beim ersten Login folgende Angaben korrigiert. Bitte in Salesforce übernehmen${user.sfContactId ? ` (Kontakt ${user.sfContactId})` : ""}:`,
          ...changes,
        ],
        origin: requestOrigin(),
      });
    } catch (err) {
      console.error("[portal] profile correction mail failed", err);
    }
  }
  redirect("/portal/dashboard");
}

// ---------------------------------------------------------------------------
// Partner actions inside the portal
// ---------------------------------------------------------------------------

export async function sendMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDict();
  let user;
  try {
    user = await requireActingPartner();
  } catch {
    return { error: t.errors.readOnly };
  }
  const caseId = field(fd, "caseId");
  const body = field(fd, "body").trim().slice(0, 4000);
  if (!body) return { error: t.errors.messageEmpty };

  const c = await getPartnerCase(user.contactId, caseId);
  if (!c) return { error: t.errors.generic };

  await prisma.portalMessage.create({ data: { userId: user.id, caseId: c.id, body } });
  await audit({ action: "message_sent", actorId: user.id, actorEmail: user.email, target: c.nr, ip: requestIp() });

  const who = `${user.name || user.email}${user.company ? ` (${user.company})` : ""}`;
  let delivered = false;
  try {
    await addCaseComment(c.id, `[Partnerportal] ${who}:\n\n${body}`);
    delivered = true;
  } catch (err) {
    console.error("[portal] CaseComment failed (mail still goes out)", err);
  }
  try {
    await sendTeamMail({
      to: c.ownerEmail,
      subject: `Partnerportal: Nachricht zu ${c.nr} (${c.kunde})`,
      lines: [`${who} schreibt zu Case ${c.nr} · ${c.kunde}:`, body, `Antwort bitte direkt an ${user.email}.`],
      origin: requestOrigin(),
    });
    delivered = true;
  } catch (err) {
    console.error("[portal] message mail failed", err);
  }
  if (!delivered) return { error: t.errors.messageFailed };
  revalidatePath(`/portal/cases/${c.id}`);
  return { ok: t.caseDetail.messageSent };
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  if (user.viewingAs) return;
  await prisma.portalNotification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/portal", "layout");
}

export async function setNotifyPrefAction(kind: string, on: boolean): Promise<void> {
  const user = await requireUser();
  if (user.viewingAs || !(NOTIFY_KINDS as string[]).includes(kind)) return;
  const prefs = { ...notifyPrefs(user.notifyPrefs), [kind]: on };
  await prisma.portalUser.update({ where: { id: user.id }, data: { notifyPrefs: prefs } });
  revalidatePath("/portal/profil");
}

// ---------------------------------------------------------------------------
// Admin: view the portal as a partner (read-only)
// ---------------------------------------------------------------------------

export async function startViewAsAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const contactId = field(fd, "contactId");
  if (!isSalesforceId(contactId)) return;
  const contact = await getContact(contactId);
  if (!contact) return;
  const name = [contact.Name, contact.Account?.Name].filter(Boolean).join(" · ") || contactId;
  await prisma.portalSession.update({ where: { id: admin.sessionId }, data: { viewAsContactId: contactId, viewAsName: name.slice(0, 200) } });
  await audit({ action: "view_as_started", actorId: admin.id, actorEmail: admin.email, target: `${name} · ${contactId}`, ip: requestIp() });
  redirect("/portal/dashboard");
}

export async function endViewAsAction(): Promise<void> {
  const admin = await requireAdmin();
  await prisma.portalSession.update({ where: { id: admin.sessionId }, data: { viewAsContactId: null, viewAsName: null } });
  await audit({ action: "view_as_ended", actorId: admin.id, actorEmail: admin.email, ip: requestIp() });
  redirect("/portal/admin/partner");
}
