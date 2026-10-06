import { prisma } from "@/lib/prisma";
import { newToken, sha256 } from "@/lib/portal/crypto";

export type TokenPurpose = "invite" | "reset" | "magic";

/** Issue a one-time link token. Any earlier unused token for the same purpose stops working. */
export async function issueToken(userId: string, purpose: TokenPurpose, ttlMinutes: number): Promise<string> {
  const token = newToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.portalToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.portalToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(token),
        expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
      },
    }),
  ]);
  return token;
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
 * requests with the same token, only one sees count === 1.
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
  return prisma.portalToken.findUnique({ where: { tokenHash }, include: { user: true } });
}
