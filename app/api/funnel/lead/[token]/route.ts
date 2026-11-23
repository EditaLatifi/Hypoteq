import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/components/rateLimit";
import { leadForLink } from "@/lib/portal/leadServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/funnel/lead/[token] — Partner Fast Lead (DECISIONS P39). What the customer's personal
 * link opens: { status: "ok", locale, customer, partner } to prefill the funnel's contact and show
 * who invited them, or { status: "invalid" | "used" | "expired" } — the funnel then simply opens
 * as the customer's own request.
 *
 * The token is the only credential, so the answer holds no more than the customer's own contact
 * details as the partner entered them and the partner's name and company — no Salesforce id, no
 * partner address. The partner is never taken from the browser at the submit either: /api/inquiry
 * looks the invitation up again by this token.
 */

// A person opens their link a few times; 30 a minute per IP stops walking the token space.
const limiter = createRateLimiter(30, 60 * 1000);

export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (limiter.limited(clientIp(req))) {
    return NextResponse.json({ status: "invalid", error: "Too many requests." }, { status: 429 });
  }
  try {
    const lead = await leadForLink(params.token);
    return NextResponse.json(lead, { status: lead.status === "invalid" ? 404 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // E.g. before prisma/sql/2026-11-23-portal-lead.sql has run: the funnel opens without prefill.
    console.error("[funnel] lead lookup failed", err);
    return NextResponse.json({ status: "invalid" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
