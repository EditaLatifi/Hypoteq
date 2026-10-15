import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Plus, ShieldOff } from "lucide-react";
import { Badge, Card, Eyebrow, FormError, btn, formatDate } from "@/components/portal/ui";
import { audit } from "@/lib/portal/audit";
import { getDict } from "@/lib/portal/i18n/server";
import { requestIp, requireUser } from "@/lib/portal/session";
import { formatFileSize, specialArt, summaryRows } from "@/lib/portal/special";
import { getSpecialRequest, type SpecialRequestView } from "@/lib/portal/specialServer";

/**
 * A submitted Spezialfinanzierung. The partner lands here after submitting when there is
 * no Case to open yet — Salesforce failed or the Case could not be linked to them
 * (DECISIONS P9) — and from «Ihre Spezialfinanzierungen».
 */
export default async function SpecialRequestPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const { t } = await getDict();
  const s = t.special;

  let r: SpecialRequestView | null = null;
  try {
    r = await getSpecialRequest(user, params.id);
  } catch (err) {
    console.error("[portal] loading the special financing failed", err);
    return <FormError>{t.errors.generic}</FormError>;
  }

  const back = (
    <div>
      <Link href="/portal/spezialfinanzierung" className={`${btn.ghost} h-9 text-[16px]`}>
        <ArrowLeft size={18} /> {s.backToList}
      </Link>
    </div>
  );

  if (!r) {
    const path = `/portal/spezialfinanzierung/${params.id.slice(0, 40)}`;
    await audit({ action: "access_denied", actorId: user.id, actorEmail: user.email, target: path, ip: requestIp() });
    return (
      <>
        {back}
        <div className="flex max-w-[560px] flex-col gap-5">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
            <ShieldOff size={26} />
          </span>
          <Eyebrow>{path}</Eyebrow>
          <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.caseDetail.deniedTitle}</h1>
          <p className="m-0 text-[17px] text-white/70">{s.deniedText}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {back}

      <div className="flex flex-col gap-2">
        <Eyebrow>
          {r.caseNr || r.ref} · {specialArt(s, r.type)}
        </Eyebrow>
        <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{r.kunde}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">{s.statusSubmitted}</Badge>
          <span className="text-[15px] text-white/70">{s.submittedOn(formatDate(r.submittedAt))}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#CAF476] bg-[#1A2E20] p-5 md:p-7">
        <div className="flex items-center gap-2.5 text-[21px] font-medium tracking-[-0.01em]">
          <CheckCircle2 size={22} className="flex-none text-[#CAF476]" /> {s.doneTitle}
        </div>
        <p className="m-0 text-[15px] text-white/70">{s.doneText}</p>
        {r.caseId ? (
          <Link href={`/portal/cases/${r.caseId}`} className={`${btn.primary} h-11 w-fit text-[16px]`}>
            {s.openCase} <ArrowRight size={18} />
          </Link>
        ) : (
          <p className="m-0 text-[15px] text-white/70">{s.donePending}</p>
        )}
        <p className="m-0 text-[13px] text-white/45">
          {s.reference}: {r.ref}
        </p>
      </div>

      <Card>
        <Eyebrow accent>{s.summaryTitle}</Eyebrow>
        <div className="grid gap-x-5 gap-y-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))" }}>
          {summaryRows(s, r.answers, r.files.length).map((row) => (
            <div key={row.k} className="flex flex-col gap-0.5 border-t border-white/[.14] pt-3">
              <span className="text-[13px] text-white/70">{row.k}</span>
              <span className="break-words text-[15px] font-medium">{row.v}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-white/[.14] pt-3">
          <span className="text-[13px] text-white/70">{s.sum.text}</span>
          <span className="whitespace-pre-wrap break-words text-[15px]">{r.answers.beschreibung}</span>
        </div>
        {r.files.length ? (
          <div className="flex flex-col">
            {r.files.map((f, i) => (
              <div key={`${f.fileName}-${i}`} className="flex items-center gap-3 border-t border-white/[.14] py-2.5">
                <FileText size={20} className="flex-none text-[#CAF476]" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{f.fileName}</span>
                <span className="flex-none text-[13px] text-white/70">{formatFileSize(f.size)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {!user.viewingAs ? (
        <div>
          <Link href="/portal/spezialfinanzierung" className={`${btn.secondary} h-10 text-[16px]`}>
            <Plus size={18} /> {s.newRequest}
          </Link>
        </div>
      ) : null}
    </>
  );
}
