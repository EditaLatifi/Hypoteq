import { attachmentDisposition, createDossierPdf, dossierDownloadName, dossierPersonName } from "@/lib/funnel-v3/dossier";
import { previewInput } from "@/lib/funnel-v3/dossier/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** A funnel state with a few hundred files is well under this. */
const MAX_BODY_BYTES = 2_000_000;

/**
 * «Fall-Dossier herunterladen» before the closing (Spezifikation 3 Schritt 6): the funnel state
 * and the files summary in, the dossier as a PDF out — without a case number, which the closing
 * assigns. No database, no Salesforce, no SharePoint — it only draws what the browser already
 * holds. After the closing the stored dossier is downloaded from /api/dossier/[inquiryId].
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Request too large" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const input = previewInput((body ?? {}) as any);
    const bytes = await createDossierPdf(input);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(dossierDownloadName(dossierPersonName(input.state))),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[dossier/preview] failed:", err);
    return Response.json({ error: "Could not create the dossier" }, { status: 500 });
  }
}
