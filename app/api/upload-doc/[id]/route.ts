import { NextResponse } from "next/server";
import { removeHeldDocument } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Take back a file before the funnel is submitted.
 *
 * Files upload the moment they are picked, so removing or replacing one in the documents step
 * has to remove it from SharePoint too — otherwise the dossier would hold every file the
 * customer ever tried. Only files of a submission that has not been sent yet can be removed,
 * and only with that submission's id.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    const submissionId = new URL(req.url).searchParams.get("submissionId") || "";
    if (!id || !submissionId) {
      return NextResponse.json({ error: "Missing id or submissionId" }, { status: 400 });
    }
    const result = await removeHeldDocument(id, submissionId);
    // Already gone is the outcome the caller wanted, so it is not an error.
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("💥 upload-doc delete error:", message);
    return NextResponse.json({ error: "Failed to remove document", details: message }, { status: 500 });
  }
}
