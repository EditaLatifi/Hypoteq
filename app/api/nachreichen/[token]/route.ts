import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  rejectNachreich,
  parseMissingKeys,
  type NachreichLocale,
} from "@/components/nachreichung";
import { isRequiredDoc } from "@/components/funnelDocumentCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ===========================================================================
 * Nachreichung endpoint (spec V2).
 *
 * GET  — what is still missing for the submission behind this token.
 * POST — record which of those documents have now been supplied.
 *
 * The token is the only credential. It is unguessable and expiring (see
 * components/nachreichung.ts), but that also means this route must never echo back more
 * about the submission than the job needs: it returns the missing document keys and the
 * locale, and deliberately not the customer's name, address, financing figures or Case id.
 * Holding a leaked link should let someone upload documents, not read a dossier.
 * ======================================================================== */

const SELECT = {
  id: true,
  documentsComplete: true,
  documentsMissing: true,
  nachreichExpiresAt: true,
  nachreichCompletedAt: true,
  salesforceCaseId: true,
  sharepointFolderId: true,
  client: { select: { email: true, firstName: true, lastName: true } },
} as const;

function rejectionResponse(reason: string) {
  // 410 for a link that was valid once and no longer is, 404 for one that never existed.
  const status = reason === "not_found" ? 404 : 410;
  return NextResponse.json({ valid: false, reason }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const token = params?.token;
  if (!token) return rejectionResponse("not_found");

  const row = await prisma.inquiry.findUnique({
    where: { nachreichToken: token },
    select: SELECT,
  });

  const rejection = rejectNachreich(row, new Date());
  if (rejection) return rejectionResponse(rejection);

  // Only documents that are still required and still missing. A document the customer
  // already supplied must not reappear, and an optional one was never being asked for.
  const missing = parseMissingKeys(row!.documentsMissing).filter(isRequiredDoc);

  return NextResponse.json({
    valid: true,
    missing,
    expiresAt: row!.nachreichExpiresAt,
    // The upload endpoint keys folders by email; the page needs it to start an upload.
    email: row!.client?.email ?? null,
    folderId: row!.sharepointFolderId ?? null,
    submissionId: row!.id,
  });
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const token = params?.token;
  if (!token) return rejectionResponse("not_found");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const row = await prisma.inquiry.findUnique({
    where: { nachreichToken: token },
    select: SELECT,
  });

  const rejection = rejectNachreich(row, new Date());
  if (rejection) return rejectionResponse(rejection);

  const stillMissing = parseMissingKeys(row!.documentsMissing).filter(isRequiredDoc);

  // Trust the token, not the payload: a client may only claim documents this submission
  // was actually still waiting for. Anything else is dropped rather than rejected, so a
  // stale tab cannot fail an otherwise good upload.
  const claimed: string[] = Array.isArray(body?.providedKeys) ? body.providedKeys : [];
  const supplied = stillMissing.filter((k) => claimed.includes(k));
  const remaining = stillMissing.filter((k) => !supplied.includes(k));
  const nowComplete = remaining.length === 0;

  const uploadedFiles: Array<{ name?: string; url?: string }> = Array.isArray(body?.files)
    ? body.files
    : [];

  await prisma.inquiry.update({
    where: { id: row!.id },
    data: {
      documentsMissing: remaining.length ? remaining.join(",").slice(0, 4000) : null,
      documentsComplete: nowComplete,
      // The link dies the moment the dossier is whole; until then it stays usable so a
      // customer chasing three documents is not locked out after supplying the first.
      nachreichCompletedAt: nowComplete ? new Date() : null,
    },
  });

  // Record the files against the existing submission, which is what ties them to the Case.
  if (uploadedFiles.length && row!.client?.email) {
    for (const f of uploadedFiles) {
      if (!f?.name || !f?.url) continue;
      try {
        await prisma.document.create({
          data: {
            inquiryId: row!.id,
            email: row!.client.email,
            fileName: String(f.name).slice(0, 500),
            fileUrl: String(f.url).slice(0, 2000),
          },
        });
      } catch (e) {
        // A document row is bookkeeping; the file is already in SharePoint. Losing the
        // row must not fail the customer's upload.
        console.error("⚠️ Could not record supplied document:", e);
      }
    }
  }

  // Push the new verdict to the Case the original submission created.
  if (row!.salesforceCaseId) {
    try {
      const { updateCaseCompleteness } = await import("@/components/updateCaseCompleteness");
      await updateCaseCompleteness(row!.salesforceCaseId, {
        complete: nowComplete,
        missing: remaining,
        supplied,
        submissionId: row!.id,
      });
    } catch (e) {
      console.error("⚠️ Salesforce completeness update failed (continuing):", e);
    }
  }

  // Tell the customer where they now stand, in their own language.
  const locale = (["de", "fr", "it", "en"].includes(body?.locale) ? body.locale : "de") as NachreichLocale;
  if (row!.client?.email) {
    try {
      const { sendNachreichConfirmation } = await import("@/components/nachreichMail");
      await sendNachreichConfirmation({
        to: row!.client.email,
        name: `${row!.client.firstName || ""} ${row!.client.lastName || ""}`.trim(),
        locale,
        complete: nowComplete,
        remaining,
      });
    } catch (e) {
      console.error("⚠️ Nachreich confirmation mail failed (continuing):", e);
    }
  }

  console.log(
    `📥 Nachreichung for ${row!.id}: +${supplied.length} supplied, ${remaining.length} still missing`
  );

  return NextResponse.json({ ok: true, complete: nowComplete, remaining });
}
