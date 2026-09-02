import { NextResponse } from "next/server";
import { analyseDocument } from "@/components/documentIntelligence/analyse";
import { documentIntelligenceDisabledReason } from "@/components/documentIntelligence/enabled";

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
 *   submissionId      optional; when given, the analysis is stored against the uploaded row
 *
 * Section 38 governs the failure behaviour: an AI error must never make the funnel
 * unusable, so every failure comes back as HTTP 200 with status "failed" and the funnel
 * carries on with manual classification. The only 4xx is a request that is not a document.
 */

export const runtime = "nodejs";
// Analysis of a long PDF is slow; section 31 wants this off the UI thread, and the client
// polls rather than blocks. Above the provider's own latency so a slow read is not truncated
// into a spurious failure — measured at 5-7s per document, so this is headroom for the
// pathological case rather than the expected wait.
//
// 60 is the ceiling of the plan this project is on, not a considered number: asking for more
// on Hobby does not get more. vercel.json names this route at 60 as well, because it is not
// worth depending on which of the two wins. Raising both is the first thing to do if the
// account ever moves to Pro, and DOCAI_TIMEOUT_MS has to stay below whatever they say.
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPTED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * The body sent when no analysis happened — a failure, or a deployment where the feature is
 * switched off. Shared so those two cannot drift apart: the client tells them apart by
 * nothing at all, and must not need to. Section 38 governs both, and the funnel falls back
 * to manual classification either way.
 */
function withoutAnalysis(message: string, disabled = false) {
  return {
    success: false,
    error: message,
    // Set only when the feature is switched off here, never on a failure. The client stops
    // sending files once it sees it — otherwise a customer on a production deployment would
    // upload every document twice, once to SharePoint and once to an endpoint that was
    // always going to refuse it. A flag rather than the message text, so the client is not
    // matching on a sentence someone may reword.
    disabled,
    analysis: {
      documentId: null,
      status: "failed",
      classification: { type: "unknown", label: "Nicht analysiert", confidence: 0 },
      fields: {},
      funnelDocKey: null,
    },
  };
}

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
  // Checked before the body is read: on a deployment where analysis is switched off there is
  // no reason to pull 25 MB over the wire to throw it away. Answered as a non-analysis
  // rather than an error, because to the funnel this is not a failure — it is the behaviour
  // it had before the feature existed.
  const disabled = documentIntelligenceDisabledReason();
  if (disabled) {
    console.log(`[DocAI] skipped: ${disabled}`);
    return NextResponse.json(withoutAnalysis(disabled, true));
  }

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
    const submissionRaw = form.get("submissionId");
    const submissionId =
      typeof submissionRaw === "string" && submissionRaw ? submissionRaw : null;

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

    // Store it against the row the upload created (sections 27 and 36). Done here rather
    // than in a follow-up call from the browser so the audit record cannot be lost by a
    // customer closing the tab between the two requests.
    //
    // Never fatal: the analysis is already computed and is returned either way, and a
    // dossier that cannot write its audit row is still a dossier.
    if (submissionId) {
      try {
        const { attachAnalysis } = await import("@/lib/sharepoint");
        const where = await attachAnalysis({
          submissionId,
          fileName,
          status: analysis.status,
          docType: analysis.classification.type,
          confidence: analysis.classification.confidence,
          analysis,
        });
        if (where === "not_found") {
          console.warn(`[DocAI] No upload row yet for ${fileName} in ${submissionId}; analysis not stored`);
        }
      } catch (storeErr) {
        console.error("[DocAI] Could not store the analysis:", storeErr);
      }
    }

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Document analysis failed";
    console.error(`[DocAI] Analysis failed for ${fileName || "(unknown file)"}:`, message);

    // Deliberately 200. Section 38: the funnel must stay usable when analysis is not, and
    // the client shows a manual document-type picker on this status rather than an error.
    return NextResponse.json(withoutAnalysis(message));
  }
}
