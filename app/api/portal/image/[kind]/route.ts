import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { audit } from "@/lib/portal/audit";
import { getDict } from "@/lib/portal/i18n/server";
import { MAX_IMAGE_BYTES, imageResponseHeaders, isImageKind, loadImage, saveImage, validateImage, type ImageProblem } from "@/lib/portal/images";
import { isSalesforceId } from "@/lib/portal/salesforce";
import { readSession, requestIp } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portal/image/photo → the logged-in user's profile photo
 * GET /api/portal/image/logo  → the logo of the logged-in user's partner company
 *                               (the viewed partner's, while an admin views as a partner)
 *
 * 404 when there is none. Callers append `?v=<updatedAt ms>` (from imageMeta) so a new
 * image is a new URL.
 */
export async function GET(req: Request, { params }: { params: { kind: string } }) {
  if (!isImageKind(params.kind)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  let img;
  try {
    img = await loadImage(s.user, params.kind);
  } catch (err) {
    console.error("[portal] loading image failed", err);
    img = null;
  }
  if (!img) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-cache" } });

  const headers = imageResponseHeaders(img, new URL(req.url).searchParams.get("v"));
  if (req.headers.get("if-none-match") === headers.ETag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(img.data, { status: 200, headers });
}

/**
 * POST /api/portal/image/photo|logo (multipart, field "file") → { ok, v }
 *
 * A route rather than a server action: server actions take at most 1 MB, images up to 2 MB.
 * The photo is the user's own; the logo belongs to their partner company (Salesforce
 * Account), and any active user of that company may change it — the audit log says who.
 */
export async function POST(req: Request, { params }: { params: { kind: string } }) {
  if (!isImageKind(params.kind)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const kind = params.kind;
  const { t } = await getDict();
  const tx = t.profileExtra.image;
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const user = s.user;
  if (user.viewingAs) return NextResponse.json({ error: t.errors.readOnly }, { status: 403 });

  const ownerId = kind === "photo" ? user.id : isSalesforceId(user.sfAccountId) ? user.sfAccountId : null;
  if (!ownerId) return NextResponse.json({ error: t.profileExtra.logo.noAccount }, { status: 409 });

  // Refuse an oversized body before reading it (the multipart framing adds a little).
  if (Number(req.headers.get("content-length") || 0) > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: tx.tooLarge }, { status: 413 });
  }
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    file = null;
  }
  if (!file || typeof file === "string") return NextResponse.json({ error: tx.empty }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: tx.tooLarge }, { status: 413 });

  const checked = validateImage(kind, new Uint8Array(await file.arrayBuffer()));
  if (!checked.ok) {
    const text: Record<ImageProblem, string> = {
      empty: tx.empty,
      tooLarge: tx.tooLarge,
      type: kind === "photo" ? tx.typePhoto : tx.typeLogo,
      svg: tx.svg,
    };
    return NextResponse.json({ error: text[checked.problem] }, { status: 400 });
  }

  let saved;
  try {
    saved = await saveImage(kind, ownerId, checked.mime, checked.data);
  } catch (err) {
    console.error("[portal] saving image failed", err);
    return NextResponse.json({ error: tx.failed }, { status: 500 });
  }
  await audit({
    action: kind === "photo" ? "photo_updated" : "logo_updated",
    actorId: user.id,
    actorEmail: user.email,
    target: kind === "logo" ? `${user.company || "Partnerfirma"} · ${ownerId} · ${checked.mime}` : checked.mime,
    ip: requestIp(),
  });
  revalidatePath("/portal", "layout");
  return NextResponse.json({ ok: true, v: saved.updatedAt.getTime() }, { headers: { "Cache-Control": "no-store" } });
}
