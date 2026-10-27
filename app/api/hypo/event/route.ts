import { NextResponse } from "next/server";
import { createRateLimiter, clientIp } from "@/components/rateLimit";

/**
 * POST /api/hypo/event { event, detail } → 204
 *
 * Konzept HYPO Kap. 9 «Vorschlags-Klicks und Abbruchpunkte als Events»: one log line per event,
 * for the intent statistics. Only known event names and short ids (a suggestion's intent, the
 * question where someone left) — never a typed value, never anything about the person.
 */

const EVENTS = new Set([
  "start",
  "suggestion",
  "partner_chip",
  "about_bot",
  "offer_broker",
  "offer_academy",
  "offer_bewertung",
  "offer_language",
  "fallback",
  "complete",
  "handover",
  "leave_form",
  "upload",
]);

const limiter = createRateLimiter(60, 60 * 1000);

export async function POST(req: Request) {
  if (limiter.limited(clientIp(req))) return new NextResponse(null, { status: 204 });
  const body = await req.json().catch(() => null);
  const event = typeof body?.event === "string" ? body.event : "";
  if (!EVENTS.has(event)) return new NextResponse(null, { status: 204 });
  const detail = typeof body?.detail === "string" && /^[a-zA-Z0-9_.:-]{1,60}$/.test(body.detail) ? body.detail : "";
  console.log(`[HYPO event] ${event}${detail ? ` ${detail}` : ""}`);
  return new NextResponse(null, { status: 204 });
}
