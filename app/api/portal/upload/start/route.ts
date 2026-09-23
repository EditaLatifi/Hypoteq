import { NextResponse } from "next/server";
import { ALLOWED_EXT, MAX_UPLOAD_BYTES, caseFolder, safeFileName } from "@/lib/portal/files";
import { getPartnerCase } from "@/lib/portal/salesforce";
import { readSession } from "@/lib/portal/session";
import { CLOSED_STATUSES } from "@/lib/portal/status";
import { createUploadSession, getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Start a partner upload. The file itself goes from the browser straight to SharePoint
 * (Vercel functions cannot take a 20 MB body), so this only checks the request and hands
 * out an upload session into the Case's folder.
 */
export async function POST(req: Request) {
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const user = s.user;
  if (user.viewingAs || !user.contactId) {
    return NextResponse.json({ error: "In der Partneransicht können keine Dokumente hochgeladen werden." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const caseId = String(body?.caseId || "");
  const docKey = typeof body?.docKey === "string" && body.docKey ? body.docKey : null;
  const fileName = String(body?.fileName || "");
  const size = Number(body?.size) || 0;

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXT.includes(ext)) return NextResponse.json({ error: "Erlaubt sind PDF, JPG, JPEG und PNG." }, { status: 400 });
  if (size <= 0 || size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Die Datei darf höchstens 20 MB gross sein." }, { status: 400 });

  const c = await getPartnerCase(user.contactId, caseId);
  if (!c) return NextResponse.json({ error: "Case nicht gefunden." }, { status: 404 });
  if (CLOSED_STATUSES.includes(c.status)) return NextResponse.json({ error: "Dieser Case ist abgeschlossen." }, { status: 409 });

  const doc = docKey ? c.documents.find((d) => d.key === docKey && d.state === "fehlt") : null;
  if (docKey && !doc) return NextResponse.json({ error: "Dieses Dokument wird nicht mehr benötigt." }, { status: 409 });
  const label = doc?.name || "Weiteres Dokument";

  try {
    const token = await getAccessToken();
    const folderId = await caseFolder(c.id, { create: true, email: user.email, contactId: user.contactId, token });
    const uploadUrl = await createUploadSession(folderId, `${safeFileName(label)} - ${safeFileName(fileName)}`, token);
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    console.error("[portal] upload start failed", err);
    return NextResponse.json({ error: "Der Upload konnte nicht gestartet werden. Bitte später erneut versuchen." }, { status: 502 });
  }
}
