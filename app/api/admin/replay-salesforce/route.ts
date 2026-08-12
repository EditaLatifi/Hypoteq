import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ==========================================================================
 * DEV-ONLY SALESFORCE REPLAY
 *
 * The funnel treats a Salesforce failure as non-fatal, so a broken connection
 * leaves inquiries sitting in Postgres with no Case. This endpoint rebuilds the
 * original funnel payload from those rows and runs the *real* sync over it.
 *
 * Disabled in production on purpose: it is an operator tool, not a public route.
 * Run it locally against the production database (`.env.local` already points there):
 *
 *   npm run dev
 *   # 1. health check — does the integration user have the Person Account record type?
 *   curl "http://localhost:3000/api/admin/replay-salesforce?preflight=1"
 *   # 2. dry run — validate + map every unsynced lead, write nothing
 *   curl "http://localhost:3000/api/admin/replay-salesforce?since=2026-08-06"
 *   # 3. for real
 *   curl "http://localhost:3000/api/admin/replay-salesforce?since=2026-08-06&apply=1"
 *
 * Narrow to specific rows with `?ids=<uuid>,<uuid>`.
 * ======================================================================== */

export const dynamic = "force-dynamic";

// Rebuild the shape app/api/inquiry expects from the normalised DB rows.
function toFunnelPayload(inquiry: any) {
  return {
    id: inquiry.id,
    customerType: inquiry.customerType,
    lastName: inquiry.client?.lastName || undefined,
    korrespondenzsprache: "Deutsch",
    stage: "Needs Analysis",
    client: inquiry.client
      ? {
          firstName: inquiry.client.firstName || "",
          lastName: inquiry.client.lastName || "",
          email: inquiry.client.email,
          phone: inquiry.client.phone || "",
          zip: inquiry.client.zip || "",
          partnerEmail: inquiry.client.partnerEmail || "",
        }
      : undefined,
    project: inquiry.project || undefined,
    property: inquiry.property || undefined,
    financing: inquiry.financing || undefined,
    borrowers: inquiry.borrowers || [],
  };
}

// A stand-in for the salesforceApi module that answers reads for real but swallows
// writes, so a dry run exercises validation, picklist mapping and the record-type
// preflight without creating anything.
function dryRunApi(real: any, writes: any[]) {
  return {
    ...real,
    createAccount: async (fields: any) => {
      writes.push({ op: "createAccount", fields });
      return { id: "DRYRUN_ACCOUNT_ID" };
    },
    createPersonAccount: async (fields: any) => {
      writes.push({ op: "createPersonAccount", fields });
      return { id: "DRYRUN_ACCOUNT_ID" };
    },
    updatePersonAccount: async (id: string, fields: any) => {
      writes.push({ op: "updatePersonAccount", id, fields });
      return { id, success: true };
    },
    createContact: async (fields: any) => {
      writes.push({ op: "createContact", fields });
      return { id: "DRYRUN_CONTACT_ID" };
    },
    updateContact: async (id: string, fields: any) => {
      writes.push({ op: "updateContact", id, fields });
      return { id, success: true };
    },
    createOrUpdateCase: async (fields: any) => {
      writes.push({ op: "createOrUpdateCase", fields });
      return { id: "DRYRUN_CASE_ID" };
    },
  };
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const ids = (url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  const since = url.searchParams.get("since");

  const salesforceApi = (await import("@/components/salesforceApi")).default;

  // Preflight: prove the connection can actually create Person Accounts before
  // replaying anything. This is the check that turns the original silent failure
  // into a one-line answer.
  let preflightError: string | null = null;
  let recordTypeId: string | null = null;
  try {
    await salesforceApi.login();
    recordTypeId = await salesforceApi.getPersonAccountRecordTypeId();
  } catch (err) {
    preflightError = err instanceof Error ? err.message : String(err);
  }

  if (url.searchParams.get("preflight") === "1") {
    return NextResponse.json(
      preflightError
        ? { ok: false, stage: "preflight", error: preflightError }
        : { ok: true, personAccountRecordTypeId: recordTypeId, message: "Salesforce login and Person Account record type are usable." },
      { status: preflightError ? 502 : 200 }
    );
  }

  // A dry run writes nothing, so it stays useful while the connection is still broken —
  // it shows exactly which leads are queued and what they would create. Applying for real
  // against a connection that cannot create Accounts would just burn through the backlog
  // producing failures, so that path stops here.
  if (preflightError && apply) {
    return NextResponse.json({ ok: false, stage: "preflight", error: preflightError }, { status: 502 });
  }

  // Default target: rows that never reached Salesforce. Everything reconciled against the
  // org has salesforceSyncedAt set, so the replay physically cannot duplicate an existing
  // Case. `force=1` lifts that filter for dry runs (useful for regression-testing the
  // mapping over historical leads of every type) but is refused together with apply.
  const force = url.searchParams.get("force") === "1";
  if (force && apply) {
    return NextResponse.json(
      { error: "force=1 is dry-run only — it would re-create Cases for already-synced inquiries." },
      { status: 400 }
    );
  }

  const where: any = {};
  if (ids.length) where.id = { in: ids };
  if (since) where.createdAt = { gte: new Date(since) };
  if (!force && !ids.length) where.salesforceSyncedAt = null;

  const inquiries = await prisma.inquiry.findMany({
    where,
    include: { client: true, project: true, property: true, financing: true, borrowers: true },
    orderBy: { createdAt: "asc" },
  });

  const { syncFunnelStepsToSalesforce } = await import("@/components/syncFunnelStepsToSalesforce");
  const results: any[] = [];

  for (const inquiry of inquiries) {
    const writes: any[] = [];
    const api = apply ? salesforceApi : dryRunApi(salesforceApi, writes);

    // Mirror the live funnel route: the partner's Contact must exist *before* the sync,
    // otherwise findContactByEmail misses and the Case lands without a Partner_Consultant__c.
    if (apply && inquiry.customerType === "partner" && inquiry.client?.email) {
      try {
        const { savePartnerConsultantEmailToSalesforce } =
          await import("@/components/savePartnerConsultantEmailToSalesforce");
        await savePartnerConsultantEmailToSalesforce(inquiry.client.email);
      } catch (err) {
        console.error(`⚠️ Partner consultant upsert failed for ${inquiry.client.email}:`, err);
      }
    }
    const kn = Array.isArray((inquiry.property as any)?.kreditnehmer) ? (inquiry.property as any).kreditnehmer : [];
    const label = [
      inquiry.createdAt.toISOString().slice(0, 16),
      inquiry.customerType,
      inquiry.project?.projektArt || "?",
      inquiry.borrowers?.[0]?.type || "?",
      inquiry.property?.artImmobilie || "?",
      `kn=${kn.length}`,
      inquiry.client?.email ?? "",
    ].join(" ");
    try {
      const out = await syncFunnelStepsToSalesforce(toFunnelPayload(inquiry) as any, api);
      const caseId = (out as any)?.case?.id || (out as any)?.case?.Id || null;

      // Stamp the row so a replay is never applied twice.
      if (apply) {
        await prisma.inquiry.update({
          where: { id: inquiry.id },
          data: { salesforceCaseId: caseId, salesforceSyncedAt: new Date(), salesforceError: null },
        });
      }

      results.push({
        inquiryId: inquiry.id,
        label,
        status: apply ? "synced" : "would-sync",
        caseId,
        caseName: writes.find(w => w.op === "createOrUpdateCase")?.fields?.Case_Name__c,
      });
      console.log(`✅ ${apply ? "Replayed" : "Dry-ran"} ${inquiry.id} (${label})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (apply) {
        await prisma.inquiry.update({
          where: { id: inquiry.id },
          data: { salesforceError: message.slice(0, 2000) },
        }).catch(() => {});
      }
      results.push({ inquiryId: inquiry.id, label, status: "failed", error: message });
      console.error(`❌ Replay failed for ${inquiry.id} (${label}):`, err);
    }
  }

  return NextResponse.json({
    mode: apply ? "apply" : "dry-run",
    preflightWarning: preflightError,
    total: results.length,
    synced: results.filter(r => r.status !== "failed").length,
    failed: results.filter(r => r.status === "failed").length,
    results,
  });
}
