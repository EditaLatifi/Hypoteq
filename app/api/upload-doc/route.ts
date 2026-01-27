import { NextResponse } from "next/server";
import "dotenv/config";

/* ============================
   GET ACCESS TOKEN
============================ */
async function getAccessToken() {
  const tenantId = process.env.SHAREPOINT_TENANT_ID!;
  const clientId = process.env.SHAREPOINT_CLIENT_ID!;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );

  const json = await res.json();

  if (!json.access_token) {
    console.error("❌ Token Error:", json);
    throw new Error("Could not get SharePoint token");
  }

  return json.access_token;
}

/* ============================
   CREATE FOLDER WITH EMAIL_DATE_TIME
============================ */
async function createFolderWithTimestamp(email: string, token: string) {
  const DRIVE_ID = process.env.DRIVE_ID!;
  const ROOT_FOLDER_ID = process.env.FOLDER_ID!;

  // Create folder name: Email_Date_Time (e.g., user@example.com_2026-01-27_15-30-45)
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // 2026-01-27
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // 15-30-45
  const folderName = `${email}_${date}_${time}`;

  console.log("📁 Creating new folder:", folderName);

  const createRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ROOT_FOLDER_ID}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    }
  );

  const createJson = await createRes.json();

  if (!createRes.ok) {
    console.error("❌ Folder creation failed:", createJson);
    throw new Error("Failed to create folder");
  }

  console.log("✅ Folder created:", folderName);
  return createJson.id;
}

/* ============================
         UPLOAD FILE
============================ */
export async function POST(req: Request) {
  try {
    console.log("📥 Received upload request");

    const form = await req.formData();
    const file = form.get("file") as File;
    const email = form.get("email") as string;
    const inquiryId = form.get("inquiryId") as string;

    if (!file || !email || !inquiryId) {
      return NextResponse.json(
        { error: "Missing file, email or inquiryId" },
        { status: 400 }
      );
    }

    const token = await getAccessToken();

    // �️ Create folder with Email_Date_Time format
    const folderId = await createFolderWithTimestamp(email, token);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const DRIVE_ID = process.env.DRIVE_ID!;

    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${file.name}:/content`;

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

    return NextResponse.json({ success: true, data: uploadJson });
  } catch (err: any) {
    console.error("💥 SERVER ERROR:", err.message);
    return NextResponse.json(
      { error: "Server error", details: err.message },
      { status: 500 }
    );
  }
}
