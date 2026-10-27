import { NextResponse } from "next/server";
import { createRateLimiter, clientIp } from "@/components/rateLimit";
import { hypoDisabledReason } from "@/components/hypo/extract";
import { matchPartner } from "@/components/hypo/partnerMatch";
import { coerce } from "@/lib/funnel-v3/hypo/fields";

/**
 * POST /api/hypo/partner { vor, nach, firma } → { status: "match", name, company } | { status: "none" }
 *
 * HYPO's name match for a broker (Konzept Kap. 4; components/hypo/partnerMatch.ts). Read-only;
 * runs in test mode like /api/partner/recognize. A Salesforce failure answers «none» with
 * `degraded` — HYPO then asks for the e-mail as for a new partner, which is what assigns the case.
 */

// Lower than the e-mail lookup: a name search is the easier one to walk.
const limiter = createRateLimiter(8, 60 * 1000);

export async function POST(req: Request) {
  if (limiter.limited(clientIp(req))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  if (hypoDisabledReason()) return NextResponse.json({ status: "none" });

  const body = await req.json().catch(() => null);
  const nach = coerce("txt.pnach", body?.nach);
  const vor = coerce("txt.pvor", body?.vor) ?? "";
  const firma = coerce("txt.pfirma", body?.firma) ?? "";
  if (typeof nach !== "string" || nach.length < 2) return NextResponse.json({ error: "nach is required" }, { status: 400 });
  if (!vor && !firma) return NextResponse.json({ error: "vor or firma is required" }, { status: 400 });

  try {
    const result = await matchPartner({ vor: String(vor), nach, firma: String(firma) });
    console.log(`[HYPO] partner name match: ${result.status}`);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[HYPO] partner name match failed, answering none:", err instanceof Error ? err.message : err);
    return NextResponse.json({ status: "none", degraded: true });
  }
}
