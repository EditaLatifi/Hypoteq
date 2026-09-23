import { NextResponse } from "next/server";
import { audit } from "@/lib/portal/audit";
import { caseFileDownloadUrl, caseFilePreviewUrl, caseFolder } from "@/lib/portal/files";
import { getPartnerCase } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import { readSession, requestIp } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open a file of a Case's dossier: only the partner of the Case, only files in its
 * SharePoint folder or release folder.
 *   ?mode=preview  -> { url } of an embeddable viewer (PDF, images, Office)
 *   (default)      -> redirect to a short-lived download URL
 */
export async function GET(req: Request, { params }: { params: { caseId: string; itemId: string } }) {
  const s = await readSession();
  if (s.state !== "ok" || !s.user.contactId) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const preview = new URL(req.url).searchParams.get("mode") === "preview";

  const scope = await scopeFor(s.user);
  const c = scope ? await getPartnerCase(scope, params.caseId) : null;
  const folderId = c ? await caseFolder(c.id, { create: false }) : null;
  const file = folderId ? await (preview ? caseFilePreviewUrl : caseFileDownloadUrl)(folderId, params.itemId) : null;
  if (!c || !file) {
    await audit({ action: "access_denied", actorId: s.user.id, actorEmail: s.user.email, target: `Datei ${params.caseId.slice(0, 20)}`, ip: requestIp() });
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  await audit({
    action: preview ? "document_viewed" : "document_downloaded",
    actorId: s.user.id,
    actorEmail: s.user.email,
    target: `${c.nr} · ${file.name}${s.user.viewingAs ? " (Partneransicht)" : ""}`,
    ip: requestIp(),
  });
  if (preview) return NextResponse.json({ url: file.url, name: file.name }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.redirect(file.url, 302);
}
