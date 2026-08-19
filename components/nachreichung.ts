import { randomBytes } from "crypto";

/**
 * Nachreichung — the one-time link handed to a customer whose dossier arrived incomplete
 * (spec V2: "Kunde erhält in Mail 2b einen einmaligen Link").
 *
 * The token is the ONLY credential the Nachreich page asks for: anyone holding it can see
 * which documents are missing and upload files against that submission. That shapes every
 * decision here — 256 bits of randomness so it cannot be guessed, an expiry so a forwarded
 * or leaked mail does not stay live forever, and no customer data encoded in the token
 * itself.
 *
 * It deliberately does NOT expire on first use. "Einmalig" in the spec distinguishes this
 * link from a reusable public URL; reading it as single-use would lock a customer out
 * after uploading one of three missing documents, which is the opposite of the point. The
 * link stops working once the dossier is complete, or when it expires.
 */

/** How long a Nachreich link stays valid. Long enough to chase a document from an employer
 *  or a Grundbuchamt, short enough that a stale mail is not a standing entry point. */
export const NACHREICH_TTL_DAYS = 30;

export function createNachreichToken(): string {
  // URL-safe, 43 chars, 256 bits. base64url avoids the +/= that would need escaping in a
  // mail client's link parser.
  return randomBytes(32).toString("base64url");
}

export function nachreichExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + NACHREICH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Absolute base URL for links that leave the server (mail bodies). Relative URLs are
 * useless in an inbox, and NEXT_PUBLIC_SITE_URL is the only value an operator can correct
 * without a code change if the canonical domain moves.
 */
/**
 * Canonical public domain, used when nothing better is configured.
 *
 * hypoteq.com, NOT the hypoteq.ch in lib/seo.ts: hypoteq.ch only redirects its root and
 * answers 404 on every app path (verified against production), so a link built on it would
 * be dead on arrival in the customer's inbox. Set NEXT_PUBLIC_SITE_URL to override.
 */
const CANONICAL_SITE_URL = "https://hypoteq.com";

export function siteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // VERCEL_URL is the DEPLOYMENT hostname (hypoteq-a1b2c3.vercel.app), never the custom
  // domain — so it must not be used in production, where it would mail customers a link
  // to a build-specific URL that means nothing to them and rotates on the next deploy.
  // On previews it is the only address that resolves, so it wins there.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return CANONICAL_SITE_URL;
}

export type NachreichLocale = "de" | "fr" | "it" | "en";

export function buildNachreichUrl(token: string, locale: NachreichLocale): string {
  return `${siteBaseUrl()}/${locale}/nachreichen/${token}`;
}

export type NachreichRejection = "not_found" | "expired" | "already_complete";

export interface NachreichRecord {
  nachreichExpiresAt: Date | null;
  nachreichCompletedAt: Date | null;
  documentsComplete: boolean | null;
}

/**
 * Why a token may not be used, or null when it is good. Callers turn this into a message;
 * keeping the reasons distinct lets the page say "this link has expired" rather than the
 * unhelpful "invalid link" for every case.
 */
export function rejectNachreich(
  row: NachreichRecord | null,
  now: Date = new Date()
): NachreichRejection | null {
  if (!row) return "not_found";
  if (row.nachreichCompletedAt || row.documentsComplete === true) return "already_complete";
  if (!row.nachreichExpiresAt || row.nachreichExpiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

/** Comma-joined keys as stored on Inquiry.documentsMissing, back into a key list. */
export function parseMissingKeys(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored.split(",").map((k) => k.trim()).filter(Boolean);
}
