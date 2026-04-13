import { NextResponse } from "next/server";
import {
  getAccessToken,
  getOrCreateSubmissionFolder,
  createUploadSession,
} from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const email = typeof body?.email === "string" ? body.email : "";
    const inquiryId =
      typeof body?.inquiryId === "string" && body.inquiryId ? body.inquiryId : undefined;
    const tempUserId =
      typeof body?.tempUserId === "string" && body.tempUserId ? body.tempUserId : undefined;
    const existingFolderId =
      typeof body?.folderId === "string" && body.folderId ? body.folderId : null;

    if (!fileName || !email) {
      return NextResponse.json(
        { error: "Missing fileName or email" },
        { status: 400 }
      );
    }

    const token = await getAccessToken();

    const folderKey = inquiryId || tempUserId || "temp";
    const folderId =
      existingFolderId || (await getOrCreateSubmissionFolder(email, folderKey, token));

    const uploadUrl = await createUploadSession(folderId, fileName, token);

    return NextResponse.json({ uploadUrl, folderId });
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : "Unknown server error";
    console.error("💥 upload-doc/start error:", errorMsg);
    return NextResponse.json(
      { error: "Failed to start upload", details: errorMsg },
      { status: 500 }
    );
  }
}
