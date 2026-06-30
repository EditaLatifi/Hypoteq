export async function getAccessToken(): Promise<string> {
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

  return json.access_token as string;
}

export async function getOrCreateSubmissionFolder(
  email: string,
  inquiryId: string,
  token: string
): Promise<string> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error("Valid email is required for document upload.");
  }
  const DRIVE_ID = process.env.DRIVE_ID!;
  const ROOT_FOLDER_ID = process.env.FOLDER_ID!;

  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  const shortInquiryId = inquiryId.substring(0, 8);
  const folderPrefix = `${email}_${dateStr}_${shortInquiryId}`;

  console.log("🔍 Looking for existing folder with prefix:", folderPrefix);

  try {
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ROOT_FOLDER_ID}/children`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const listJson = await listRes.json();

    if (listRes.ok && listJson.value) {
      const existingFolder = listJson.value.find(
        (item: any) => item.folder && item.name.includes(shortInquiryId)
      );

      if (existingFolder) {
        console.log("♻️ Found existing folder for this submission:", existingFolder.name);
        return existingFolder.id;
      }
      console.log("🔍 No matching folder found for inquiryId:", shortInquiryId);
    }
  } catch (err) {
    console.log("❌ Error listing folders:", err);
  }

  const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
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
  return createJson.id as string;
}

export async function createUploadSession(
  folderId: string,
  fileName: string,
  token: string
): Promise<string> {
  const DRIVE_ID = process.env.DRIVE_ID!;
  const encodedName = encodeURIComponent(fileName);
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${encodedName}:/createUploadSession`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      item: {
        "@microsoft.graph.conflictBehavior": "rename",
        name: fileName,
      },
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.uploadUrl) {
    console.error("❌ createUploadSession failed:", json);
    throw new Error(json?.error?.message || "Failed to create upload session");
  }

  return json.uploadUrl as string;
}

export async function persistDocumentRecord(params: {
  email: string;
  fileName: string;
  fileUrl: string;
  inquiryId?: string;
  tempUserId?: string;
}): Promise<void> {
  const { email, fileName, fileUrl, inquiryId, tempUserId } = params;
  const { prisma } = await import("@/lib/prisma");

  if (inquiryId) {
    const inquiryExists = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
    if (inquiryExists) {
      await prisma.document.create({
        data: { inquiryId, email, fileName, fileUrl },
      });
      console.log("✅ Document saved to DB:", fileName);
      return;
    }
  }

  await prisma.holdingDocument.create({
    data: {
      email,
      fileName,
      fileUrl,
      tempUserId: tempUserId || null,
    },
  });
  console.log("✅ Document saved to HoldingDocument:", fileName);
}
