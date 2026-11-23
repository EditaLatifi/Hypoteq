import Link from "next/link";
import { ChevronRight } from "lucide-react";
import LeadForm from "@/components/portal/lead/LeadForm";
import ResendLeadButton from "@/components/portal/lead/ResendLeadButton";
import { Badge, Card, Eyebrow, PageHeader, formatDate } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { LEAD_TONE } from "@/lib/portal/lead";
import { listLeads, type LeadView } from "@/lib/portal/leadServer";
import { requireUser } from "@/lib/portal/session";

/**
 * «Kunde einladen» (Partner Fast Lead, DECISIONS P39): the form, how it works, and the partner's
 * invitations with their status — Eingeladen, Link geöffnet, Eingereicht (with the Case), Abgelaufen.
 * An admin viewing as a partner sees that partner's list read-only.
 */
export default async function InviteCustomerPage() {
  const user = await requireUser();
  const { t } = await getDict();
  const l = t.lead;
  const canInvite = !user.viewingAs && !!user.sfContactId;

  let rows: LeadView[] = [];
  if (user.contactId) {
    try {
      rows = await listLeads(user.contactId);
    } catch (err) {
      // E.g. before prisma/sql/2026-11-23-portal-lead.sql has run: the form still shows.
      console.error("[portal] listing lead invitations failed", err);
    }
  }

  const statusLine = (r: LeadView) =>
    r.status === "submitted"
      ? l.submittedOn(formatDate(r.submittedAt))
      : r.status === "expired"
        ? l.expiredOn(formatDate(r.expiresAt))
        : `${l.invitedOn(formatDate(r.createdAt))} · ${l.validUntil(formatDate(r.expiresAt))}`;

  return (
    <>
      <PageHeader eyebrow={l.eyebrow} title={l.title} sub={<span className="block max-w-[720px]">{l.sub}</span>} />

      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))" }}>
        <Card>
          {canInvite ? <LeadForm /> : <p className="m-0 text-[15px] text-white/70">{user.viewingAs ? l.readOnly : l.noContact}</p>}
        </Card>
        <Card>
          <Eyebrow accent>{l.howTitle}</Eyebrow>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {l.how.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.45] text-white/85">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[#CAF476] text-[13px] font-semibold text-[#132219]">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {user.contactId ? (
        <div className="flex flex-col gap-3">
          <Eyebrow accent>{l.listTitle}</Eyebrow>
          <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
            {rows.length ? (
              rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[.14] py-3.5 last:border-b-0">
                  <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
                    <span className="truncate text-[17px] font-medium">{r.kunde}</span>
                    <span className="break-all text-[13px] text-white/70">
                      {r.email} · {statusLine(r)}
                    </span>
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <Badge tone={LEAD_TONE[r.status]}>{l.statuses[r.status]}</Badge>
                    {r.status === "submitted" && r.salesforceCaseId ? (
                      <Link href={`/portal/cases/${r.salesforceCaseId}`} className="inline-flex items-center gap-1 text-[14px] font-medium text-[#CAF476] hover:text-[#DAF6A2]">
                        {r.caseNumber ? l.caseNr(r.caseNumber) : l.openCase} <ChevronRight size={16} aria-hidden />
                      </Link>
                    ) : r.status === "submitted" && r.caseNumber ? (
                      <span className="text-[14px] text-white/70">{l.caseNr(r.caseNumber)}</span>
                    ) : null}
                    {canInvite && r.status !== "submitted" && r.canResend ? <ResendLeadButton leadId={r.id} /> : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-[15px] text-white/70">{l.listNone}</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
