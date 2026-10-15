import { NextResponse } from "next/server";
import { getDict } from "@/lib/portal/i18n/server";
import { readSession } from "@/lib/portal/session";
import { removeSpecialFile, specialFolder } from "@/lib/portal/specialFiles";
import { ownDraft } from "@/lib/portal/specialServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** «Entfernen» of an uploaded file, before submit: only files of the partner's own draft. */
export async function POST(req: Request) {
  const { t } = await getDict();
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: t.errors.generic }, { status: 401 });
  const user = s.user;
  if (user.viewingAs || !user.contactId) return NextResponse.json({ error: t.special.readOnly }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  try {
    const draft = await ownDraft(user.id, String(body?.requestId || ""));
    const folder = draft ? await specialFolder(draft, user.email, { create: false }) : null;
    if (!folder) return NextResponse.json({ error: t.errors.generic }, { status: 404 });
    const removed = await removeSpecialFile(folder.id, String(body?.itemId || ""));
    return NextResponse.json({ ok: removed });
  } catch (err) {
    console.error("[portal] special financing file removal failed", err);
    return NextResponse.json({ error: t.errors.generic }, { status: 502 });
  }
}
