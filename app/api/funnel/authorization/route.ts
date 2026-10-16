import { buildAuthorizationPdf, authorizationFileName } from "@/lib/funnel-v3/authorization";
import { normaliseAuthorizationData, parseAuthorizationBody } from "@/lib/funnel-v3/authorizationData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * «Vorlage herunterladen» in the closing (Handover 6, step 1): the Auskunftsermächtigung
 * prefilled with what the browser holds — no database, no Salesforce, no case number before the
 * closing (lib/funnel-v3/authorizationData.ts authorizationDataFromState builds the body).
 *
 *   POST  JSON AuthorizationData (≤ 8 KB, at most two signers, values trimmed to 200 chars)
 *         → the prefilled PDF as a download.
 *   GET   ?lang=de|en|fr|it → the empty template of that language (no personal data in a URL).
 *
 * After the closing the Nachreich page downloads its copy from
 * /api/nachreichen/[token]/authorization (prefilled from the stored inquiry).
 */

function pdfResponse(bytes: Uint8Array, fileName: string): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = parseAuthorizationBody(raw);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  try {
    return pdfResponse(await buildAuthorizationPdf(parsed.data), authorizationFileName(parsed.data));
  } catch (err) {
    console.error("[funnel/authorization] PDF failed:", err);
    return Response.json({ error: "Could not create the authorisation" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang");
  const data = normaliseAuthorizationData({ lang: lang as any, signers: [] });
  try {
    return pdfResponse(await buildAuthorizationPdf(data), authorizationFileName(data));
  } catch (err) {
    console.error("[funnel/authorization] template failed:", err);
    return Response.json({ error: "Could not create the authorisation" }, { status: 500 });
  }
}
