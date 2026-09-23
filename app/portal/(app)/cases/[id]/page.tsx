import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Download, FileCheck, FileText, ShieldOff } from "lucide-react";
import MessageForm from "@/components/portal/MessageForm";
import UploadButton from "@/components/portal/UploadButton";
import { Badge, Card, Eyebrow, FormError, btn, formatDate } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { caseFolder, listReleasedFiles, type DriveFile } from "@/lib/portal/files";
import type { Dict } from "@/lib/portal/i18n/dict";
import { getDict } from "@/lib/portal/i18n/server";
import { notifText } from "@/lib/portal/notifications";
import { docLabel, getPartnerCase, type PortalCaseDetail } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import { requestIp, requireUser } from "@/lib/portal/session";
import { CLOSED_STATUSES } from "@/lib/portal/status";

function Denied({ path, t }: { path: string; t: Dict }) {
  return (
    <div className="flex max-w-[560px] flex-col gap-5 pt-6">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
        <ShieldOff size={26} />
      </span>
      <Eyebrow>{path}</Eyebrow>
      <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.caseDetail.deniedTitle}</h1>
      <p className="m-0 text-[17px] text-white/70">{t.caseDetail.deniedText}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/portal/cases" className={`${btn.primary} h-11 text-[16px]`}>
          {t.caseDetail.toOverview} <ArrowRight size={18} />
        </Link>
        <Link href="/portal/dashboard" className={`${btn.ghost} h-11 px-2 text-[16px]`}>
          {t.caseDetail.toDashboard}
        </Link>
      </div>
    </div>
  );
}

function Timeline({ c, t }: { c: PortalCaseDetail; t: Dict }) {
  const ended = c.step < 0;
  const current = Math.min(c.step, t.steps.length);
  const statusLabel = t.status[c.status] || c.status;
  return (
    <Card>
      <div className="flex flex-wrap justify-between gap-3">
        <Eyebrow accent>{t.caseDetail.progress}</Eyebrow>
        <div className="text-[13px] text-white/70">
          {ended ? statusLabel : current >= t.steps.length ? t.caseDetail.completed : t.caseDetail.stepOf(current + 1, t.steps.length)}
        </div>
      </div>
      {ended || c.status === "Pausiert" ? (
        <div className="rounded-xl bg-white/[.08] px-4 py-3.5 text-[15px] text-white/70">
          {ended ? t.caseDetail.ended(statusLabel) : t.caseDetail.paused}
        </div>
      ) : null}
      <ol className="m-0 grid list-none grid-cols-1 gap-0 p-0 lg:grid-cols-7 lg:gap-2">
        {t.steps.map((label, i) => {
          const done = !ended && i < current;
          const now = !ended && i === current;
          return (
            <li key={label} className="relative flex items-start gap-3.5 pb-4 lg:block lg:pb-0 lg:pt-8">
              <span
                aria-hidden
                className={`absolute bottom-0 left-[10px] top-[22px] w-0.5 lg:bottom-auto lg:left-0 lg:right-0 lg:top-[10px] lg:block lg:h-0.5 lg:w-auto ${
                  done ? "bg-[#CAF476]" : "bg-white/[.14]"
                } ${i === t.steps.length - 1 ? "hidden" : ""}`}
              />
              <span
                className={`relative grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 text-[#132219] lg:absolute lg:left-0 lg:top-0 ${
                  done ? "border-[#CAF476] bg-[#CAF476]" : now ? "border-[#CAF476] bg-[#132219]" : "border-white/30 bg-[#1A2E20]"
                }`}
              >
                {done ? <Check size={13} strokeWidth={3} /> : null}
              </span>
              <div className={`pr-2 text-[15px] leading-[1.3] lg:text-[13px] ${now ? "font-semibold text-white" : done ? "text-white" : "text-white/45"}`}>{label}</div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user.contactId) redirect("/portal/dashboard");
  const { t, locale } = await getDict();
  const path = `/portal/cases/${params.id.slice(0, 40)}`;

  let c: PortalCaseDetail | null = null;
  try {
    const scope = await scopeFor(user);
    c = scope ? await getPartnerCase(scope, params.id, locale) : null;
  } catch (err) {
    console.error("[portal] loading case failed", err);
    return <FormError>{t.common.caseLoadError}</FormError>;
  }
  if (!c) {
    await audit({ action: "access_denied", actorId: user.id, actorEmail: user.email, target: path, ip: requestIp() });
    return <Denied path={path} t={t} />;
  }
  await audit({ action: "case_opened", actorId: user.id, actorEmail: user.email, target: `${c.nr} · ${c.id}${user.viewingAs ? " (Partneransicht)" : ""}`, ip: requestIp() });

  const readOnly = !!user.viewingAs;
  const closed = CLOSED_STATUSES.includes(c.status);

  const [uploads, messages, notifs, released] = await Promise.all([
    prisma.portalUpload.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.portalMessage.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    readOnly ? Promise.resolve([]) : prisma.portalNotification.findMany({ where: { userId: user.id, caseId: c.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    (async (): Promise<DriveFile[]> => {
      try {
        const folder = await caseFolder(c!.id, { create: false });
        return folder ? await listReleasedFiles(folder) : [];
      } catch (err) {
        console.error("[portal] released files unavailable", err);
        return [];
      }
    })(),
  ]);
  if (!readOnly) {
    await prisma.portalNotification.updateMany({ where: { userId: user.id, caseId: c.id, readAt: null }, data: { readAt: new Date() } });
  }

  const uploadLabel = (key: string | null) => (key ? docLabel(key, locale) : t.caseDetail.otherDoc);
  // Outstanding: confirmed missing first, then expected per HYPOTEQ's list.
  const missing = [...c.documents.filter((d) => d.state === "fehlt"), ...c.documents.filter((d) => d.state === "offen")];
  const hasOpen = missing.some((d) => d.state === "offen");
  const stateBadge = (state: string) => (state === "offen" ? <Badge tone="warning">{t.caseDetail.open}</Badge> : <Badge tone="danger">{t.caseDetail.missing}</Badge>);
  const present = c.documents.filter((d) => d.state === "vorhanden");
  const updates = [
    ...notifs.map((n) => ({ at: n.createdAt, text: notifText(t, n).text, by: "HYPOTEQ" })),
    ...uploads.map((u) => ({ at: u.createdAt, text: t.caseDetail.evUploaded(uploadLabel(u.docKey), u.fileName), by: "" })),
    ...messages.map((m) => ({ at: m.createdAt, text: `${t.caseDetail.evMessage} «${m.body.length > 140 ? m.body.slice(0, 140) + " …" : m.body}»`, by: "" })),
    { at: new Date(c.createdAt), text: t.caseDetail.evReceived, by: "" },
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <div>
        <Link href="/portal/cases" className={`${btn.ghost} h-9 text-[16px]`}>
          <ArrowLeft size={18} /> {t.caseDetail.back}
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>
          {c.nr} · {c.art}
        </Eyebrow>
        <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{c.kunde}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={c.tone}>{t.status[c.status] || c.status}</Badge>
          <span className="text-[15px] text-white/70">{t.caseDetail.lastUpdate(formatDate(c.updatedAt))}</span>
        </div>
      </div>

      {!closed && missing.length > 0 ? (
        <div className="flex flex-col gap-4 rounded-xl border border-[#CAF476] bg-[#1A2E20] p-5 md:p-7">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[.08em] text-[#CAF476]">
              <AlertCircle size={18} strokeWidth={2} /> {t.caseDetail.actionRequired}
            </div>
            <div className="text-[21px] font-medium tracking-[-0.01em]">{t.caseDetail.needDocs}</div>
          </div>
          <div className="flex flex-col">
            {missing.map((d) => (
              <div key={d.key || d.name} className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[.14] py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText size={20} className="flex-none text-[#CAF476]" />
                  <span className="text-[17px] font-medium">{d.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {stateBadge(d.state)}
                  {!readOnly ? <UploadButton caseId={c.id} docKey={d.key} label={d.name} text={t.caseDetail.uploadDoc} /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Timeline c={c} t={t} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow accent>{t.caseDetail.documents}</Eyebrow>
              <div className="text-[13px] text-white/70">
                {c.docsComplete === true ? t.caseDetail.docsComplete : t.caseDetail.docsSummary(missing.length, present.length + uploads.length)}
              </div>
            </div>
            {c.documents.length || uploads.length ? (
              <div className="flex flex-col">
                {missing.map((d) => (
                  <div key={`m-${d.key || d.name}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.14] py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText size={20} className="flex-none text-[#CAF476]" />
                      <span className="text-[15px] font-medium">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {stateBadge(d.state)}
                      {!readOnly ? <UploadButton caseId={c.id} docKey={d.key} label={d.name} variant="secondary" /> : null}
                    </div>
                  </div>
                ))}
                {uploads.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 border-t border-white/[.14] py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCheck size={20} className="flex-none text-[#CAF476]" />
                      <div className="min-w-0">
                        <div className="text-[15px] font-medium">{uploadLabel(u.docKey)}</div>
                        <div className="truncate text-[13px] text-white/70">
                          {u.fileName} · {formatDate(u.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Badge tone="accent">{t.caseDetail.uploaded}</Badge>
                  </div>
                ))}
                {present.map((d) => (
                  <div key={`p-${d.name}`} className="flex items-center justify-between gap-3 border-t border-white/[.14] py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCheck size={20} className="flex-none text-[#CAF476]" />
                      <span className="text-[15px] font-medium">{d.name}</span>
                    </div>
                    <Badge tone="success">{t.caseDetail.present}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[15px] text-white/70">{t.caseDetail.noDocs}</p>
            )}
            {hasOpen ? <p className="m-0 text-[13px] text-white/60">{t.caseDetail.openNote}</p> : null}
            {closed ? (
              <p className="m-0 border-t border-white/[.14] pt-4 text-[14px] text-white/60">{t.caseDetail.closedNoUpload}</p>
            ) : !readOnly ? (
              <div className="border-t border-white/[.14] pt-4">
                <UploadButton caseId={c.id} docKey={null} label={t.caseDetail.otherDoc} variant="secondary" text={t.caseDetail.uploadOther} />
              </div>
            ) : null}
          </Card>

          <Card>
            <Eyebrow accent>{t.caseDetail.released}</Eyebrow>
            {released.length ? (
              <div className="flex flex-col">
                {released.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 border-t border-white/[.14] py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCheck size={20} className="flex-none text-[#CAF476]" />
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-medium">{f.name}</div>
                        <div className="text-[13px] text-white/70">
                          {(f.size / 1024 / 1024).toFixed(1)} MB · {formatDate(f.modified)}
                        </div>
                      </div>
                    </div>
                    <a href={`/api/portal/files/${c.id}/${f.id}`} className={`${btn.ghost} h-9 flex-none text-[15px]`}>
                      <Download size={18} /> {t.caseDetail.download}
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[15px] text-white/70">{t.caseDetail.noReleased}</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <Eyebrow accent>{t.caseDetail.overview}</Eyebrow>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2">
              {c.facts.map((f) => (
                <div key={f.k} className="flex flex-col gap-0.5 border-t border-white/[.14] pt-3">
                  <span className="text-[13px] text-white/70">{t.caseDetail.facts[f.k] || f.k}</span>
                  <span className="text-[15px] font-medium tabular-nums">{f.v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <Eyebrow accent>{t.caseDetail.updates}</Eyebrow>
            <div className="flex flex-col">
              {updates.slice(0, 12).map((u, i) => (
                <div key={i} className="flex gap-4 border-t border-white/[.14] py-3">
                  <span className="w-[82px] flex-none pt-0.5 text-[13px] tabular-nums text-white/70">{formatDate(u.at)}</span>
                  <span className="text-[15px]">{u.text}</span>
                </div>
              ))}
            </div>
          </Card>

          {!closed ? (
            <Card>
              <Eyebrow accent>{t.caseDetail.messageTitle}</Eyebrow>
              <p className="m-0 text-[15px] text-white/70">{t.caseDetail.messageHint}</p>
              <MessageForm caseId={c.id} readOnly={readOnly} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
