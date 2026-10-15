import { prisma } from "@/lib/prisma";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import type { SessionUser } from "@/lib/portal/session";

/**
 * Profile photo and partner logo (handoff 4 «Profil», DECISIONS P1 / P6).
 *
 * Both live in the PortalImage table, served by /api/portal/image/[kind] behind the
 * session — no second storage system, no public URL:
 *   - photo: one per portal user (ownerId = PortalUser.id)
 *   - logo:  one per partner company (ownerId = Salesforce Account Id), so it applies to
 *            every user of that partner
 *
 * Server-only: reads the database.
 */

export type ImageKind = "photo" | "logo";
export const IMAGE_KINDS: ImageKind[] = ["photo", "logo"];

export function isImageKind(v: unknown): v is ImageKind {
  return v === "photo" || v === "logo";
}

/** `v` is updatedAt in ms: callers append `?v=<v>` to the image URL, so a new image is a new URL. */
export type ImageMeta = { photo: { v: number } | null; logo: { v: number; onLight: boolean } | null };

/**
 * The Account whose logo this session shows: the partner's own company, or — for an admin
 * using «Als Partner ansehen» — the viewed partner's company.
 */
export async function logoAccountFor(user: SessionUser): Promise<string | null> {
  if (!user.viewingAs) return isSalesforceId(user.sfAccountId) ? user.sfAccountId : null;
  try {
    const scope = await scopeFor(user);
    return isSalesforceId(scope?.accountId) ? scope!.accountId : null;
  } catch (err) {
    console.error("[portal] could not resolve the viewed partner's account", err);
    return null;
  }
}

/** Whose photo this session shows. None while viewing as a partner: the photo is personal. */
export function photoOwnerFor(user: SessionUser): string | null {
  return user.viewingAs ? null : user.id;
}

/**
 * Whether the session has a photo and a logo, and their versions — without the bytes.
 * Used by the portal layout on every page, so it never throws: a database without the
 * PortalImage table yet (prisma/sql/2026-10-15-v5-and-portal.sql not run) just has no images.
 */
export async function imageMeta(user: SessionUser): Promise<ImageMeta> {
  const photoOwner = photoOwnerFor(user);
  const accountId = await logoAccountFor(user);
  const select = { id: true, updatedAt: true, onLight: true } as const;
  try {
    const [photo, logo] = await Promise.all([
      photoOwner ? prisma.portalImage.findUnique({ where: { kind_ownerId: { kind: "photo", ownerId: photoOwner } }, select }) : null,
      accountId ? prisma.portalImage.findUnique({ where: { kind_ownerId: { kind: "logo", ownerId: accountId } }, select }) : null,
    ]);
    return {
      photo: photo ? { v: photo.updatedAt.getTime() } : null,
      logo: logo ? { v: logo.updatedAt.getTime(), onLight: logo.onLight } : null,
    };
  } catch (err) {
    console.error("[portal] reading image meta failed", err);
    return { photo: null, logo: null };
  }
}

/** The image this session sees for `kind`, with its bytes — for the image route. */
export async function loadImage(user: SessionUser, kind: ImageKind) {
  const ownerId = kind === "photo" ? photoOwnerFor(user) : await logoAccountFor(user);
  if (!ownerId) return null;
  return prisma.portalImage.findUnique({
    where: { kind_ownerId: { kind, ownerId } },
    select: { id: true, mime: true, data: true, updatedAt: true },
  });
}

/**
 * Headers for serving a stored image. Private (it sits behind the login), never sniffed,
 * and under a CSP that allows no script and no external load — so even an SVG opened
 * directly in the browser cannot run anything on this origin. A request carrying the
 * current version (`?v=`) may be cached for good; anything else revalidates.
 */
export function imageResponseHeaders(img: { id: string; mime: string; updatedAt: Date }, requestedVersion: string | null): Record<string, string> {
  const v = String(img.updatedAt.getTime());
  return {
    "Content-Type": img.mime,
    "Cache-Control": requestedVersion === v ? "private, max-age=31536000, immutable" : "private, no-cache",
    ETag: `"${img.id}-${v}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Disposition": "inline",
  };
}
