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
   FIND OR CREATE EMAIL FOLDER
============================ */
async function getOrCreateFolder(email: string, token: string) {
  const DRIVE_ID = process.env.DRIVE_ID!;
  const ROOT_FOLDER_ID = process.env.FOLDER_ID!;

  // 1️⃣ List all folders under ROOT_FOLDER_ID
  const listRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ROOT_FOLDER_ID}/children`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const listJson = await listRes.json();

  // 2️⃣ Check if EXACT matching folder name = email exists
  const existing = listJson.value?.find(
    (item: any) =>
      item.folder && item.name.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    console.log("📁 Existing email folder found:", existing.id);
    return existing.id;
  }

  // 3️⃣ Create new folder if not found
  console.log("📁 Creating new email folder:", email);

  const createRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ROOT_FOLDER_ID}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: email,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    }
  );

  const createJson = await createRes.json();

  if (!createRes.ok) {
    console.error("❌ Folder creation failed:", createJson);
    throw new Error("Failed to create folder");
  }

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

    // 🔍 Get or create folder by EMAIL
    const folderId = await getOrCreateFolder(email, token);

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
      body: buffer,
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
