import { prisma } from "@/lib/prisma";
import { LINK_MAX_PER_WINDOW, LINK_WINDOW_MINUTES } from "@/lib/portal/config";
import { newToken, sha256 } from "@/lib/portal/crypto";

export type TokenPurpose = "invite" | "reset" | "magic";

/**
 * Issue a one-time link token. Earlier unused links of the same purpose stay valid until
 * they expire or one of them is used (consumeToken): a partner who asks twice because the
 * first mail is slow, then opens the first one, must not land on «Link nicht mehr gültig»
 * (HYPOTEQ 19.10.2026 B6 / E.3, DECISIONS P34). How many may be asked for is tooManyLinks.
 */
export async function issueToken(userId: string, purpose: TokenPurpose, ttlMinutes: number, now: Date = new Date()): Promise<string> {
  const token = newToken();
  await prisma.portalToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
    },
  });
  return token;
}

/**
 * Whether this account has had LINK_MAX_PER_WINDOW links of this purpose within the last
 * LINK_WINDOW_MINUTES: then no further mail goes out (a mailbox is not to be flooded), and
 * the caller logs why.
 */
export async function tooManyLinks(userId: string, purpose: TokenPurpose, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - LINK_WINDOW_MINUTES * 60_000);
  const n = await prisma.portalToken.count({ where: { userId, purpose, createdAt: { gte: since } } });
  return n >= LINK_MAX_PER_WINDOW;
}

/** Look a token up without using it — for rendering the page the link opens. */
export async function peekToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null;
  const row = await prisma.portalToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/**
 * Use a token exactly once. The conditional update is the lock: of two concurrent
 * requests with the same token, only one sees count === 1. Using one link retires every
 * other unused link of the same account and purpose.
 */
export async function consumeToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null;
  const tokenHash = sha256(token);
  const now = new Date();
  const { count } = await prisma.portalToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) return null;
  const row = await prisma.portalToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (row) {
    await prisma.portalToken.updateMany({ where: { userId: row.userId, purpose, usedAt: null }, data: { usedAt: now } });
  }
  return row;
}
