import { NextResponse } from "next/server";
import { persistDocumentRecord } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const email = typeof body?.email === "string" ? body.email : "";
    const inquiryId =
      typeof body?.inquiryId === "string" && body.inquiryId ? body.inquiryId : undefined;
    const tempUserId =
      typeof body?.tempUserId === "string" && body.tempUserId ? body.tempUserId : undefined;
    // Which requirement this file answers, and the submission it belongs to. Without the
    // latter the row cannot be claimed once the Inquiry is created, which is how every
    // upload ended up orphaned in HoldingDocument.
    const docType = typeof body?.docType === "string" && body.docType ? body.docType : null;
    const submissionId =
      typeof body?.submissionId === "string" && body.submissionId ? body.submissionId : null;
    const originalFileName =
      typeof body?.originalFileName === "string" && body.originalFileName
        ? body.originalFileName
        : null;
    // The analysis the funnel already ran when the customer picked this file. Sent with
    // the upload so the model is called once per document rather than once per lifecycle
    // stage, and so the audit row is written in the same request that creates it.
    const rawAnalysis = body?.analysis && typeof body.analysis === "object" ? body.analysis : null;
    const analysis = rawAnalysis
      ? {
          status: String(rawAnalysis.status ?? "failed"),
          docType:
            typeof rawAnalysis?.classification?.type === "string"
              ? rawAnalysis.classification.type
              : null,
          confidence:
            typeof rawAnalysis?.classification?.confidence === "number"
              ? rawAnalysis.classification.confidence
              : null,
          raw: rawAnalysis,
        }
      : null;
    const driveItem = body?.driveItem || null;

    if (!fileName || !email) {
      return NextResponse.json(
        { error: "Missing fileName or email" },
        { status: 400 }
      );
    }

    const fileUrl =
      driveItem?.["@microsoft.graph.downloadUrl"] || driveItem?.webUrl || "";

    try {
      await persistDocumentRecord({
        email,
        fileName,
        fileUrl,
        inquiryId,
        tempUserId,
        docType,
        submissionId: submissionId || inquiryId || null,
        originalFileName,
        analysis,
      });
    } catch (dbErr) {
      console.error("❌ Failed to save document record:", dbErr);
      const details = dbErr instanceof Error ? dbErr.message : "DB save failed";
      return NextResponse.json(
        { error: "Failed to save document", details },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: driveItem,
      fileUrl,
    });
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : "Unknown server error";
    console.error("💥 upload-doc/finalize error:", errorMsg);
    return NextResponse.json(
      { error: "Failed to finalize upload", details: errorMsg },
      { status: 500 }
    );
  }
}
