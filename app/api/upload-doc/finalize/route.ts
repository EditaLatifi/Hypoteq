import { NextResponse } from "next/server";
import {
  getAccessToken,
  getDriveItem,
  hashDriveItem,
  persistDocumentRecord,
  storeContentHash,
} from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Larger files are not hashed here (the 30 s budget); the analyse route refuses them anyway. */
const MAX_HASH_BYTES = 50 * 1024 * 1024;

/**
 * Record a file the browser has just finished uploading to SharePoint.
 *
 * The browser only reports WHICH item it uploaded; name, size and link are read back from
 * SharePoint here, so the stored row always describes the file that is actually there (a
 * name clash is renamed on upload, and the browser's idea of the name would then be wrong).
 *
 * Returns the row id. Everything after this — analysis, removal, the customer's decisions at
 * submit — refers to the file by that id.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const inquiryId =
      typeof body?.inquiryId === "string" && body.inquiryId ? body.inquiryId : undefined;
    const submissionId =
      typeof body?.submissionId === "string" && body.submissionId ? body.submissionId : null;
    const docType = typeof body?.docType === "string" && body.docType ? body.docType : null;
    const originalFileName =
      typeof body?.originalFileName === "string" && body.originalFileName
        ? body.originalFileName
        : null;
    // `driveItem.id` is what the last chunk's response carries; accepted as well so a
    // browser still running the previous bundle during a deploy is not stranded.
    const driveItemId =
      typeof body?.driveItemId === "string" && body.driveItemId
        ? body.driveItemId
        : typeof body?.driveItem?.id === "string"
          ? body.driveItem.id
          : "";
    const folderId = typeof body?.folderId === "string" && body.folderId ? body.folderId : null;

    if (!driveItemId || !email || (!submissionId && !inquiryId)) {
      return NextResponse.json(
        { error: "Missing driveItemId, email or submissionId" },
        { status: 400 }
      );
    }

    const token = await getAccessToken();
    const item = await getDriveItem(driveItemId, token);
    if (!item) {
      return NextResponse.json({ error: "Uploaded file not found in SharePoint" }, { status: 404 });
    }
    // The file must sit in the folder this submission's upload session was opened in.
    if (folderId && item.parentId && item.parentId !== folderId) {
      return NextResponse.json({ error: "File is not in this submission's folder" }, { status: 400 });
    }

    const record = await persistDocumentRecord({
      email,
      fileName: item.name,
      // The permanent SharePoint link. The pre-signed download URL Graph also returns
      // expires within the hour and is useless to anyone opening the dossier later.
      fileUrl: item.webUrl,
      inquiryId,
      docType,
      submissionId: submissionId || inquiryId || null,
      originalFileName,
      driveItemId: item.id,
    });

    // Content hash for duplicate detection (Funnel v3, spec 4.3). Computed from the file as
    // SharePoint holds it, streamed — see hashDriveItem for why not from the browser. Never
    // fatal: a file without a hash is only exempt from duplicate detection, and the analyse
    // route fills the hash in from the bytes it reads anyway.
    let contentHash: string | null = null;
    if (item.size > 0 && item.size <= MAX_HASH_BYTES) {
      try {
        contentHash = await hashDriveItem(item.id, token);
        await storeContentHash(record.table, record.id, contentHash);
      } catch (err) {
        console.warn(
          `upload-doc/finalize: no content hash for ${record.id}:`,
          err instanceof Error ? err.message : err
        );
        contentHash = null;
      }
    }

    return NextResponse.json({
      success: true,
      documentId: record.id,
      fileName: item.name,
      webUrl: item.webUrl,
      size: item.size,
      contentHash,
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
