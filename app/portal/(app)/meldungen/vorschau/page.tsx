/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader, btn } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { mailFromAddress } from "@/lib/portal/config";
import { getDict } from "@/lib/portal/i18n/server";
import { notifText } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";

/**
 * E-Mail-Vorschau (handoff «Meldungen»): the e-mail a Case update sends, rendered from the
 * same texts lib/portal/mail.ts uses, for the partner's latest notification (or an example).
 * It carries the customer's name and the action only — no amounts, no documents.
 */
export default async function MailPreviewPage() {
  const user = await requireUser();
  if (!user.contactId || user.viewingAs) redirect("/portal/dashboard");
  const { t } = await getDict();

  const latest = await prisma.portalNotification.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const n = latest || { variant: "lender_answer", caseNr: "HQ-26-10-000000", kunde: t.mailPreview.sampleKunde, status: "Angebot liegt vor", caseId: null as string | null };
  const { title, text } = notifText(t, n);
  const paragraphs = [t.mail.hello(user.name), t.mail.notifBody(text.replace(/\.$/, ""), n.caseNr)];

  return (
    <>
      <div>
        <Link href="/portal/meldungen" className={`${btn.ghost} h-11 rounded-full text-[16px] min-[900px]:h-9`}>
          <ArrowLeft size={18} aria-hidden /> {t.mailPreview.back}
        </Link>
      </div>
      <PageHeader eyebrow={t.mailPreview.eyebrow} title={t.mailPreview.title} sub={t.mailPreview.sub} />
      {!latest ? <p className="-mt-4 m-0 text-[15px] text-white/70">{t.mailPreview.sample}</p> : null}

      <div className="hq-on-light w-full max-w-[600px] overflow-hidden rounded-xl bg-white text-[#132219]">
        <div className="flex flex-col gap-0.5 border-b border-[#E1E7DC] px-7 py-3.5 text-[13px] text-[#132219]/70">
          <span>
            <strong className="font-medium text-[#132219]">{t.mailPreview.from}:</strong> {t.mailPreview.sender} · {mailFromAddress()}
          </span>
          <span>
            <strong className="font-medium text-[#132219]">{t.mailPreview.to}:</strong> {user.email}
          </span>
          <span>
            <strong className="font-medium text-[#132219]">{t.mailPreview.subject}:</strong> {t.mail.notifSubject(n.kunde)}
          </span>
        </div>
        <div className="flex flex-col gap-5 px-7 py-8">
          <img src="/images/HYPOTEQ_layout_logo.png" alt="HYPOTEQ" className="block h-auto w-[120px]" />
          <div className="h-[3px] w-11 bg-[#132219]" />
          <h2 className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">{title}</h2>
          {paragraphs.map((p) => (
            <p key={p} className="m-0 text-[17px] text-[#132219]/70">
              {p}
            </p>
          ))}
          <div>
            <Link
              href={n.caseId ? `/portal/cases/${n.caseId}` : "/portal/cases"}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#CAF476] px-6 text-[16px] font-semibold text-[#132219] hover:bg-[#B7E455]"
            >
              {t.mail.notifCta} <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
          <p className="m-0 text-[13px] text-[#132219]/45">{t.mail.notifFoot}</p>
        </div>
        <div className="border-t border-[#E1E7DC] px-7 py-3.5 text-[11px] uppercase tracking-[.08em] text-[#132219]/45">{t.mail.footer}</div>
      </div>
    </>
  );
}
