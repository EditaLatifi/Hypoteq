import { isTestMode, TEST_FOLDER_PREFIX } from "@/components/testMode";

// One token per warm instance rather than one per request: every upload now makes several
// Graph calls (folder, session, verify, analysis read-back), and a token is valid for an hour.
// Refreshed five minutes early so a long upload never runs into an expired one.
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60_000) {
    return cachedToken.value;
  }
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

  cachedToken = {
    value: json.access_token as string,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
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
  // Uploading is the part most worth testing, so a test run still creates a real folder —
  // it just says so in the name, and sorts away from customer paperwork.
  const prefix = isTestMode() ? TEST_FOLDER_PREFIX : "";
  const folderName = `${prefix}${email}_${dateStr}_${shortInquiryId}`;
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

/** What Graph says about one uploaded file. */
export type DriveItemInfo = {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  mimeType: string | null;
  parentId: string | null;
};

/**
 * Look a file up by its driveItem id, or null when it does not exist.
 *
 * Used to confirm what the browser reports after an upload instead of trusting it: the
 * browser sends the id, the server reads name, size and link back from SharePoint itself.
 */
export async function getDriveItem(itemId: string, token: string): Promise<DriveItemInfo | null> {
  const DRIVE_ID = process.env.DRIVE_ID!;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,size,file,parentReference`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph item lookup failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const item = await res.json();
  return {
    id: item.id,
    name: item.name,
    webUrl: item.webUrl,
    size: Number(item.size ?? 0),
    mimeType: item.file?.mimeType ?? null,
    parentId: item.parentReference?.id ?? null,
  };
}

/** The file's bytes, read back from SharePoint so the browser never has to send them twice. */
export async function downloadDriveItem(itemId: string, token: string): Promise<Buffer> {
  const DRIVE_ID = process.env.DRIVE_ID!;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${encodeURIComponent(itemId)}/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }
  );
  if (!res.ok) {
    throw new Error(`Graph download failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Delete a file. Already gone counts as done. */
export async function deleteDriveItem(itemId: string, token: string): Promise<void> {
  const DRIVE_ID = process.env.DRIVE_ID!;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Graph delete failed (${res.status})`);
  }
}

/**
 * Record an uploaded file.
 *
 * Two destinations, and the holding one is the normal case: files upload the moment the
 * customer picks them, long before the funnel is submitted, so there is no Inquiry to attach
 * to yet. Those rows carry `submissionId` and are claimed by /api/inquiry when the Inquiry is
 * created (see adoptHoldingDocuments).
 *
 * A Nachreichung is the other case: its Inquiry already exists, so the row lands straight on
 * Document.
 *
 * Returns the row, because everything after the upload (analysis, removal, the customer's
 * decisions at submit) refers to the file by this id rather than by its name.
 */
export async function persistDocumentRecord(params: {
  email: string;
  fileName: string;
  fileUrl: string;
  inquiryId?: string;
  /** Funnel document key this file was supplied for; null for a loose upload. */
  docType?: string | null;
  /** Ties the row to its submission so it can be adopted once the Inquiry exists. */
  submissionId?: string | null;
  /** Name the file had when the customer picked it. */
  originalFileName?: string | null;
  /** SharePoint item, so the server can read the file back or delete it. */
  driveItemId?: string | null;
}): Promise<{ id: string; table: "document" | "holding" }> {
  const { email, fileName, fileUrl, inquiryId } = params;
  const docType = params.docType || null;
  const submissionId = params.submissionId || inquiryId || null;
  const originalFileName = params.originalFileName || fileName;
  const driveItemId = params.driveItemId || null;
  const { prisma } = await import("@/lib/prisma");

  if (inquiryId) {
    const inquiryExists = await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: { id: true } });
    if (inquiryExists) {
      const row = await prisma.document.create({
        data: { inquiryId, email, fileName, fileUrl, docType, originalFileName, driveItemId },
        select: { id: true },
      });
      console.log(`✅ Document saved to DB: ${fileName} (${docType || "loose upload"})`);
      return { id: row.id, table: "document" };
    }
  }

  const row = await prisma.holdingDocument.create({
    data: { email, fileName, fileUrl, submissionId, docType, originalFileName, driveItemId },
    select: { id: true },
  });
  console.log(
    `✅ Document held for submission ${submissionId || "(none)"}: ${fileName} (${docType || "loose upload"})`
  );
  return { id: row.id, table: "holding" };
}

/**
 * What the customer decided about one file on the documents step, sent with the submit.
 *
 * The machine's analysis is already on the row (stored by the analyse route); these are the
 * human half of the audit trail (spec section 36) and are merged beside it, never over it.
 */
export type ClientDocumentDetail = {
  documentId: string;
  /** The requirement the file ended up answering (may differ from the one it was picked for). */
  docType?: string | null;
  /** Mismatch decisions: took the document's value or kept their own. */
  humanReview?: unknown;
  /** Values corrected by hand in the detail view. */
  humanEdits?: unknown;
  /** Type chosen by the customer for a file the AI could not place. */
  manualClassification?: { type: string; label?: string } | null;
  /** Borrower the customer said the document belongs to. */
  personId?: string | null;
  /** The customer opened the extracted values and confirmed them. */
  confirmedByHuman?: boolean;
};

/**
 * The Document row a held upload becomes, with the customer's decisions merged in.
 *
 * Pure, so the merge can be tested without a database. The AI's analysis is kept intact;
 * the person's answers are added beside it, and a type chosen by hand keeps the machine's
 * verdict readable as `machineClassification`.
 */
export function adoptedDocumentData(
  h: {
    email: string;
    fileName: string;
    fileUrl: string;
    driveItemId: string | null;
    docType: string | null;
    originalFileName: string | null;
    aiStatus: string | null;
    aiDocType: string | null;
    aiConfidence: number | null;
    aiAnalysis: unknown;
    uploadedAt: Date;
    id: string;
  },
  inquiryId: string,
  d?: ClientDocumentDetail
) {
  const ai = (h.aiAnalysis && typeof h.aiAnalysis === "object" ? h.aiAnalysis : null) as any;
  const manual = d?.manualClassification?.type ? d.manualClassification : null;
  const human =
    d && (d.humanReview || d.humanEdits || manual || d.personId || d.confirmedByHuman)
      ? {
          ...(ai ?? {}),
          humanReview: d.humanReview ?? ai?.humanReview ?? [],
          humanEdits: d.humanEdits ?? ai?.humanEdits ?? {},
          ...(d.personId ? { personId: d.personId } : {}),
          ...(d.confirmedByHuman ? { confirmedByHuman: true } : {}),
          ...(manual
            ? {
                // The machine's verdict stays readable next to the person's.
                machineClassification: ai?.classification ?? null,
                classification: { type: manual.type, label: manual.label ?? manual.type, confidence: 1 },
                classifiedBy: "human",
              }
            : {}),
        }
      : ai;
  return {
    // The same id the documents step has been using. An analysis still running when the
    // Inquiry claims the file can then find it and store its result on the adopted row.
    id: h.id,
    inquiryId,
    email: h.email,
    fileName: h.fileName,
    fileUrl: h.fileUrl,
    driveItemId: h.driveItemId,
    docType: d && d.docType !== undefined ? d.docType || null : h.docType,
    originalFileName: h.originalFileName || h.fileName,
    aiStatus: manual || d?.confirmedByHuman ? "confirmed" : h.aiStatus,
    aiDocType: manual ? manual.type : h.aiDocType,
    aiConfidence: manual ? 1 : h.aiConfidence,
    aiAnalysis: human ?? undefined,
    uploadedAt: h.uploadedAt,
  };
}

/**
 * Claim the files uploaded for a submission once its Inquiry exists.
 *
 * Runs in one transaction: either every held row becomes a Document or none does, so a
 * failure part-way can neither duplicate rows nor strand some of them.
 *
 * Returns how many rows were adopted.
 */
export async function adoptHoldingDocuments(
  inquiryId: string,
  submissionId: string,
  details: ClientDocumentDetail[] = []
): Promise<number> {
  if (!submissionId) return 0;
  const { prisma } = await import("@/lib/prisma");
  const byId = new Map(details.filter((d) => d && typeof d.documentId === "string").map((d) => [d.documentId, d]));

  const { adopted, stale } = await prisma.$transaction(async (tx) => {
    const held = await tx.holdingDocument.findMany({ where: { submissionId } });
    if (held.length === 0) return { adopted: 0, stale: [] as typeof held };

    // The submit lists every file the customer still has. A held row it does not list was
    // removed or replaced on the page and only survived because its delete had not landed
    // yet. Claiming it would put a file the customer took back into the dossier. An older
    // client that sends no list at all keeps the previous behaviour: everything is claimed.
    const keep = byId.size > 0 ? held.filter((h) => byId.has(h.id)) : held;
    const drop = byId.size > 0 ? held.filter((h) => !byId.has(h.id)) : [];

    if (keep.length) {
      await tx.document.createMany({
        data: keep.map((h) => adoptedDocumentData(h, inquiryId, byId.get(h.id))),
      });
    }
    await tx.holdingDocument.deleteMany({ where: { id: { in: held.map((h) => h.id) } } });
    return { adopted: keep.length, stale: drop };
  });

  // Outside the transaction: a SharePoint call has no business holding database locks, and
  // a file that cannot be deleted is only an extra copy in the submission's own folder.
  if (stale.length) {
    try {
      const token = await getAccessToken();
      for (const h of stale) if (h.driveItemId) await deleteDriveItem(h.driveItemId, token);
    } catch (err) {
      console.warn("Could not delete files the customer removed before submitting:", err);
    }
  }
  return adopted;
}

/** An uploaded file's row, wherever it currently lives. */
export async function findUploadedDocument(id: string) {
  const { prisma } = await import("@/lib/prisma");
  const held = await prisma.holdingDocument.findUnique({ where: { id } });
  if (held) return { table: "holding" as const, row: held, submissionId: held.submissionId };
  const doc = await prisma.document.findUnique({ where: { id } });
  if (doc) return { table: "document" as const, row: doc, submissionId: doc.inquiryId };
  return null;
}

/** Store an analysis on the row it was made for (spec sections 27 and 36). */
export async function storeAnalysis(
  table: "holding" | "document",
  id: string,
  analysis: { status: string; docType: string | null; confidence: number | null; raw: unknown }
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const data = {
    aiStatus: analysis.status,
    aiDocType: analysis.docType,
    aiConfidence: analysis.confidence,
    aiAnalysis: analysis.raw as any,
  };
  if (table === "holding") await prisma.holdingDocument.update({ where: { id }, data });
  else await prisma.document.update({ where: { id }, data });
}

/**
 * Remove a file the customer took back before submitting: the SharePoint copy and its row.
 *
 * Only held rows qualify. Once a submission is in, its documents belong to the dossier and are
 * not the browser's to delete. The submission id must match as well, so a row id on its own is
 * not enough to remove someone else's file.
 */
export async function removeHeldDocument(
  id: string,
  submissionId: string
): Promise<"deleted" | "not_found"> {
  const { prisma } = await import("@/lib/prisma");
  const held = await prisma.holdingDocument.findUnique({ where: { id } });
  if (!held || held.submissionId !== submissionId) return "not_found";

  if (held.driveItemId) {
    const token = await getAccessToken();
    await deleteDriveItem(held.driveItemId, token);
  }
  await prisma.holdingDocument.delete({ where: { id } });
  return "deleted";
}
