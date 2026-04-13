import { NextResponse } from "next/server";
import {
  getAccessToken,
  getOrCreateSubmissionFolder,
  persistDocumentRecord,
} from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    console.log("📥 Received upload request (legacy single-shot path)");

    const form = await req.formData();
    const file = form.get("file") as File;
    const email = form.get("email") as string;
    const inquiryId = (form.get("inquiryId") as string | null) || undefined;
    const tempUserId = (form.get("tempUserId") as string | null) || undefined;

    console.log(
      "📋 Upload params - email:",
      email,
      "inquiryId:",
      inquiryId,
      "tempUserId:",
      tempUserId
    );

    if (!file || !email) {
      return NextResponse.json(
        { error: "Missing file or email" },
        { status: 400 }
      );
    }

    const token = await getAccessToken();

    const folderKey = inquiryId || tempUserId || "temp";
    const folderId = await getOrCreateSubmissionFolder(email, folderKey, token);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const DRIVE_ID = process.env.DRIVE_ID!;
    const encodedName = encodeURIComponent(file.name);
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${encodedName}:/content`;

    console.log("⬆ Uploading file:", file.name);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer as any,
    });

    const uploadJson = await uploadRes.json();

    if (!uploadRes.ok) {
      console.error("❌ Upload failed:", uploadJson);
      return NextResponse.json(uploadJson, { status: 500 });
    }

    console.log("✅ Successfully uploaded:", file.name);

    try {
      await persistDocumentRecord({
        email,
        fileName: file.name,
        fileUrl:
          uploadJson["@microsoft.graph.downloadUrl"] || uploadJson.webUrl || "",
        inquiryId,
        tempUserId,
      });
    } catch (dbErr) {
      console.error("❌ Failed to save document record:", dbErr);
      const details = dbErr instanceof Error ? dbErr.message : "DB save failed";
      return NextResponse.json(
        { error: "Failed to save document", details },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: uploadJson, folderId });
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : "Unknown server error";
    console.error("💥 SERVER ERROR:", errorMsg);
    return NextResponse.json(
      { error: "Server error", details: errorMsg },
      { status: 500 }
    );
  }
}
