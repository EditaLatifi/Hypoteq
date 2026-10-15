import { NextResponse } from "next/server";
import { audit } from "@/lib/portal/audit";
import { getDict } from "@/lib/portal/i18n/server";
import { readSession, requestIp } from "@/lib/portal/session";
import { specialRef } from "@/lib/portal/special";
import { checkSpecialItem, specialFolder } from "@/lib/portal/specialFiles";
import { ownDraft } from "@/lib/portal/specialServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Confirm a finished upload. Nothing from the browser is trusted: the draft must be the
 * partner's, the item must sit in its folder, and type and size are checked again on what
 * SharePoint reports (a refused file is deleted). The submit later takes only files that
 * pass the same folder check.
 */
export async function POST(req: Request) {
  const { t } = await getDict();
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: t.errors.generic }, { status: 401 });
  const user = s.user;
  if (user.viewingAs || !user.contactId) return NextResponse.json({ error: t.special.readOnly }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const requestId = String(body?.requestId || "");
  const itemId = String(body?.itemId || "");

  try {
    const draft = await ownDraft(user.id, requestId);
    const folder = draft ? await specialFolder(draft, user.email, { create: false }) : null;
    if (!draft || !folder) return NextResponse.json({ error: t.special.err.upload }, { status: 404 });
    const check = await checkSpecialItem(folder.id, itemId);
    if (!check.ok) {
      const error = check.reason === "type" ? t.special.err.uploadType : check.reason === "size" ? t.special.err.uploadSize : t.special.err.upload;
      return NextResponse.json({ error }, { status: 400 });
    }
    await audit({ action: "document_uploaded", actorId: user.id, actorEmail: user.email, target: `Spezialfinanzierung ${specialRef(draft.id)} (Entwurf)`, ip: requestIp() });
    return NextResponse.json({ file: { itemId: check.file.driveItemId, name: check.file.fileName, size: check.file.size } });
  } catch (err) {
    console.error("[portal] special financing upload finalize failed", err);
    return NextResponse.json({ error: t.special.err.upload }, { status: 502 });
  }
}
