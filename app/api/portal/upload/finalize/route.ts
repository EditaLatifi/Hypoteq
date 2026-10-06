import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { caseFolder, verifyUploadedItem } from "@/lib/portal/files";
import { sendTeamMail } from "@/lib/portal/mail";
import { getPartnerCase } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import { readSession, requestIp, requestOrigin } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Record a finished upload. Nothing from the browser is trusted: the Case is re-checked
 * against the partner, and the item must really be in that Case's SharePoint folder.
 * Then the document leaves the outstanding list — locally and in Salesforce (Dok_*__c and
 * the Dokumenten-Check tab), exactly as a customer's Nachreichung does — and the HYPOTEQ
 * owner of the Case is told.
 */
export async function POST(req: Request) {
  const s = await readSession();
  if (s.state !== "ok") return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const user = s.user;
  if (user.viewingAs || !user.contactId) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const caseId = String(body?.caseId || "");
  const docKey = typeof body?.docKey === "string" && body.docKey ? body.docKey : null;
  const itemId = String(body?.itemId || "");

  const scope = await scopeFor(user);
  const c = scope ? await getPartnerCase(scope, caseId) : null;
  if (!c) return NextResponse.json({ error: "Case nicht gefunden." }, { status: 404 });
  const folderId = await caseFolder(c.id, { create: false });
  const item = folderId ? await verifyUploadedItem(folderId, itemId) : null;
  if (!item) return NextResponse.json({ error: "Die Datei wurde nicht gefunden." }, { status: 400 });

  const doc = docKey ? c.documents.find((d) => d.key === docKey && d.state !== "vorhanden") : null;
  const label = doc?.name || "Weiteres Dokument";

  await prisma.portalUpload.create({
    data: { userId: user.id, caseId: c.id, docKey: doc?.key ?? null, docLabel: label, fileName: item.name, driveItemId: item.id, webUrl: item.webUrl },
  });

  // What is still outstanding once this document counts.
  const outstanding = c.documents.filter((d) => d.state !== "vorhanden" && d.key && d.key !== doc?.key).map((d) => d.key!);

  const inquiry = await prisma.inquiry.findFirst({
    where: { salesforceCaseId: c.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, documentsMissing: true, client: { select: { email: true } } },
  });
  if (inquiry) {
    try {
      await prisma.document.create({
        data: { inquiryId: inquiry.id, email: inquiry.client?.email || user.email, fileName: item.name.slice(0, 500), fileUrl: (item.webUrl || "").slice(0, 2000) },
      });
    } catch (err) {
      console.error("[portal] could not record document row", err);
    }
    if (doc?.key) {
      const remaining = (inquiry.documentsMissing || "").split(",").map((k) => k.trim()).filter((k) => k && k !== doc.key);
      await prisma.inquiry.update({
        where: { id: inquiry.id },
        data: { documentsMissing: remaining.length ? remaining.join(",") : null, documentsComplete: remaining.length === 0 },
      });
    }
  }

  if (doc?.key) {
    try {
      const { updateCaseCompleteness } = await import("@/components/updateCaseCompleteness");
      await updateCaseCompleteness(c.id, { complete: outstanding.length === 0, missing: outstanding, supplied: [doc.key], submissionId: inquiry?.id || `portal:${user.id}` });
    } catch (err) {
      console.error("[portal] Salesforce completeness update failed (continuing)", err);
    }
  }

  await audit({ action: "document_uploaded", actorId: user.id, actorEmail: user.email, target: `${c.nr} · ${label}`, ip: requestIp() });
  try {
    await sendTeamMail({
      to: c.ownerEmail,
      subject: `Partnerportal: Dokument zu ${c.nr} (${c.kunde})`,
      lines: [
        `${user.name || user.email}${user.company ? ` (${user.company})` : ""} hat ein Dokument hochgeladen.`,
        `Case: ${c.nr} · ${c.kunde}`,
        `Dokument: ${label}`,
        `Datei: ${item.name}`,
        outstanding.length ? `Noch offen: ${outstanding.length} Dokument(e).` : "Damit ist nichts mehr offen.",
      ],
      origin: requestOrigin(),
      link: item.webUrl || undefined,
    });
  } catch (err) {
    console.error("[portal] team mail about upload failed", err);
  }

  return NextResponse.json({ ok: true, complete: outstanding.length === 0 });
}
