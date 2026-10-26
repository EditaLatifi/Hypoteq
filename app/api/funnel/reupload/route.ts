import { timingSafeEqual } from "crypto";
import { requestReupload } from "@/lib/funnel-v3/reuploadServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Re-Upload anfordern» from Salesforce (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich Kap. 5;
 * answer 8 of 26.10.2026). Spec for HYPOTEQ: docs/funnel-v5/HYPOTEQ_Schnittstelle_ReUpload.md.
 *
 *   POST /api/funnel/reupload
 *   Authorization: Bearer <REUPLOAD_API_TOKEN>
 *   { caseId | caseNumber, requirement, reason, mailText?, recipient?, lang?, taskId?, preview? }
 *
 * The requirement goes back to «FEHLT» (its documents to «Weitere Dateien»), the mail of 10.1
 * goes out with the Nachreich link, the reminders follow after 2 and 5 days, the Case gets the
 * recomputed documents and the Abgleich JSON. `preview: true` returns the prepared mail only.
 */
function authorised(req: Request): boolean {
  const secret = process.env.REUPLOAD_API_TOKEN || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret.length < 24 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.REUPLOAD_API_TOKEN) return Response.json({ ok: false, error: "re-upload is not configured" }, { status: 503 });
  if (!authorised(req)) return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return Response.json({ ok: false, error: "request too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  try {
    const res = await requestReupload(body);
    return Response.json(res.body, { status: res.status });
  } catch (err) {
    console.error("[Re-Upload] request failed:", err);
    return Response.json({ ok: false, error: "could not process the request" }, { status: 500 });
  }
}
