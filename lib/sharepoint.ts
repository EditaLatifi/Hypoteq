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

  // Deterministic name per (email, date, submission): all documents of one
  // submission resolve to the exact same folder no matter how many upload
  // requests run — no timestamp, so there is nothing to make the name diverge.
  const shortInquiryId = inquiryId.substring(0, 8);
  const folderName = `${email}_${dateStr}_${shortInquiryId}`;
  const encodedFolder = encodeURIComponent(folderName);

  // Address the child directly by path (no children listing / pagination): one
  // request, returns 404 when it does not exist yet.
  const lookupByPath = async (): Promise<string | null> => {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ROOT_FOLDER_ID}:/${encodedFolder}`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const item = await res.json();
      if (item?.id) return item.id as string;
    }
    return null;
  };

  console.log("🔍 Looking for existing folder:", folderName);
  const existingId = await lookupByPath();
  if (existingId) {
    console.log("♻️ Found existing folder for this submission:", folderName);
    return existingId;
  }

  // Create with conflictBehavior "fail" so a concurrent create can never spawn a
  // duplicate ("… 1") folder — the loser gets a 409 and re-fetches the winner.
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
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    }
  );

  if (createRes.ok) {
    const createJson = await createRes.json();
    console.log("✅ Folder created:", folderName);
    return createJson.id as string;
  }

  // Name already taken (created concurrently) → resolve to the existing folder.
  const raced = await lookupByPath();
  if (raced) {
    console.log("♻️ Folder created concurrently, reusing:", folderName);
    return raced;
  }

  const createJson = await createRes.json().catch(() => null);
  console.error("❌ Folder creation failed:", createJson);
  throw new Error("Failed to create folder");
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
