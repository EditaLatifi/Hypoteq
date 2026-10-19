import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { INVITE_TTL_HOURS, LINK_MAX_PER_WINDOW, LINK_WINDOW_MINUTES, MAGIC_TTL_MINUTES, RESET_TTL_MINUTES, adminEmails } from "@/lib/portal/config";
import { maskEmail, sendInviteMail, sendMagicLinkMail, sendResetMail } from "@/lib/portal/mail";
import { issueToken, tooManyLinks, type TokenPurpose } from "@/lib/portal/tokens";

/**
 * «Magic Link senden» and «Passwort vergessen» (HYPOTEQ 19.10.2026 B6 / E.3, DECISIONS P34).
 *
 * The page always answers «Falls ein Zugang besteht, haben wir eine E-Mail gesendet» — it
 * must not tell which addresses have an account. So every case in which no mail goes out is
 * logged on the server with its reason; before, those were silent and «it does not work»
 * could not be told apart from a mail that never left. Which mail goes out:
 *
 *   no account            nothing (logged); an address in PORTAL_ADMIN_EMAILS gets an admin
 *                         account first, for the reset as for the magic link
 *   disabled              nothing (logged)
 *   invited (not active)  the invitation — it sets the password or the magic-link login;
 *                         before, a reset request for such an account sent nothing at all
 *   active                the magic link or the reset link
 *
 * At most LINK_MAX_PER_WINDOW mails per account and purpose within LINK_WINDOW_MINUTES.
 * A mail that fails throws (the caller shows «konnte nicht gesendet werden»); lib/portal/mail.ts
 * logs why.
 */

export type LinkKind = "magic" | "reset";

export type LinkResult = { mailed: true; purpose: TokenPurpose } | { mailed: false; reason: string };

type AccountRow = Awaited<ReturnType<typeof prisma.portalUser.findUnique>>;

/** The account a link request is for; an address in PORTAL_ADMIN_EMAILS gets one on its first request. */
async function accountForLink(email: string, locale: string): Promise<AccountRow> {
  const user = await prisma.portalUser.findUnique({ where: { email } });
  if (user || !adminEmails().includes(email)) return user;
  // How the very first admin gets in: no invite needed.
  return prisma.portalUser.create({ data: { email, role: "admin", status: "active", activatedAt: new Date(), company: "HYPOTEQ AG", locale } });
}

export async function requestLink(kind: LinkKind, email: string, ctx: { locale: string; origin: string; ip: string | null }): Promise<LinkResult> {
  const label = kind === "magic" ? "magic link" : "password reset";
  const skip = (reason: string): LinkResult => {
    console.warn(`[portal] ${label} requested for ${maskEmail(email)}: no mail sent — ${reason}`);
    return { mailed: false, reason };
  };

  const user = await accountForLink(email, ctx.locale);
  if (!user) return skip("no portal account has this e-mail (a partner needs an invitation first)");
  if (user.status === "disabled") return skip("the account is disabled");

  const purpose: TokenPurpose = user.status === "active" ? kind : "invite";
  if (await tooManyLinks(user.id, purpose)) return skip(`already ${LINK_MAX_PER_WINDOW} ${purpose} links within ${LINK_WINDOW_MINUTES} minutes`);

  const locale = user.locale || ctx.locale;
  if (purpose === "invite") {
    // Not activated yet: the invitation is what they need — it sets the password too.
    const token = await issueToken(user.id, "invite", INVITE_TTL_HOURS * 60);
    await sendInviteMail({ to: user.email, name: user.name, company: user.company, origin: ctx.origin, token, locale });
    await audit({ action: "invite_resent", actorId: user.id, actorEmail: user.email, target: kind === "magic" ? "via Login" : "via Passwort vergessen", ip: ctx.ip });
  } else if (purpose === "magic") {
    const token = await issueToken(user.id, "magic", MAGIC_TTL_MINUTES);
    await sendMagicLinkMail({ to: user.email, name: user.name, origin: ctx.origin, token, locale });
    await audit({ action: "magic_link_requested", actorId: user.id, actorEmail: user.email, ip: ctx.ip });
  } else {
    const token = await issueToken(user.id, "reset", RESET_TTL_MINUTES);
    await sendResetMail({ to: user.email, name: user.name, origin: ctx.origin, token, locale });
    await audit({ action: "password_reset_requested", actorId: user.id, actorEmail: user.email, ip: ctx.ip });
  }
  return { mailed: true, purpose };
}
