import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { newToken, sha256 } from "@/lib/portal/crypto";
import { SESSION_COOKIE, SESSION_IDLE_MINUTES, SESSION_MAX_HOURS } from "@/lib/portal/config";
import type { PortalUser } from "@prisma/client";

export type SessionUser = Pick<
  PortalUser,
  | "id"
  | "email"
  | "role"
  | "status"
  | "name"
  | "company"
  | "phone"
  | "sfContactId"
  | "sfAccountId"
  | "lastLoginAt"
  | "activatedAt"
  | "profileConfirmedAt"
  | "notifyPrefs"
  | "locale"
  | "companyScope"
> & {
  sessionId: string;
  /**
   * The Salesforce Contact whose Cases this session shows: the partner's own, or — for an
   * admin using "Als Partner ansehen" — the partner being viewed.
   */
  contactId: string | null;
  /** Set while an admin views the portal as a partner. Such a session is read-only. */
  viewingAs: { contactId: string; name: string } | null;
};

export function requestIp(): string | null {
  const h = headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
}

/** Absolute origin of the current request, for links in e-mails. */
export function requestOrigin(): string {
  if (process.env.PORTAL_BASE_URL) return process.env.PORTAL_BASE_URL.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "www.hypoteq.ch";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only callable from a server action or route handler (it sets a cookie). */
export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const now = new Date();
  await prisma.portalSession.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + SESSION_MAX_HOURS * 3600_000),
      ip: requestIp(),
      userAgent: (headers().get("user-agent") || "").slice(0, 300) || null,
    },
  });
  await prisma.portalUser.update({ where: { id: userId }, data: { lastLoginAt: now } });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_HOURS * 3600,
  });
}

/** Only callable from a server action or route handler. */
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.portalSession.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => {});
  }
  cookies().delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.portalSession.deleteMany({ where: { userId } });
}

type SessionState =
  | { state: "none" }
  | { state: "expired" }
  | { state: "ok"; user: SessionUser };

/**
 * Resolve the session cookie. Cached per request, so layout and page share one lookup.
 * Idle expiry is enforced here on the server: the cookie itself lives for the maximum
 * session length, and `lastSeenAt` decides whether it is still good.
 */
export const readSession = cache(async (): Promise<SessionState> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return { state: "none" };

  const session = await prisma.portalSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return { state: "expired" };

  const now = Date.now();
  const idleLimit = session.lastSeenAt.getTime() + SESSION_IDLE_MINUTES * 60_000;
  if (now > idleLimit || now > session.expiresAt.getTime() || session.user.status !== "active") {
    await prisma.portalSession.delete({ where: { id: session.id } }).catch(() => {});
    return { state: "expired" };
  }

  // Write lastSeenAt at most once a minute; every page view does not need a DB write.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.portalSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => {});
  }

  const u = session.user;
  const viewingAs =
    u.role === "admin" && session.viewAsContactId
      ? { contactId: session.viewAsContactId, name: session.viewAsName || "Partner" }
      : null;
  return {
    state: "ok",
    user: {
      sessionId: session.id,
      contactId: viewingAs ? viewingAs.contactId : u.sfContactId,
      viewingAs,
      profileConfirmedAt: u.profileConfirmedAt,
      notifyPrefs: u.notifyPrefs,
      locale: u.locale,
      companyScope: u.companyScope,
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      name: u.name,
      company: u.company,
      phone: u.phone,
      sfContactId: u.sfContactId,
      sfAccountId: u.sfAccountId,
      lastLoginAt: u.lastLoginAt,
      activatedAt: u.activatedAt,
    },
  };
});

export async function requireUser(): Promise<SessionUser> {
  const s = await readSession();
  if (s.state === "ok") return s.user;
  redirect(s.state === "expired" ? "/portal/abgelaufen" : "/portal/login");
}

/** For actions that change something: refused while an admin is only viewing as a partner. */
export async function requireActingPartner(): Promise<SessionUser & { contactId: string }> {
  const user = await requireUser();
  if (user.viewingAs || !user.contactId) throw new Error("Nur für den Partner selbst möglich.");
  return user as SessionUser & { contactId: string };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/portal/dashboard");
  return user;
}
