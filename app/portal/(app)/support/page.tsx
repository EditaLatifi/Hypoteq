import { Clock, Mail, Phone } from "lucide-react";
import SupportForm from "@/components/portal/support/SupportForm";
import { Badge, Card, Eyebrow, PageHeader, formatDate } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { requireUser } from "@/lib/portal/session";
import { isSupportType, supportStatusLabel, supportTone, ticketRef } from "@/lib/portal/support";
import { supportContact } from "@/lib/portal/supportServer";

/**
 * Support & Feedback (handoff 4): the form on the left; the contact (configurable, see
 * lib/portal/supportServer.ts) and «Ihre Meldungen» with their status on the right.
 */
export default async function SupportPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = t.support;
  const readOnly = !!user.viewingAs;

  // Case reference: the partner's own Cases, from the same (cached) load as the sidebar.
  const { cases } = user.contactId ? await loadMyCases(user, locale) : { cases: [] };
  const caseOptions = cases.map((c) => ({ id: c.id, label: `${c.nr} · ${c.kunde}` }));

  // An admin viewing as a partner sees that partner's tickets (read-only).
  let tickets: { id: string; type: string; subject: string; status: string; createdAt: Date }[] = [];
  try {
    const ownerId = user.viewingAs
      ? (await prisma.portalUser.findFirst({ where: { sfContactId: user.viewingAs.contactId }, select: { id: true } }))?.id
      : user.id;
    if (ownerId) {
      tickets = await prisma.portalSupportTicket.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, type: true, subject: true, status: true, createdAt: true },
      });
    }
  } catch (err) {
    console.error("[portal] loading support tickets failed", err);
  }
  const contact = supportContact(sp);

  return (
    <>
      <PageHeader eyebrow={sp.eyebrow} title={sp.title} sub={<span className="block max-w-[720px]">{sp.sub}</span>} />
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))" }}>
        <Card>
          <SupportForm cases={caseOptions} readOnly={readOnly} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <Eyebrow accent>{sp.contactTitle}</Eyebrow>
            <div className="flex items-center gap-3.5">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-white/[.14] text-[15px] font-semibold">{contact.initials}</span>
              <div className="min-w-0">
                <div className="text-[17px] font-medium">{contact.name}</div>
                <div className="text-[15px] text-white/70">{contact.role}</div>
              </div>
            </div>
            <div className="flex flex-col">
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-3 border-t border-white/[.14] py-2.5 text-[15px] hover:text-[#DAF6A2]">
                <Phone size={18} className="flex-none text-[#CAF476]" /> {contact.phone}
              </a>
              <a href={`mailto:${contact.email}`} className="flex items-center gap-3 break-all border-t border-white/[.14] py-2.5 text-[15px] hover:text-[#DAF6A2]">
                <Mail size={18} className="flex-none text-[#CAF476]" /> {contact.email}
              </a>
              <div className="flex items-center gap-3 border-t border-white/[.14] py-2.5 text-[15px] text-white/70">
                <Clock size={18} className="flex-none text-[#CAF476]" /> {contact.hours}
              </div>
            </div>
          </Card>

          <Card>
            <Eyebrow accent>{sp.ticketsTitle}</Eyebrow>
            <div className="flex flex-col">
              {tickets.map((tk) => (
                <div key={tk.id} className="flex items-start justify-between gap-4 border-t border-white/[.14] py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] text-white/70">
                      {ticketRef(tk.id)} · {isSupportType(tk.type) ? sp.types[tk.type] : tk.type} · {formatDate(tk.createdAt)}
                    </span>
                    <span className="break-words text-[15px] font-medium">{tk.subject}</span>
                  </div>
                  <Badge tone={supportTone(tk.status)}>{supportStatusLabel(sp, tk.status)}</Badge>
                </div>
              ))}
              {tickets.length === 0 ? <div className="border-t border-white/[.14] py-3 text-[15px] text-white/70">{sp.ticketsNone}</div> : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
