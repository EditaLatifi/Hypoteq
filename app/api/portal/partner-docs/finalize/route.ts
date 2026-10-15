import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { getDict } from "@/lib/portal/i18n/server";
import { sendTeamMail } from "@/lib/portal/mail";
import { PARTNER_DOC_KIND_DE, isPartnerDocKind, partnerDocExtOk, readFileHead, sniffDocument, verifyPartnerUpload } from "@/lib/portal/partnerDocuments";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { readSession, requestIp, requestOrigin } from "@/lib/portal/session";
import { deleteDriveItem, getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Record a finished company-document upload. Nothing from the browser is trusted: the
 * item must be in this company's SharePoint folder, and its first bytes must really be a
 * PDF, PNG or JPEG — anything else is deleted again. Then the row is written (status «In
 * Prüfung») and the HYPOTEQ team is told.
 */
export async function POST(req: Request) {
  const { t } = await getDict();
  const tx = t.profileExtra.docs;
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const user = s.user;
  if (user.viewingAs) return NextResponse.json({ error: t.errors.readOnly }, { status: 403 });
  const accountId = user.sfAccountId;
  if (!isSalesforceId(accountId)) return NextResponse.json({ error: tx.noAccount }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind;
  const itemId = String(body?.itemId || "");
  if (!isPartnerDocKind(kind)) return NextResponse.json({ error: t.errors.generic }, { status: 400 });

  let item;
  let token: string;
  try {
    token = await getAccessToken();
    item = await verifyPartnerUpload(accountId, itemId, token);
  } catch (err) {
    console.error("[portal] partner document verify failed", err);
    return NextResponse.json({ error: tx.failed }, { status: 502 });
  }
  if (!item) return NextResponse.json({ error: tx.failed }, { status: 400 });

  // The type by its bytes, not by its name.
  let real: string | null = null;
  try {
    real = partnerDocExtOk(item.name) ? sniffDocument(await readFileHead(item.id, token)) : null;
  } catch (err) {
    console.error("[portal] reading the uploaded document failed", err);
    return NextResponse.json({ error: tx.failed }, { status: 502 });
  }
  if (!real) {
    await deleteDriveItem(item.id, token).catch((err) => console.error("[portal] could not delete refused upload", err));
    return NextResponse.json({ error: tx.badType }, { status: 400 });
  }

  const doc = await prisma.portalPartnerDocument.create({
    data: { userId: user.id, accountId, name: kind, fileName: item.name.slice(0, 300), driveItemId: item.id, webUrl: item.webUrl || null },
  });
  await audit({ action: "partner_document_uploaded", actorId: user.id, actorEmail: user.email, target: `${user.company || accountId} · ${PARTNER_DOC_KIND_DE[kind]}`, ip: requestIp() });

  const origin = requestOrigin();
  try {
    await sendTeamMail({
      to: null,
      subject: `Partnerportal: Firmendokument von ${user.company || user.name || user.email}`,
      lines: [
        `${user.name || user.email}${user.company ? ` (${user.company})` : ""} hat ein Firmendokument hochgeladen.`,
        `Art: ${PARTNER_DOC_KIND_DE[kind]}`,
        `Datei: ${item.name}`,
        `Salesforce Account: ${accountId}`,
        `Bitte prüfen und den Status setzen: ${origin}/portal/admin/aenderungen`,
      ],
      origin,
      link: item.webUrl || undefined,
    });
  } catch (err) {
    console.error("[portal] team mail about partner document failed", err);
  }

  revalidatePath("/portal/profil");
  return NextResponse.json({ ok: true, id: doc.id });
}
