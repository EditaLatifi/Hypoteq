import { NextResponse } from "next/server";
import { analyseDocument } from "@/components/documentIntelligence/analyse";
import { documentIntelligenceDisabledReason } from "@/components/documentIntelligence/enabled";
import {
  downloadDriveItem,
  findUploadedDocument,
  getAccessToken,
  storeAnalysis,
} from "@/lib/sharepoint";

/**
 * Document Intelligence endpoint (spec section 30).
 *
 * HYPOTEQ's own service in front of whichever AI provider is configured, so the funnel never
 * talks to a vendor directly and a model can be swapped without touching it.
 *
 * Works on a file that is ALREADY uploaded. The browser sends only the row id it got back
 * from /api/upload-doc/finalize; the file itself is read back from SharePoint here. That
 * means every document crosses the customer's connection once, not twice, and it sidesteps
 * Vercel's 4.5 MB request-body limit, which used to make every larger scan fail silently.
 *
 * Accepts JSON:
 *   documentId        the uploaded row (HoldingDocument before submit, Document after)
 *   submissionId      the submission the row belongs to; must match
 *   visibleDocKeys    the requirements this case was shown
 *   expectedDocKey    optional; the requirement the file was uploaded against
 *   borrowers         optional; [{id, name}] for person assignment (section 24)
 *   reuse             optional; return the stored analysis if the row already has one
 *
 * The result is stored on the row in the same request, so the audit record (section 36)
 * cannot be lost by a customer closing the tab.
 *
 * Section 38 governs failure: an AI error must never make the funnel unusable, so every
 * failure comes back as HTTP 200 with status "failed" and the funnel falls back to manual
 * classification. Only a malformed request gets a 4xx.
 */

export const runtime = "nodejs";
// The ceiling of the plan this project is on. The provider's own timeout (openaiProvider.ts)
// sits below it with room for the SharePoint read and the DB write.
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPTED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

/**
 * The body sent when no analysis happened — a failure, or a deployment where the feature is
 * switched off. Shared so those two cannot drift apart.
 */
function withoutAnalysis(message: string, disabled = false) {
  return {
    success: false,
    error: message,
    // Set only when the feature is switched off here, never on a failure. The client stops
    // asking once it sees it. A flag rather than the message text, so the client is not
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

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}

export async function POST(req: Request) {
  const disabled = documentIntelligenceDisabledReason();
  if (disabled) {
    console.log(`[DocAI] skipped: ${disabled}`);
    return NextResponse.json(withoutAnalysis(disabled, true));
  }

  let fileName = "";
  try {
    const body = await req.json().catch(() => null);
    const documentId = typeof body?.documentId === "string" ? body.documentId : "";
    const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
    if (!documentId || !submissionId) {
      return NextResponse.json({ error: "Missing documentId or submissionId" }, { status: 400 });
    }

    const found = await findUploadedDocument(documentId);
    if (!found || found.submissionId !== submissionId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const row = found.row;
    fileName = row.originalFileName || row.fileName || "document";

    // A remounted documents step asks again for files it has already shown a verdict on.
    // The stored one is the answer: re-running would cost a second call and could disagree
    // with what the customer was already told.
    if (body?.reuse === true && row.aiAnalysis) {
      return NextResponse.json({ success: true, analysis: row.aiAnalysis, reused: true });
    }

    if (!row.driveItemId) {
      return NextResponse.json(withoutAnalysis("The file is not linked to SharePoint"));
    }

    const extension = (row.fileName.split(".").pop() || "").toLowerCase();
    const mimeType = BY_EXTENSION[extension] ?? "";
    if (!ACCEPTED.has(mimeType)) {
      // Not a failure of the AI: a Word or Excel file simply cannot be read by it. Section 38
      // treats it like any other unanalysable file — the customer classifies it by hand.
      return NextResponse.json(withoutAnalysis(`Unsupported file type: .${extension || "?"}`));
    }

    const token = await getAccessToken();
    const data = await downloadDriveItem(row.driveItemId, token);
    if (data.length === 0) {
      return NextResponse.json(withoutAnalysis("The file is empty"));
    }
    if (data.length > MAX_BYTES) {
      return NextResponse.json(
        withoutAnalysis(`The file is larger than ${MAX_BYTES / (1024 * 1024)} MB`)
      );
    }

    const visibleDocKeys = stringArray(body?.visibleDocKeys);
    const borrowers = (Array.isArray(body?.borrowers) ? body.borrowers : [])
      .filter((b: any) => b && typeof b === "object" && typeof b.id === "string")
      .map((b: any) => ({ id: String(b.id), name: String(b.name ?? "") }));
    const expectedFunnelKey =
      typeof body?.expectedDocKey === "string" && body.expectedDocKey ? body.expectedDocKey : null;

    const analysis = await analyseDocument({
      fileName,
      mimeType,
      data,
      visibleFunnelKeys: visibleDocKeys,
      expectedFunnelKey,
      borrowers,
      documentId,
    });

    // Section 37: the log records that a document was processed and how it was classified.
    // Never its contents, and never an extracted value — those are the sensitive part.
    console.log(
      `[DocAI] ${fileName} -> ${analysis.classification.type} ` +
        `(${Math.round(analysis.classification.confidence * 100)}%), status=${analysis.status}, ` +
        `${Object.keys(analysis.fields).length} field(s), ${analysis.audit.durationMs}ms`
    );

    // Never fatal: the analysis is computed and is returned either way.
    try {
      await storeAnalysis(found.table, documentId, {
        status: analysis.status,
        docType: analysis.classification.type,
        confidence: analysis.classification.confidence,
        raw: analysis,
      });
    } catch (storeErr) {
      console.error("[DocAI] Could not store the analysis:", storeErr);
    }

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Document analysis failed";
    console.error(`[DocAI] Analysis failed for ${fileName || "(unknown file)"}:`, message);
    // Deliberately 200 (section 38): the client shows a manual document-type picker.
    return NextResponse.json(withoutAnalysis(message));
  }
}
