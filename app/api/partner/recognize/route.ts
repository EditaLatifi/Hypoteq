import { NextResponse } from "next/server";
import { resolvePartner, initialsOf } from "@/components/partnerDirectory";
import { createRateLimiter, clientIp } from "@/components/rateLimit";

/**
 * POST /api/partner/recognize  { email }  →  { status, name?, company?, initials? }
 *
 * Live partner recognition for the Berater entry (spec 2.2). Read-only, so it also runs in
 * test mode. Never returns Salesforce ids — those are resolved again at submit time.
 *
 * A Salesforce failure answers 200 with { status: 'unknown', degraded: true }: the funnel
 * must carry on (the partner simply sees the «Noch kein Partner?» form), and the submit-time
 * lookup gets another chance.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 20 lookups a minute per IP is far above what a person typing an address needs.
const limiter = createRateLimiter(20, 60 * 1000);

export async function POST(req: Request) {
  if (limiter.limited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let email = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim() : "";
  } catch {
    /* invalid JSON → treated as a missing e-mail */
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  try {
    const result = await resolvePartner(email);
    if (result.status === "partner") {
      return NextResponse.json({
        status: "partner",
        name: result.name,
        company: result.company ?? undefined,
        initials: initialsOf(result.name),
      });
    }
    if (result.status === "hypoteq") {
      return NextResponse.json({
        status: "hypoteq",
        name: result.name,
        company: "HYPOTEQ AG",
        initials: initialsOf(result.name),
      });
    }
    return NextResponse.json({ status: "unknown" });
  } catch (err) {
    console.error("[Partner recognize] Salesforce lookup failed, answering unknown:", err);
    return NextResponse.json({ status: "unknown", degraded: true });
  }
}
