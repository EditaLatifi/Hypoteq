/**
 * A sliding-window request counter, per key (an IP), per warm instance.
 *
 * Not a security boundary on its own — instances do not share it — but it stops one browser
 * from walking a lookup endpoint address by address.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return {
    /** Records the request and answers whether it is over the limit. */
    limited(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return true;
      }
      recent.push(now);
      hits.set(key, recent);
      // Keep the map from growing without bound on a long-lived instance.
      if (hits.size > 5000) {
        hits.forEach((times, k) => {
          if (!times.some((t) => now - t < windowMs)) hits.delete(k);
        });
      }
      return false;
    },
    reset(): void {
      hits.clear();
    },
  };
}

/** The caller's IP as Vercel reports it (first x-forwarded-for hop). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
