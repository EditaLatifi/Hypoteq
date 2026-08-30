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
