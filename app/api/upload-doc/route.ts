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
   GET OR CREATE FOLDER FOR THIS SUBMISSION
============================ */
async function getOrCreateSubmissionFolder(email: string, inquiryId: string, token: string) {
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error("Valid email is required for document upload.");
  }
  const DRIVE_ID = process.env.DRIVE_ID!;
  const ROOT_FOLDER_ID = process.env.FOLDER_ID!;

  // Create folder name pattern: Email_Date_InquiryID (e.g., user@example.com_27-01-2026_abc123)
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${day}-${month}-${year}`;
  
  // Use first 8 chars of inquiryId to match folder naming (SharePoint length limit)
  const shortInquiryId = inquiryId.substring(0, 8);
  const folderPrefix = `${email}_${dateStr}_${shortInquiryId}`;

  console.log("🔍 Looking for existing folder with prefix:", folderPrefix);

  // List folders in root to find existing one for this submission
  try {
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ROOT_FOLDER_ID}/children`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const listJson = await listRes.json();

    if (listRes.ok && listJson.value) {
      // Find folder that matches this submission's inquiryId (first 8 chars)
      const existingFolder = listJson.value.find((item: any) => 
        item.folder && item.name.includes(shortInquiryId)
      );

      if (existingFolder) {
        console.log("♻️ Found existing folder for this submission:", existingFolder.name);
        return existingFolder.id;
      } else {
        console.log("🔍 No matching folder found for inquiryId:", shortInquiryId);
      }
    }
  } catch (err) {
    console.log("❌ Error listing folders:", err);
  }

  // Create new folder with timestamp for this submission
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const folderName = `${email}_${dateStr}_${time}_${inquiryId.substring(0, 8)}`;

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
    const inquiryId = form.get("inquiryId") as string | undefined;
    const tempUserId = form.get("tempUserId") as string | undefined;
    const existingFolderId = form.get("folderId") as string | null;

    console.log("📋 Upload params - email:", email, "inquiryId:", inquiryId, "tempUserId:", tempUserId);

    if (!file || !email) {
      return NextResponse.json(
        { error: "Missing file or email" },
        { status: 400 }
      );
    }

    const token = await getAccessToken();

    // Use inquiryId if present, otherwise fallback to tempUserId for folder naming
    const folderKey = inquiryId || tempUserId || "temp";
    const folderId = await getOrCreateSubmissionFolder(email, folderKey, token);

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

    // === SAVE DOCUMENT TO DATABASE ===
    try {
      const { prisma } = await import("@/lib/prisma");
      if (inquiryId) {
        // Try to associate with inquiry if it exists
        const inquiryExists = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
        if (inquiryExists) {
          await prisma.document.create({
            data: {
              inquiryId,
              email,
              fileName: file.name,
              fileUrl: uploadJson['@microsoft.graph.downloadUrl'] || uploadJson.webUrl || '',
            },
          });
          console.log("✅ Document saved to DB:", file.name);
        } else {
          // Save to holding table if inquiry does not exist
          await prisma.holdingDocument.create({
            data: {
              email,
              fileName: file.name,
              fileUrl: uploadJson['@microsoft.graph.downloadUrl'] || uploadJson.webUrl || '',
              tempUserId: tempUserId || null,
            },
          });
          console.log("✅ Document saved to HoldingDocument (inquiry not found):", file.name);
        }
      } else {
        // No inquiryId, always save to holding table
        await prisma.holdingDocument.create({
          data: {
            email,
            fileName: file.name,
            fileUrl: uploadJson['@microsoft.graph.downloadUrl'] || uploadJson.webUrl || '',
            tempUserId: tempUserId || null,
          },
        });
        console.log("✅ Document saved to HoldingDocument (no inquiryId):", file.name);
      }
    } catch (dbErr) {
      console.error("❌ Failed to save document to DB or HoldingDocument:", dbErr);
      let errorMsg = 'Failed to save document to DB or HoldingDocument';
      if (dbErr instanceof Error) errorMsg = dbErr.message;
      return NextResponse.json({ error: "Failed to save document", details: errorMsg }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: uploadJson, folderId });
  } catch (err: any) {
    let errorMsg = 'Unknown server error';
    if (err instanceof Error) errorMsg = err.message;
    console.error("💥 SERVER ERROR:", errorMsg);
    return NextResponse.json(
      { error: "Server error", details: errorMsg },
      { status: 500 }
    );
  }
}
