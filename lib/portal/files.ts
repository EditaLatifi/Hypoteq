import { prisma } from "@/lib/prisma";
import { getAccessToken, getOrCreateSubmissionFolder } from "@/lib/sharepoint";

/**
 * SharePoint side of the portal: the Case's document folder (the same one the funnel and
 * the Nachreichung use), partner uploads into it, and the "Freigegeben" subfolder whose
 * files HYPOTEQ releases to the partner.
 *
 * Release process for HYPOTEQ: put a file into the subfolder named RELEASED_FOLDER inside
 * the Case's SharePoint folder, and it appears under "Freigegebene Dokumente" in the portal.
 */

export const RELEASED_FOLDER = "Freigegeben";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];

const GRAPH = "https://graph.microsoft.com/v1.0";

function drive(): string {
  const id = process.env.DRIVE_ID;
  if (!id) throw new Error("DRIVE_ID is not configured");
  return id;
}

/**
 * The Case's folder. Funnel Cases already have one (Inquiry.sharepointFolderId); for Cases
 * created in Salesforce directly, one is created on first upload and remembered.
 */
export async function caseFolder(caseId: string, opts: { create: false }): Promise<string | null>;
export async function caseFolder(caseId: string, opts: { create: true; email: string; contactId: string; token: string }): Promise<string>;
export async function caseFolder(
  caseId: string,
  opts: { create: boolean; email?: string; contactId?: string; token?: string }
): Promise<string | null> {
  const inquiry = await prisma.inquiry.findFirst({
    where: { salesforceCaseId: caseId },
    orderBy: { createdAt: "desc" },
    select: { id: true, sharepointFolderId: true, client: { select: { email: true } } },
  });
  if (inquiry?.sharepointFolderId) return inquiry.sharepointFolderId;

  const state = await prisma.portalCaseState.findUnique({ where: { caseId } });
  if (state?.folderId) return state.folderId;
  if (!opts.create) return null;

  const folderId = await getOrCreateSubmissionFolder(inquiry?.client?.email || opts.email!, `case-${caseId}`, opts.token!);
  if (inquiry) {
    await prisma.inquiry.update({ where: { id: inquiry.id }, data: { sharepointFolderId: folderId } });
  } else {
    await prisma.portalCaseState.upsert({
      where: { caseId },
      create: { caseId, contactId: opts.contactId!, status: "Neue Anfrage", folderId },
      update: { folderId },
    });
  }
  return folderId;
}

export type DriveFile = { id: string; name: string; size: number; modified: string };

export async function listReleasedFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${folderId}:/${RELEASED_FOLDER}:/children?$select=id,name,size,lastModifiedDateTime,file`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Graph ${res.status} listing released files`);
  const json = await res.json();
  return (json.value || [])
    .filter((i: any) => i.file)
    .map((i: any) => ({ id: i.id, name: i.name, size: i.size, modified: i.lastModifiedDateTime }))
    .sort((a: DriveFile, b: DriveFile) => b.modified.localeCompare(a.modified));
}

async function getItem(itemId: string, token: string): Promise<any | null> {
  if (!/^[A-Za-z0-9!_-]{8,200}$/.test(itemId)) return null;
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${itemId}?$select=id,name,size,webUrl,parentReference,file,@microsoft.graph.downloadUrl`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return res.ok ? res.json() : null;
}

/** Short-lived download URL of a released file, only if it sits in this Case's release folder. */
export async function releasedDownloadUrl(folderId: string, itemId: string): Promise<{ url: string; name: string } | null> {
  const token = await getAccessToken();
  const [item, released] = await Promise.all([
    getItem(itemId, token),
    fetch(`${GRAPH}/drives/${drive()}/items/${folderId}:/${RELEASED_FOLDER}?$select=id`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((r) =>
      r.ok ? r.json() : null
    ),
  ]);
  if (!item || !released || item.parentReference?.id !== released.id) return null;
  const url = item["@microsoft.graph.downloadUrl"];
  return url ? { url, name: item.name } : null;
}

/** The uploaded item, only if the browser really put it into this Case's folder. */
export async function verifyUploadedItem(folderId: string, itemId: string): Promise<{ id: string; name: string; webUrl: string | null } | null> {
  const token = await getAccessToken();
  const item = await getItem(itemId, token);
  if (!item || item.parentReference?.id !== folderId || !item.file) return null;
  return { id: item.id, name: item.name, webUrl: item.webUrl || null };
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 150) || "Dokument";
}
