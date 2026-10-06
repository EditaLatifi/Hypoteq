import { NextResponse } from "next/server";
import { readSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/session → { loggedIn, firstName? }
 *
 * Whether this browser holds a live Partnerportal session. The Funnel v3 closing asks so a
 * Berater gets «Zurück zum Dashboard» when logged in and «Im Partnerportal anmelden» when
 * not. Nothing beyond that boolean and a first name leaves this route; the session cookie
 * is httpOnly, so the funnel cannot tell on its own.
 */
export async function GET() {
  let body: { loggedIn: boolean; firstName?: string } = { loggedIn: false };
  try {
    const s = await readSession();
    if (s.state === "ok") body = { loggedIn: true, firstName: (s.user.name || "").split(" ")[0] || undefined };
  } catch {
    // No tables yet, no database: the funnel falls back to the portal's own redirect.
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
