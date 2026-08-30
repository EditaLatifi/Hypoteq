import { NextResponse } from "next/server";
import { analyseDocument } from "@/components/documentIntelligence/analyse";

/**
 * Document Intelligence endpoint (spec section 30).
 *
 * HYPOTEQ's own service in front of whichever AI provider is configured, so the funnel never
 * talks to a vendor directly and a model can be swapped without touching it.
 *
 * Accepts multipart/form-data:
 *   file              the document (PDF or image)
 *   visibleDocKeys    JSON array of the requirements this case was shown
 *   expectedDocKey    optional; the requirement the file was uploaded against
 *   borrowers         optional; JSON [{id, name}] for person assignment (section 24)
 *
 * Section 38 governs the failure behaviour: an AI error must never make the funnel
 * unusable, so every failure comes back as HTTP 200 with status "failed" and the funnel
 * carries on with manual classification. The only 4xx is a request that is not a document.
 */

export const runtime = "nodejs";
// Analysis of a long PDF is slow; section 31 wants this off the UI thread, and the client
// polls rather than blocks. Well above the provider's own latency so a slow read is not
// truncated into a spurious failure.
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPTED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

function parseJsonArray(raw: FormDataEntryValue | null): any[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  let fileName = "";
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file supplied" }, { status: 400 });
    }
    fileName = file.name || "document";

    if (file.size === 0) {
      return NextResponse.json({ error: "The file is empty" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      // Section 38 lists an oversized file as a case to catch. A clear answer beats a
      // provider-side rejection the customer cannot act on.
      return NextResponse.json(
        { error: `The file is larger than ${MAX_BYTES / (1024 * 1024)} MB` },
        { status: 413 }
      );
    }

    const mimeType = file.type || "application/pdf";
    if (!ACCEPTED.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}` },
        { status: 415 }
      );
    }

    const visibleDocKeys = parseJsonArray(form.get("visibleDocKeys")).filter(
      (k): k is string => typeof k === "string"
    );
    const borrowers = parseJsonArray(form.get("borrowers"))
      .filter((b) => b && typeof b === "object" && typeof b.id === "string")
      .map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));
    const expectedRaw = form.get("expectedDocKey");
    const expectedFunnelKey = typeof expectedRaw === "string" && expectedRaw ? expectedRaw : null;

    const data = Buffer.from(await file.arrayBuffer());

    const analysis = await analyseDocument({
      fileName,
      mimeType,
      data,
      visibleFunnelKeys: visibleDocKeys,
      expectedFunnelKey,
      borrowers,
    });

    // Section 37: the log records that a document was processed and how it was classified.
    // Never its contents, and never an extracted value — those are the sensitive part.
    console.log(
      `[DocAI] ${fileName} -> ${analysis.classification.type} ` +
        `(${Math.round(analysis.classification.confidence * 100)}%), status=${analysis.status}, ` +
        `${Object.keys(analysis.fields).length} field(s), ${analysis.audit.durationMs}ms`
    );

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Document analysis failed";
    console.error(`[DocAI] Analysis failed for ${fileName || "(unknown file)"}:`, message);

    // Deliberately 200. Section 38: the funnel must stay usable when analysis is not, and
    // the client shows a manual document-type picker on this status rather than an error.
    return NextResponse.json({
      success: false,
      error: message,
      analysis: {
        documentId: null,
        status: "failed",
        classification: { type: "unknown", label: "Nicht analysiert", confidence: 0 },
        fields: {},
        funnelDocKey: null,
      },
    });
  }
}
