import { TEST_FOLDER_PREFIX, isTestMode } from "@/components/testMode";
import { safeFileName } from "@/lib/portal/files";
import { fileExt, fileProblem } from "@/lib/portal/special";
import { createUploadSession, deleteDriveItem, getAccessToken, getDriveItem } from "@/lib/sharepoint";

/**
 * SharePoint folder of a Spezialfinanzierung (DECISIONS P15).
 *
 * The wizard uploads each file the moment it is picked, like the funnel does — the browser
 * sends it straight to SharePoint, because a Vercel function cannot take 20 MB. There is
 * no Case yet at that point, so the files go into a folder of the request itself, in the
 * same root and naming scheme as the funnel's (`<email>_<dd-mm-yyyy>_…`). The name is
 * derived from the request (its creation day, not today), so every step finds the same
 * folder without storing its id. On submit the folder becomes the Case's folder.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export type SpecialFile = { fileName: string; driveItemId: string; webUrl: string | null; size: number };

function drive(): string {
  const id = process.env.DRIVE_ID;
  if (!id) throw new Error("DRIVE_ID is not configured");
  return id;
}

function root(): string {
  const id = process.env.FOLDER_ID;
  if (!id) throw new Error("FOLDER_ID is not configured");
  return id;
}

/** «anna@firma.ch_15-10-2026_spezial-3f9a1c2b» (with the test prefix in test mode). */
export function specialFolderName(email: string, createdAt: Date, requestId: string): string {
  const parts = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(createdAt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const date = `${get("day")}-${get("month")}-${get("year")}`;
  const prefix = isTestMode() ? TEST_FOLDER_PREFIX : "";
  // The address is shortened, never the suffix that makes the name unique.
  return `${safeFileName(`${prefix}${email}`).slice(0, 100)}_${date}_spezial-${requestId.replace(/-/g, "").slice(0, 8)}`;
}

/** The name the file gets in SharePoint: cleaned and shortened, but with its extension kept. */
export function uploadFileName(name: string): string {
  const ext = fileExt(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  return `${safeFileName(base).slice(0, 140)}${ext ? `.${ext}` : ""}`;
}

async function lookup(name: string, token: string): Promise<{ id: string; webUrl: string | null } | null> {
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${root()}:/${encodeURIComponent(name)}?$select=id,webUrl,folder`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph ${res.status} looking up the special financing folder`);
  const item = await res.json();
  return item?.id ? { id: item.id, webUrl: item.webUrl || null } : null;
}

/** The request's folder; created on the first upload when `create` is set. */
export async function specialFolder(
  req: { id: string; createdAt: Date },
  email: string,
  opts: { create: boolean }
): Promise<{ id: string; webUrl: string | null } | null> {
  const token = await getAccessToken();
  const name = specialFolderName(email, req.createdAt, req.id);
  const found = await lookup(name, token);
  if (found || !opts.create) return found;

  // conflictBehavior "fail": two uploads racing never make a second «… 1» folder.
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${root()}/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    cache: "no-store",
  });
  if (res.ok) {
    const item = await res.json();
    return { id: item.id, webUrl: item.webUrl || null };
  }
  const raced = await lookup(name, token);
  if (raced) return raced;
  throw new Error(`Graph ${res.status} creating the special financing folder`);
}

/** Upload session for the browser, straight into the request's folder. */
export async function startSpecialUpload(folderId: string, fileName: string): Promise<string> {
  const token = await getAccessToken();
  return createUploadSession(folderId, uploadFileName(fileName), token);
}

const ITEM_ID = /^[A-Za-z0-9!_-]{8,200}$/;

/**
 * Check what the browser says it uploaded: it must sit in this request's folder and pass
 * the same type and size rules as before the upload (now on SharePoint's own figures).
 * A file that fails is deleted again.
 */
export async function checkSpecialItem(
  folderId: string,
  itemId: string
): Promise<{ ok: true; file: SpecialFile } | { ok: false; reason: "missing" | "type" | "size" }> {
  if (!ITEM_ID.test(itemId)) return { ok: false, reason: "missing" };
  const token = await getAccessToken();
  const item = await getDriveItem(itemId, token);
  if (!item || item.parentId !== folderId) return { ok: false, reason: "missing" };
  const problem = fileProblem(item.name, item.size, item.mimeType);
  if (problem) {
    await deleteDriveItem(item.id, token).catch((err) => console.error("[portal] could not delete a refused upload", err));
    return { ok: false, reason: problem };
  }
  return { ok: true, file: { fileName: item.name, driveItemId: item.id, webUrl: item.webUrl || null, size: item.size } };
}

/** The files in the request's folder (not subfolders). */
export async function listSpecialFiles(folderId: string): Promise<SpecialFile[]> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${folderId}/children?$select=id,name,size,webUrl,file&$top=200`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Graph ${res.status} listing the special financing folder`);
  const json = await res.json();
  return (json.value || [])
    .filter((i: any) => i.file)
    .map((i: any) => ({ fileName: i.name, driveItemId: i.id, webUrl: i.webUrl || null, size: Number(i.size) || 0 }));
}

/** «Entfernen» before submit: only a file of this request's folder. */
export async function removeSpecialFile(folderId: string, itemId: string): Promise<boolean> {
  if (!ITEM_ID.test(itemId)) return false;
  const token = await getAccessToken();
  const item = await getDriveItem(itemId, token);
  if (!item || item.parentId !== folderId) return false;
  await deleteDriveItem(item.id, token);
  return true;
}
