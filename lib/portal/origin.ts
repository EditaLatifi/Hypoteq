/**
 * The origin (scheme + host) that links in portal e-mails point to: invite, reset, magic
 * link, notifications. Pure — the request headers and the environment are parameters.
 *
 * The link must lead back to a deployment that serves /portal. That is the host the request
 * came in on, as long as it is one of ours: a reset requested on a Vercel preview must not
 * send the partner to the production domain, which has no portal yet (HYPOTEQ 19.10.2026
 * B6 / E.3). A Host or X-Forwarded-Host header nobody vouches for is never used — otherwise
 * anyone could request a reset for a partner with a forged Host and receive the token on
 * their own server. Trusted: the hosts of PORTAL_BASE_URL, NEXT_PUBLIC_SITE_URL and
 * PORTAL_TRUSTED_HOSTS, the deployment's own Vercel hostnames, and localhost off Vercel.
 *
 * Without a trusted request host (and for the cron, which has none) the link goes to
 * PORTAL_BASE_URL, else to the deployment itself (its branch URL on a preview, the production
 * domain on production), else to www.hypoteq.ch.
 */

export type OriginHeaders = { host?: string | null; forwardedHost?: string | null; forwardedProto?: string | null };

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/;

/** The first value of a header that proxies may have turned into a list. */
function first(v: string | null | undefined): string {
  return (v || "").split(",")[0].trim().toLowerCase();
}

function hostOf(url: string | undefined): string | null {
  if (!url || !url.trim()) return null;
  try {
    return new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function isLocal(host: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

function onVercel(env: NodeJS.ProcessEnv): boolean {
  return !!(env.VERCEL || env.VERCEL_URL);
}

export function trustedHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const listed = (env.PORTAL_TRUSTED_HOSTS || "").split(/[,;\s]+/).map((h) => hostOf(h));
  const own = [env.PORTAL_BASE_URL, env.NEXT_PUBLIC_SITE_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].map((h) => hostOf(h));
  return Array.from(new Set([...own, ...listed].filter((h): h is string => !!h)));
}

export function linkOrigin(h: OriginHeaders, env: NodeJS.ProcessEnv = process.env): string {
  const requestHost = first(h.forwardedHost) || first(h.host);
  const forwardedProto = first(h.forwardedProto);
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : requestHost && isLocal(requestHost) ? "http" : "https";

  if (requestHost && HOST.test(requestHost)) {
    if (trustedHosts(env).includes(requestHost)) return `${proto}://${requestHost}`;
    // A developer machine (next dev / next start): there is nobody to forge the header for.
    if (!onVercel(env) && isLocal(requestHost)) return `${proto}://${requestHost}`;
  }

  const base = (env.PORTAL_BASE_URL || "").trim().replace(/\/+$/, "");
  if (base && hostOf(base)) return /^https?:\/\//i.test(base) ? base : `https://${base}`;

  if (onVercel(env)) {
    const own = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL : env.VERCEL_BRANCH_URL || env.VERCEL_URL;
    const host = hostOf(own);
    if (host) return `https://${host}`;
  }
  return "https://www.hypoteq.ch";
}

/** For links built outside a request (the cron): no headers to trust. */
export function backgroundOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return linkOrigin({}, env);
}
