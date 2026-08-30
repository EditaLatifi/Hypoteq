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

/**
 * Record an uploaded file.
 *
 * Two destinations, and the holding one is the normal case rather than the exception: the
 * documents step pushes files to SharePoint before the funnel is submitted, so on a first
 * submission there is no Inquiry to attach to yet. Those rows carry `submissionId` and are
 * claimed by /api/inquiry the moment the Inquiry is created (see adoptHoldingDocuments).
 *
 * A Nachreichung is the other case: its Inquiry already exists, so the row lands straight
 * on Document.
 */
export async function persistDocumentRecord(params: {
  email: string;
  fileName: string;
  fileUrl: string;
  inquiryId?: string;
  tempUserId?: string;
  /** Funnel document key this file was supplied for; null for a loose upload. */
  docType?: string | null;
  /** Ties the row to its submission so it can be adopted once the Inquiry exists. */
  submissionId?: string | null;
  /** Name the file had when the customer picked it. */
  originalFileName?: string | null;
  /**
   * Analysis computed when the customer picked the file, carried through the upload.
   *
   * Passed in rather than run here so the model sees each document exactly once: the
   * funnel analyses on selection to show a result immediately (section 31), and re-running
   * it at upload time would double the cost and could return a different answer for a file
   * the customer has already been shown a verdict on.
   */
  analysis?: { status: string; docType: string | null; confidence: number | null; raw: unknown } | null;
}): Promise<void> {
  const { email, fileName, fileUrl, inquiryId, tempUserId } = params;
  const docType = params.docType || null;
  const submissionId = params.submissionId || inquiryId || null;
  const originalFileName = params.originalFileName || fileName;
  const ai = params.analysis
    ? {
        aiStatus: params.analysis.status,
        aiDocType: params.analysis.docType,
        aiConfidence: params.analysis.confidence,
        aiAnalysis: params.analysis.raw as any,
      }
    : {};
  const { prisma } = await import("@/lib/prisma");

  if (inquiryId) {
    const inquiryExists = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
    if (inquiryExists) {
      await prisma.document.create({
        data: { inquiryId, email, fileName, fileUrl, docType, originalFileName, ...ai },
      });
      console.log(`✅ Document saved to DB: ${fileName} (${docType || "loose upload"})`);
      return;
    }
  }

  await prisma.holdingDocument.create({
    data: {
      email,
      fileName,
      fileUrl,
      tempUserId: tempUserId || null,
      submissionId,
      docType,
      originalFileName,
      ...ai,
    },
  });
  console.log(
    `✅ Document held for submission ${submissionId || "(none)"}: ${fileName} (${docType || "loose upload"})`
  );
}

/**
 * Claim the files uploaded for a submission once its Inquiry exists.
 *
 * Called right after the Inquiry is created. Deliberately forgiving — a lead that cannot
 * adopt its documents is still a lead, and the files are already safe in SharePoint — so
 * failures are reported and swallowed by the caller rather than failing the submission.
 *
 * Returns how many rows were adopted.
 */
export async function adoptHoldingDocuments(
  inquiryId: string,
  submissionId: string
): Promise<number> {
  if (!submissionId) return 0;
  const { prisma } = await import("@/lib/prisma");

  const held = await prisma.holdingDocument.findMany({ where: { submissionId } });
  if (held.length === 0) return 0;

  await prisma.document.createMany({
    data: held.map((h) => ({
      inquiryId,
      email: h.email,
      fileName: h.fileName,
      fileUrl: h.fileUrl,
      docType: h.docType,
      originalFileName: h.originalFileName || h.fileName,
      // The analysis was made at upload time, before this Inquiry existed. Carrying it
      // across is the whole point of holding it — re-running the model on adoption would
      // cost a second call and could return a different answer for the same file.
      aiStatus: h.aiStatus,
      aiDocType: h.aiDocType,
      aiConfidence: h.aiConfidence,
      aiAnalysis: h.aiAnalysis ?? undefined,
      uploadedAt: h.uploadedAt,
    })),
  });

  // Only delete what was actually copied. Re-running is then a no-op rather than a
  // duplicate, and a crash between the two statements leaves the rows claimable again.
  await prisma.holdingDocument.deleteMany({ where: { id: { in: held.map((h) => h.id) } } });

  return held.length;
}

/**
 * Attach an analysis to the row that already holds the file (spec sections 27 and 36).
 *
 * Looks in both places because a file is analysed at upload time: on a first submission the
 * row is still in HoldingDocument, while a Nachreichung analyses a file whose Inquiry
 * already exists and whose row is therefore on Document.
 *
 * Matching is by (submission, filename) because that is all the client knows at this point —
 * the row id is never sent to the browser. The newest row wins if a customer uploads the
 * same filename twice, which is also the one they just analysed.
 */
export async function attachAnalysis(params: {
  submissionId: string;
  fileName: string;
  status: string;
  docType: string | null;
  confidence: number | null;
  analysis: unknown;
}): Promise<"document" | "holding" | "not_found"> {
  const { prisma } = await import("@/lib/prisma");
  const data = {
    aiStatus: params.status,
    aiDocType: params.docType,
    aiConfidence: params.confidence,
    aiAnalysis: params.analysis as any,
  };

  const held = await prisma.holdingDocument.findFirst({
    where: { submissionId: params.submissionId, fileName: params.fileName },
    orderBy: { uploadedAt: "desc" },
  });
  if (held) {
    await prisma.holdingDocument.update({ where: { id: held.id }, data });
    return "holding";
  }

  const doc = await prisma.document.findFirst({
    where: { inquiryId: params.submissionId, fileName: params.fileName },
    orderBy: { uploadedAt: "desc" },
  });
  if (doc) {
    await prisma.document.update({ where: { id: doc.id }, data });
    return "document";
  }

  // Not an error: analysis can legitimately run before the upload row is written, and the
  // funnel must not fail over bookkeeping. The caller logs it.
  return "not_found";
}
