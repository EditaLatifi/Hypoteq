import { NextResponse } from "next/server";
import { getDict } from "@/lib/portal/i18n/server";
import { readSession } from "@/lib/portal/session";
import { SPECIAL_MAX_FILES, fileProblem } from "@/lib/portal/special";
import { listSpecialFiles, specialFolder, startSpecialUpload } from "@/lib/portal/specialFiles";
import { draftForUpload } from "@/lib/portal/specialServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Start one upload of the Spezialfinanzierung wizard (step 4). Like the Case upload, the
 * file goes from the browser straight to SharePoint; this checks the request and hands out
 * an upload session into the request's own folder. The first upload creates the draft
 * request the files belong to (lib/portal/specialServer.ts).
 */
export async function POST(req: Request) {
  const { t } = await getDict();
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: t.errors.generic }, { status: 401 });
  const user = s.user;
  if (user.viewingAs || !user.contactId) return NextResponse.json({ error: t.special.readOnly }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const fileName = String(body?.fileName || "");
  const size = Number(body?.size) || 0;
  const problem = fileProblem(fileName, size);
  if (problem) return NextResponse.json({ error: problem === "type" ? t.special.err.uploadType : t.special.err.uploadSize }, { status: 400 });

  let draftId: string | undefined;
  try {
    const draft = await draftForUpload({ ...user, contactId: user.contactId }, { requestId: body?.requestId, type: body?.type, kunde: body?.kunde });
    if (!draft) return NextResponse.json({ error: t.special.err.upload }, { status: 404 });
    // Handed back even when this upload fails, so the next one goes into the same draft.
    draftId = draft.id;
    const folder = await specialFolder(draft, user.email, { create: true });
    if (!folder) throw new Error("special financing folder missing after create");
    const present = await listSpecialFiles(folder.id);
    if (present.length >= SPECIAL_MAX_FILES) {
      return NextResponse.json({ error: t.special.tooMany(SPECIAL_MAX_FILES), requestId: draft.id }, { status: 409 });
    }
    const uploadUrl = await startSpecialUpload(folder.id, fileName);
    return NextResponse.json({ requestId: draft.id, uploadUrl });
  } catch (err) {
    console.error("[portal] special financing upload start failed", err);
    return NextResponse.json({ error: t.special.err.upload, requestId: draftId }, { status: 502 });
  }
}
