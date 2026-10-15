import { prisma } from "@/lib/prisma";
import { sniffImage } from "@/lib/portal/images";
import type { Tone } from "@/lib/portal/status";
import { getAccessToken, getDriveItem } from "@/lib/sharepoint";

/**
 * «Eigene Dokumente» (handoff 4 «Profil»): company documents of a partner —
 * Handelsregisterauszug, Registereintrag, Verträge — with a status HYPOTEQ sets.
 *
 * They belong to the partner company (Salesforce Account), like the logo: every user of
 * the company sees them. The files live in SharePoint, in one folder per Account inside
 * PARTNER_FOLDER_NAME (or the folder PORTAL_PARTNER_FOLDER_ID points at); the portal keeps
 * a PortalPartnerDocument row per file, and that row — not the folder — decides who may
 * open it. Upload goes from the browser straight to SharePoint, as for Case documents.
 */

export const PARTNER_DOC_KINDS = ["handelsregister", "registereintrag", "vertrag", "zertifikat", "andere"] as const;
export type PartnerDocKind = (typeof PARTNER_DOC_KINDS)[number];

export function isPartnerDocKind(v: unknown): v is PartnerDocKind {
  return typeof v === "string" && (PARTNER_DOC_KINDS as readonly string[]).includes(v);
}

/** German labels for SharePoint file names and the team mail. The row stores the kind. */
export const PARTNER_DOC_KIND_DE: Record<PartnerDocKind, string> = {
  handelsregister: "Handelsregisterauszug",
  registereintrag: "Registereintrag",
  vertrag: "Vertrag",
  zertifikat: "Zertifikat",
  andere: "Firmendokument",
};

export const PARTNER_DOC_STATUSES = ["in_pruefung", "gueltig", "abgelaufen", "ungueltig"] as const;
export type PartnerDocStatus = (typeof PARTNER_DOC_STATUSES)[number];

export function isPartnerDocStatus(v: unknown): v is PartnerDocStatus {
  return typeof v === "string" && (PARTNER_DOC_STATUSES as readonly string[]).includes(v);
}

export const PARTNER_DOC_STATUS_TONE: Record<PartnerDocStatus, Tone> = {
  in_pruefung: "info",
  gueltig: "success",
  abgelaufen: "warning",
  ungueltig: "danger",
};

export const PARTNER_DOC_STATUS_DE: Record<PartnerDocStatus, string> = {
  in_pruefung: "In Prüfung",
  gueltig: "Gültig",
  abgelaufen: "Abgelaufen",
  ungueltig: "Ungültig",
};

export const PARTNER_DOC_MAX_BYTES = 20 * 1024 * 1024;
export const PARTNER_DOC_EXT = ["pdf", "jpg", "jpeg", "png"];

export function partnerDocExtOk(fileName: string): boolean {
  return PARTNER_DOC_EXT.includes(/\.([A-Za-z0-9]+)$/.exec(fileName)?.[1].toLowerCase() || "");
}

/** What the file really is, from its first bytes: PDF, PNG or JPEG, or null. */
export function sniffDocument(head: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  // Acrobat accepts the header anywhere in the first KB; some generators put bytes before it.
  const start = Array.from(head.subarray(0, 1024), (b) => String.fromCharCode(b)).join("");
  if (start.includes("%PDF-")) return "application/pdf";
  const img = sniffImage(head.subarray(0, 64));
  return img === "image/png" || img === "image/jpeg" ? img : null;
}

/**
 * Whether a viewer may open a company document: HYPOTEQ admins always (they review them),
 * a partner only those of their own company.
 */
export function canOpenPartnerDocument(doc: { accountId: string | null }, viewer: { isAdmin: boolean; accountId: string | null }): boolean {
  if (viewer.isAdmin) return true;
  return !!doc.accountId && !!viewer.accountId && doc.accountId === viewer.accountId;
}

export async function listPartnerDocuments(accountId: string) {
  return prisma.portalPartnerDocument.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 200 });
}

// ---------------------------------------------------------------------------
// SharePoint
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Inside FOLDER_ID (the site's document root) unless PORTAL_PARTNER_FOLDER_ID names another folder. */
export const PARTNER_FOLDER_NAME = "Partnerportal Partnerunterlagen";

function drive(): string {
  const id = process.env.DRIVE_ID;
  if (!id) throw new Error("DRIVE_ID is not configured");
  return id;
}

async function childByName(parentId: string, name: string, token: string): Promise<string | null> {
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${parentId}:/${encodeURIComponent(name)}?$select=id,folder`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph ${res.status} looking up folder`);
  const item = await res.json();
  return item?.folder && item.id ? String(item.id) : null;
}

/**
 * A subfolder, created when missing. Created with conflictBehavior "fail", so two uploads
 * at the same moment cannot produce «… 1»: the loser gets a 409 and reads the winner's.
 */
async function ensureChild(parentId: string, name: string, token: string): Promise<string> {
  const existing = await childByName(parentId, name, token);
  if (existing) return existing;
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${parentId}/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    cache: "no-store",
  });
  if (res.ok) return String((await res.json()).id);
  const raced = await childByName(parentId, name, token);
  if (raced) return raced;
  throw new Error(`Graph ${res.status} creating folder ${name}`);
}

/**
 * The partner company's folder. Named after the Salesforce Account Id: the company name
 * can change in Salesforce, and two users of a company may hold different spellings of it.
 */
export async function partnerFolder(accountId: string, token: string, opts: { create: boolean }): Promise<string | null> {
  if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(accountId)) throw new Error("Invalid account id");
  const configured = process.env.PORTAL_PARTNER_FOLDER_ID;
  let container: string | null;
  if (configured) container = configured;
  else {
    const root = process.env.FOLDER_ID;
    if (!root) throw new Error("FOLDER_ID is not configured");
    container = opts.create ? await ensureChild(root, PARTNER_FOLDER_NAME, token) : await childByName(root, PARTNER_FOLDER_NAME, token);
  }
  if (!container) return null;
  return opts.create ? ensureChild(container, accountId, token) : childByName(container, accountId, token);
}

/** The uploaded item, only if the browser really put it into this company's folder. */
export async function verifyPartnerUpload(accountId: string, itemId: string, token: string) {
  if (!/^[A-Za-z0-9!_-]{8,200}$/.test(itemId)) return null;
  const folderId = await partnerFolder(accountId, token, { create: false });
  if (!folderId) return null;
  const item = await getDriveItem(itemId, token);
  return item && item.parentId === folderId ? item : null;
}

/** The first `bytes` bytes of a file, to check what it really is. */
export async function readFileHead(itemId: string, token: string, bytes = 1024): Promise<Uint8Array> {
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${encodeURIComponent(itemId)}/content`, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${bytes - 1}` },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Graph ${res.status} reading file`);
  // A server that ignores Range sends everything: read only as far as needed.
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer()).subarray(0, bytes);
  const out = new Uint8Array(bytes);
  let filled = 0;
  while (filled < bytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const take = Math.min(value.length, bytes - filled);
    out.set(value.subarray(0, take), filled);
    filled += take;
  }
  await reader.cancel().catch(() => {});
  return out.subarray(0, filled);
}

/** Short-lived download URL of a stored company document. */
export async function partnerDocDownloadUrl(driveItemId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9!_-]{8,200}$/.test(driveItemId)) return null;
  const token = await getAccessToken();
  // No $select: Graph only returns @microsoft.graph.downloadUrl on the full item.
  const res = await fetch(`${GRAPH}/drives/${drive()}/items/${driveItemId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const item = await res.json();
  return item?.["@microsoft.graph.downloadUrl"] || null;
}
