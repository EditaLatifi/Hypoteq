import { dossierFileName } from "@/lib/funnel-v3/dossier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How long after the closing the funnel may download the stored dossier. The link is only
 * shown on the closing screen; after that the dossier is HYPOTEQ's (SharePoint, Salesforce).
 */
const DOSSIER_DOWNLOAD_DAYS = 7;

/**
 * Download the Fall-Dossier the closing stored in the case folder
 * (`{Fallnummer}_00_Fall-Dossier.pdf`, lib/funnel-v3/completion.ts).
 *
 *   GET /api/dossier/<inquiryId>?submissionId=<the funnel's submissionId>
 *
 * Guarded like the upload DELETE route: the submission id the browser holds must be passed
 * and must match the inquiry (an Inquiry's id IS its submission id). Every miss answers 404,
 * so the route does not tell which inquiries exist.
 */
export async function GET(req: Request, { params }: { params: { inquiryId: string } }) {
  const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
  try {
    const inquiryId = params?.inquiryId || "";
    const submissionId = new URL(req.url).searchParams.get("submissionId") || "";
    if (!UUID_RE.test(inquiryId) || submissionId.toLowerCase() !== inquiryId.toLowerCase()) return notFound();

    const { prisma } = await import("@/lib/prisma");
    const inquiry = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true, caseNumber: true, sharepointFolderId: true, createdAt: true },
    });
    if (!inquiry || !inquiry.sharepointFolderId) return notFound();
    if (Date.now() - new Date(inquiry.createdAt).getTime() > DOSSIER_DOWNLOAD_DAYS * 86_400_000) {
      return Response.json({ error: "Expired" }, { status: 410 });
    }

    const name = dossierFileName(inquiry.caseNumber ?? null);
    const { getAccessToken } = await import("@/lib/sharepoint");
    const token = await getAccessToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${process.env.DRIVE_ID}/items/${encodeURIComponent(inquiry.sharepointFolderId)}:/${encodeURIComponent(name)}:/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: "follow", signal: AbortSignal.timeout(25_000) }
    );
    if (res.status === 404) return notFound();
    if (!res.ok || !res.body) throw new Error(`Graph download failed (${res.status})`);

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[dossier] download failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not load the dossier" }, { status: 500 });
  }
}
