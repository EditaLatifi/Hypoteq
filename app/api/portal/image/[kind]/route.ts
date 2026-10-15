import { NextResponse } from "next/server";
import { imageResponseHeaders, isImageKind, loadImage } from "@/lib/portal/images";
import { readSession } from "@/lib/portal/session";

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
