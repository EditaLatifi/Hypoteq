import { NextResponse } from "next/server";
import { safeFileName } from "@/lib/portal/files";
import { getDict } from "@/lib/portal/i18n/server";
import { PARTNER_DOC_KIND_DE, PARTNER_DOC_MAX_BYTES, isPartnerDocKind, partnerDocExtOk, partnerFolder } from "@/lib/portal/partnerDocuments";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { readSession } from "@/lib/portal/session";
import { createUploadSession, getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Start uploading a company document («Eigene Dokumente»). As for Case documents, the
 * file goes from the browser straight to SharePoint; this only checks the request and
 * hands out an upload session into the partner company's folder.
 */
export async function POST(req: Request) {
  const { t } = await getDict();
  const tx = t.profileExtra.docs;
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const user = s.user;
  if (user.viewingAs) return NextResponse.json({ error: t.errors.readOnly }, { status: 403 });
  if (!isSalesforceId(user.sfAccountId)) return NextResponse.json({ error: tx.noAccount }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind;
  const fileName = String(body?.fileName || "");
  const size = Number(body?.size) || 0;
  if (!isPartnerDocKind(kind)) return NextResponse.json({ error: t.errors.generic }, { status: 400 });
  if (!partnerDocExtOk(fileName)) return NextResponse.json({ error: tx.badType }, { status: 400 });
  if (size <= 0 || size > PARTNER_DOC_MAX_BYTES) return NextResponse.json({ error: tx.tooLarge }, { status: 400 });

  try {
    const token = await getAccessToken();
    const folderId = (await partnerFolder(user.sfAccountId, token, { create: true }))!;
    const uploadUrl = await createUploadSession(folderId, `${PARTNER_DOC_KIND_DE[kind]} - ${safeFileName(fileName)}`, token);
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    console.error("[portal] partner document upload start failed", err);
    return NextResponse.json({ error: tx.failed }, { status: 502 });
  }
}
