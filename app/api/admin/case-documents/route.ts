import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * The internal view (spec section 35): everything the customer's screen deliberately hides.
 *
 * Section 34 keeps confidence numbers, raw extractions and model versions away from the
 * customer — but section 35 says HYPOTEQ staff need exactly those, plus what the AI said
 * before a human changed it. That is the audit trail from section 36, read back.
 *
 *   GET /api/admin/case-documents?inquiryId=<uuid>
 *   GET /api/admin/case-documents?email=<address>
 *   GET /api/admin/case-documents?needsReview=1     documents still waiting on a person
 *
 * Dev-only, like the other admin routes here: it returns extracted personal and financial
 * data, which section 37 puts behind access control. Serving it in production would need
 * real authentication first, and shipping it unauthenticated "temporarily" is how that
 * never happens.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Statuses that mean a person still has to look (sections 14 and 33). */
const AWAITING_HUMAN = ["review_required", "rejected", "outdated", "unsupported", "failed"];

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const url = new URL(req.url);
  const inquiryId = url.searchParams.get("inquiryId");
  const email = url.searchParams.get("email");
  const needsReview = url.searchParams.get("needsReview") === "1";

  if (!inquiryId && !email && !needsReview) {
    return NextResponse.json(
      { error: "Pass inquiryId, email, or needsReview=1" },
      { status: 400 }
    );
  }

  try {
    const where: any = {};
    if (inquiryId) where.inquiryId = inquiryId;
    if (email) where.email = email;
    if (needsReview) where.aiStatus = { in: AWAITING_HUMAN };

    const documents = await prisma.document.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take: 200,
    });

    const rows = documents.map((d) => {
      const analysis = (d.aiAnalysis as any) ?? null;
      const review = Array.isArray(analysis?.humanReview) ? analysis.humanReview : [];
      const editedKeys = Object.keys(analysis?.humanEdits ?? {});

      return {
        id: d.id,
        inquiryId: d.inquiryId,
        uploadedAt: d.uploadedAt,

        // Section 36: the name the customer's file had, alongside whatever it is called now.
        originalFileName: d.originalFileName,
        fileName: d.fileName,
        fileUrl: d.fileUrl,

        // What the funnel asked for, and what the model thought it was. Kept apart on
        // purpose — the difference between them is the wrong-document signal.
        requirement: d.docType,
        detectedType: d.aiDocType,
        status: d.aiStatus,
        confidence: d.aiConfidence,

        model: analysis?.audit?.model ?? null,
        provider: analysis?.audit?.provider ?? null,
        analysedAt: analysis?.audit?.analysedAt ?? null,
        durationMs: analysis?.audit?.durationMs ?? null,

        documentDate: analysis?.documentDate ?? null,
        mismatchedRequirement: analysis?.mismatchedRequirement ?? null,
        freshness: analysis?.freshness ?? null,

        // Per-field: what was read, how sure, and what a person made of it.
        fields: Object.entries(analysis?.fields ?? {}).map(([key, f]: [string, any]) => ({
          key,
          extracted: f?.value ?? null,
          unit: f?.unit ?? null,
          confidence: f?.confidence ?? null,
          correctedTo: analysis?.humanEdits?.[key] ?? null,
        })),

        // Section 14: the discrepancies put to the customer and how they answered.
        humanReview: review,
        correctedFieldCount: editedKeys.length,
      };
    });

    return NextResponse.json({
      count: rows.length,
      awaitingHuman: rows.filter((r) => r.status && AWAITING_HUMAN.includes(r.status)).length,
      // A document with no analysis at all is not "fine" — it is one nothing ran on, and it
      // reads as healthy in every per-status count. Named separately so it cannot hide.
      notAnalysed: rows.filter((r) => !r.status).length,
      documents: rows,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/case-documents] failed:", message);
    return NextResponse.json({ error: "Query failed", details: message }, { status: 500 });
  }
}
