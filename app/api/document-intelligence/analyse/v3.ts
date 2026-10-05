import type { V3Analysis } from "@/lib/funnel-v3/files";
import { analyseDocumentV3, failedV3Analysis } from "@/components/documentIntelligence/v3/analyse";
import { documentIntelligenceDisabledReason } from "@/components/documentIntelligence/enabled";
import {
  downloadDriveItem,
  findUploadedDocument,
  getAccessToken,
  sha256Hex,
  storeAnalysis,
  storeContentHash,
} from "@/lib/sharepoint";
import { ACCEPTED_MIME, MAX_ANALYSE_BYTES, mimeTypeFor } from "./fileTypes";

/**
 * Funnel v3 mode of /api/document-intelligence/analyse.
 *
 * Request  { documentId, submissionId, v3: true, reuse? }
 * Response { success, analysis: V3Analysis, reused?, disabled?, error? }
 *
 * The answer does not depend on the customer's answers: the route says what the document is;
 * the browser places it on the list (lib/funnel-v3/placeFile.ts), because the list changes with
 * every answer and a file has to move with it without a second model call.
 *
 * Stored on the row as `aiAnalysis = { v3: V3Analysis, audit }`, with aiStatus / aiDocType /
 * aiConfidence filled for the existing columns. Failures are HTTP 200 with
 * `analysis.status = "failed"` (the file becomes «Nicht erkannt» and can be assigned by hand);
 * only a malformed request is a 4xx.
 */

type Out = [body: unknown, init?: { status: number }];

function failed(message: string, contentHash: string | null = null, disabled = false): Out {
  return [{ success: false, error: message, disabled, analysis: failedV3Analysis(contentHash) }];
}

/** aiStatus for the existing column, from the v3 verdict. */
function statusFor(a: V3Analysis): string {
  if (a.status === "failed") return "failed";
  if (!a.docTypeId) return "unsupported";
  if (a.outdated) return "outdated";
  const shaky = a.confidence < 0.9 || Object.values(a.fields).some((f) => f.confidence < 0.9);
  return shaky ? "review_required" : "classified";
}

const rowHash = (row: unknown): string | null => {
  const h = (row as { contentHash?: unknown } | null)?.contentHash;
  return typeof h === "string" && h ? h : null;
};

export async function analyseV3(body: any): Promise<Out> {
  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  if (!documentId || !submissionId) return [{ error: "Missing documentId or submissionId" }, { status: 400 }];

  const disabled = documentIntelligenceDisabledReason();
  if (disabled) {
    console.log(`[DocAI v3] skipped: ${disabled}`);
    return failed(disabled, null, true);
  }

  let fileName = "";
  try {
    const found = await findUploadedDocument(documentId);
    if (!found || found.submissionId !== submissionId) return [{ error: "Document not found" }, { status: 404 }];
    const row = found.row;
    fileName = row.originalFileName || row.fileName || "document";
    let contentHash = rowHash(row);

    // A remounted step asks again: the stored verdict is the answer (no second model call,
    // no second opinion that could contradict what the customer was shown).
    const stored = (row.aiAnalysis as { v3?: V3Analysis } | null)?.v3;
    if (body?.reuse === true && stored && stored.status === "done") {
      return [{ success: true, analysis: { ...stored, contentHash: contentHash ?? stored.contentHash ?? null }, reused: true }];
    }

    if (!row.driveItemId) return failed("The file is not linked to SharePoint", contentHash);
    const { extension, mimeType } = mimeTypeFor(row.fileName);
    if (!ACCEPTED_MIME.has(mimeType)) return failed(`Unsupported file type: .${extension || "?"}`, contentHash);

    const token = await getAccessToken();
    const data = await downloadDriveItem(row.driveItemId, token);
    if (data.length === 0) return failed("The file is empty", contentHash);

    // Finalize hashes the file; a row from before that (or whose hashing failed) gets it here,
    // from the bytes that are in memory anyway.
    if (!contentHash) {
      contentHash = sha256Hex(data);
      await storeContentHash(found.table, documentId, contentHash);
    }
    if (data.length > MAX_ANALYSE_BYTES) {
      return failed(`The file is larger than ${MAX_ANALYSE_BYTES / (1024 * 1024)} MB`, contentHash);
    }

    const { analysis, audit } = await analyseDocumentV3({ fileName, mimeType, data, contentHash });

    // Log what was done, never what the document says.
    console.log(
      `[DocAI v3] ${fileName} -> ${analysis.docTypeId ?? "unknown"} (${Math.round(analysis.confidence * 100)}%), ` +
        `${Object.keys(analysis.fields).length} field(s), outdated=${Boolean(analysis.outdated)}, ${audit.durationMs}ms`
    );

    const result = {
      status: statusFor(analysis),
      docType: analysis.docTypeId,
      confidence: analysis.confidence,
      raw: { v3: analysis, audit },
    };
    // Never fatal. The row may have been adopted by the Inquiry meanwhile (same id): look again.
    try {
      await storeAnalysis(found.table, documentId, result);
    } catch {
      try {
        const moved = await findUploadedDocument(documentId);
        if (moved) await storeAnalysis(moved.table, documentId, result);
        else console.warn(`[DocAI v3] Row ${documentId} is gone; analysis not stored`);
      } catch (storeErr) {
        console.error("[DocAI v3] Could not store the analysis:", storeErr);
      }
    }

    return [{ success: true, analysis }];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document analysis failed";
    console.error(`[DocAI v3] Analysis failed for ${fileName || "(unknown file)"}:`, message);
    return failed(message);
  }
}
