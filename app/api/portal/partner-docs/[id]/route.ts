import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { sessionAccountFor } from "@/lib/portal/images";
import { PARTNER_DOC_KIND_DE, canOpenPartnerDocument, isPartnerDocKind, partnerDocDownloadUrl } from "@/lib/portal/partnerDocuments";
import { readSession, requestIp } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download a company document: redirects to a short-lived SharePoint download URL. Only
 * users of the company the document belongs to (an admin viewing as that partner counts
 * as one) and HYPOTEQ admins; every download is logged.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const user = s.user;

  const doc = /^[0-9a-f-]{36}$/i.test(params.id) ? await prisma.portalPartnerDocument.findUnique({ where: { id: params.id } }) : null;
  const viewer = { isAdmin: user.role === "admin", accountId: await sessionAccountFor(user) };
  const url = doc && canOpenPartnerDocument(doc, viewer) ? await partnerDocDownloadUrl(doc.driveItemId) : null;
  if (!doc || !url) {
    await audit({ action: "access_denied", actorId: user.id, actorEmail: user.email, target: `Firmendokument ${params.id.slice(0, 40)}`, ip: requestIp() });
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  const label = isPartnerDocKind(doc.name) ? PARTNER_DOC_KIND_DE[doc.name] : doc.name;
  await audit({
    action: "document_downloaded",
    actorId: user.id,
    actorEmail: user.email,
    target: `Firmendokument · ${label} · ${doc.fileName}${user.viewingAs ? " (Partneransicht)" : ""}`,
    ip: requestIp(),
  });
  return NextResponse.redirect(url, 302);
}
