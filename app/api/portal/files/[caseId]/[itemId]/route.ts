import { NextResponse } from "next/server";
import { audit } from "@/lib/portal/audit";
import { caseFolder, releasedDownloadUrl } from "@/lib/portal/files";
import { getPartnerCase } from "@/lib/portal/salesforce";
import { readSession, requestIp } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download a released document: only the partner of the Case, only from its release folder. */
export async function GET(_req: Request, { params }: { params: { caseId: string; itemId: string } }) {
  const s = await readSession();
  if (s.state !== "ok" || !s.user.contactId) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const c = await getPartnerCase(s.user.contactId, params.caseId);
  const folderId = c ? await caseFolder(c.id, { create: false }) : null;
  const file = folderId ? await releasedDownloadUrl(folderId, params.itemId) : null;
  if (!c || !file) {
    await audit({ action: "access_denied", actorId: s.user.id, actorEmail: s.user.email, target: `Download ${params.caseId.slice(0, 20)}`, ip: requestIp() });
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  await audit({ action: "document_downloaded", actorId: s.user.id, actorEmail: s.user.email, target: `${c.nr} · ${file.name}`, ip: requestIp() });
  return NextResponse.redirect(file.url, 302);
}
