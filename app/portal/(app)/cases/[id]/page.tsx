import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Download, FileCheck, FileClock, FileText, House, ShieldOff } from "lucide-react";
import FileList from "@/components/portal/FileList";
import MessageForm from "@/components/portal/MessageForm";
import UploadButton from "@/components/portal/UploadButton";
import { Badge, Card, Eyebrow, FormError, ProgressBar, btn, formatDate } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/portal/audit";
import { PORTAL_TOOLS, teamAddress } from "@/lib/portal/config";
import { caseFolder, listCaseFiles, listReleasedFiles, type DriveFile } from "@/lib/portal/files";
import type { Dict } from "@/lib/portal/i18n/dict";
import { getDict } from "@/lib/portal/i18n/server";
import { notifText } from "@/lib/portal/notifications";
import { DOC_CATEGORIES } from "@/lib/portal/requiredDocs";
import { docLabel, getPartnerCase, type CaseDoc, type PortalCaseDetail } from "@/lib/portal/salesforce";
import { scopeFor } from "@/lib/portal/scope";
import { requestIp, requireUser } from "@/lib/portal/session";
import { DOC_TONES, STEPS, isClosedStatus, needsDocument, timeline } from "@/lib/portal/status";
import { docProgress, summaryFile } from "@/lib/portal/view";

/** Zugriff verweigert (handoff): the Case is not this partner's. Checked and logged on the server. */
function Denied({ path, t }: { path: string; t: Dict }) {
  return (
    <div className="flex max-w-[560px] flex-col gap-5 pt-6">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
        <ShieldOff size={26} aria-hidden />
      </span>
      <Eyebrow>{path}</Eyebrow>
      <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{t.caseDetail.deniedTitle}</h1>
      <p className="m-0 text-[17px] text-white/70">{t.caseDetail.deniedText}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/portal/cases" className={`${btn.primary} h-11 text-[16px]`}>
          {t.caseDetail.toOverview} <ArrowRight size={18} aria-hidden />
        </Link>
        <Link href="/portal/dashboard" className={`${btn.ghost} h-11 rounded-full px-2 text-[16px]`}>
          {t.caseDetail.toDashboard}
        </Link>
      </div>
    </div>
  );
}

const plain = (s: string) => s.replace(/\u00AD/g, "");

/**
 * Bearbeitungsstand: seven steps in seven equal columns (desktop), vertical on phones. Long
 * words break only at the dictionary's soft hyphens. Abgelehnt and Storniert show a notice
 * instead of the steps.
 */
function Timeline({ c, t }: { c: PortalCaseDetail; t: Dict }) {
  const tl = timeline(c.status);
  const statusLabel = t.status[c.status] || c.status;
  const info = tl.ended ? statusLabel : tl.allDone ? t.caseDetail.allDone : t.caseDetail.stepText(tl.current + 1, STEPS.length, plain(t.steps[tl.current]));
  return (
    <Card>
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.progress}</h2>
        <div className="text-[13px] text-white/70">{info}</div>
      </div>
      {tl.ended ? (
        <div className="rounded-xl bg-white/[.08] px-4 py-3.5 text-[15px] text-white/70">
          {c.status === "Storniert" ? t.caseDetail.endedCancelled : t.caseDetail.endedDeclined}
        </div>
      ) : (
        <>
          {c.onHold && !isClosedStatus(c.status) ? <div className="rounded-xl bg-white/[.08] px-4 py-3.5 text-[15px] text-white/70">{t.caseDetail.paused}</div> : null}
          <ol className="m-0 grid list-none grid-cols-1 p-0 min-[900px]:grid-cols-[repeat(7,minmax(0,1fr))] min-[900px]:gap-2">
            {tl.steps.map((s, i) => {
              const last = i === tl.steps.length - 1;
              return (
                <li key={i} aria-current={s.current ? "step" : undefined} className="relative flex items-start gap-3.5 pb-[18px] min-[900px]:block min-[900px]:pb-0 min-[900px]:pt-8">
                  {!last ? (
                    <span
                      aria-hidden
                      className={`absolute bottom-0 left-[10px] top-[22px] w-0.5 min-[900px]:bottom-auto min-[900px]:left-0 min-[900px]:right-[-8px] min-[900px]:top-[10px] min-[900px]:h-0.5 min-[900px]:w-auto ${
                        s.done ? "bg-[#CAF476]" : "bg-white/[.14]"
                      }`}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className={`relative grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 text-[#132219] min-[900px]:absolute min-[900px]:left-0 min-[900px]:top-0 ${
                      s.done ? "border-[#CAF476] bg-[#CAF476]" : s.current ? "border-[#CAF476] bg-[#1A2E20]" : "border-white/30 bg-[#1A2E20]"
                    }`}
                  >
                    {s.done ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <div
                    className={`hq-hyphens pt-px text-[15px] leading-[1.3] min-[900px]:pr-2 min-[900px]:pt-0 min-[900px]:text-[13px] ${
                      s.current ? "font-semibold text-white" : s.done ? "text-white/70" : "text-white/45"
                    }`}
                  >
                    {t.steps[i]}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}

function DocIcon({ d }: { d: CaseDoc }) {
  const cls = "flex-none text-[#CAF476]";
  if (d.status === "vorhanden") return <FileCheck size={20} aria-hidden className={cls} />;
  if (d.status === "pruefung" || d.status === "hochgeladen") return <FileClock size={20} aria-hidden className={cls} />;
  return <FileText size={20} aria-hidden className={cls} />;
}

/** The line under a document's name: whose it is, why it is expected, or the upload. */
function docMeta(d: CaseDoc, t: Dict): string | null {
  const parts = [d.person, d.expected ? t.caseDetail.expectedNote : null, d.upload ? t.caseDetail.uploadedOn(formatDate(d.upload.at), d.upload.fileName) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user.contactId) redirect("/portal/dashboard");
  const { t, locale } = await getDict();
  const path = `/portal/cases/${params.id.slice(0, 40)}`;

  // The Case is read only together with the partner's scope (lib/portal/salesforce.ts): a
  // foreign or guessed Id finds nothing, and that is refused and logged right here.
  let c: PortalCaseDetail | null = null;
  try {
    const scope = await scopeFor(user);
    c = scope ? await getPartnerCase(scope, params.id, locale) : null;
  } catch (err) {
    console.error("[portal] loading case failed", err);
    return <FormError>{t.common.caseLoadError}</FormError>;
  }
  if (!c) {
    await audit({ action: "access_denied", actorId: user.id, actorEmail: user.email, target: `${path} · fremder Case`, ip: requestIp() });
    return <Denied path={path} t={t} />;
  }
  await audit({ action: "case_opened", actorId: user.id, actorEmail: user.email, target: `${c.nr} · ${c.id}${user.viewingAs ? " (Partneransicht)" : ""}`, ip: requestIp() });

  const readOnly = !!user.viewingAs;
  const closed = isClosedStatus(c.status);

  const [uploads, messages, notifs, dossier] = await Promise.all([
    prisma.portalUpload.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.portalMessage.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    readOnly ? Promise.resolve([]) : prisma.portalNotification.findMany({ where: { userId: user.id, caseId: c.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    // The client's SharePoint dossier: what was submitted, and what HYPOTEQ released.
    (async (): Promise<{ files: DriveFile[]; released: DriveFile[]; failed: boolean }> => {
      try {
        const folder = await caseFolder(c!.id, { create: false });
        if (!folder) return { files: [], released: [], failed: false };
        const [files, released] = await Promise.all([listCaseFiles(folder), listReleasedFiles(folder)]);
        return { files, released, failed: false };
      } catch (err) {
        console.error("[portal] dossier files unavailable", err);
        return { files: [], released: [], failed: true };
      }
    })(),
  ]);
  // Opening the Case reads its notifications (handoff «Meldungen»: a click marks it read).
  if (!readOnly) {
    await prisma.portalNotification.updateMany({ where: { userId: user.id, caseId: c.id, readAt: null }, data: { readAt: new Date() } });
  }
  // Who did what under «Letzte Updates»: uploads and messages may come from a colleague.
  const authorIds = Array.from(new Set([...uploads.map((u) => u.userId), ...messages.map((m) => m.userId)]));
  const authors = new Map(
    (authorIds.length ? await prisma.portalUser.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } }) : []).map((u) => [u.id, u.name || u.email])
  );

  const summary = summaryFile(dossier.files, dossier.released);
  const address = teamAddress();
  const need = c.documents.filter((d) => needsDocument(d.status));
  const progress = docProgress(c.documents);
  const canUpload = !readOnly && !closed;
  const uploadContext = (d: CaseDoc) => `${c!.kunde} · ${c!.nr} · ${t.docCats[d.category]}`;
  const uploadLabel = (key: string | null) => (key ? docLabel(key, locale) : t.caseDetail.otherDoc);
  const updates = [
    ...notifs.map((n) => ({ at: n.createdAt, text: notifText(t, n).text, by: "HYPOTEQ" })),
    ...uploads.map((u) => ({ at: u.createdAt, text: t.caseDetail.evUploaded(uploadLabel(u.docKey), u.fileName), by: authors.get(u.userId) || "" })),
    ...messages.map((m) => ({ at: m.createdAt, text: `${t.caseDetail.evMessage} «${m.body.length > 140 ? m.body.slice(0, 140) + " …" : m.body}»`, by: authors.get(m.userId) || "" })),
    { at: new Date(c.createdAt), text: t.caseDetail.evReceived, by: "" },
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <div>
        <Link href="/portal/cases" className={`${btn.ghost} h-11 rounded-full text-[16px] min-[900px]:h-9`}>
          <ArrowLeft size={18} aria-hidden /> {t.caseDetail.back}
        </Link>
      </div>

      <div className="-mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Eyebrow>
            {c.nr} · {c.art}
          </Eyebrow>
          <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{c.kunde}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={c.tone}>{t.status[c.status] || c.status}</Badge>
            <span className="text-[15px] text-white/70">{t.caseDetail.lastUpdate(formatDate(c.updatedAt))}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={PORTAL_TOOLS.valuation} target="_blank" rel="noopener noreferrer" className={`${btn.ghost} h-11 rounded-full px-2 text-[15px] min-[900px]:h-9`}>
            <House size={18} aria-hidden /> {t.caseDetail.valuate}
            <span className="sr-only">{t.shell.tools.newTab}</span>
          </a>
          {summary ? (
            <a href={`/api/portal/files/${c.id}/${summary.id}`} className={`${btn.secondary} h-11 text-[15px] min-[900px]:h-9`}>
              <Download size={18} aria-hidden /> {t.caseDetail.summary}
            </a>
          ) : null}
        </div>
      </div>

      <Timeline c={c} t={t} />

      {c.actionRequired ? (
        <section aria-labelledby="case-action" className="flex flex-col gap-4 rounded-xl border border-[#CAF476] bg-[#1A2E20] p-5 md:p-7">
          <div className="flex flex-col gap-2">
            <h2 id="case-action" className="m-0 flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[.08em] text-[#CAF476]">
              <AlertCircle size={18} strokeWidth={2} aria-hidden /> {t.caseDetail.actionRequired}
            </h2>
            <div className="text-[21px] font-medium tracking-[-0.01em]">{t.caseDetail.needDocs}</div>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {need.map((d) => {
              const meta = [t.docCats[d.category], docMeta(d, t)].filter(Boolean).join(" · ");
              return (
                <li key={`a-${d.key || d.name}`} className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[.14] py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={20} aria-hidden className="flex-none text-[#CAF476]" />
                    <div className="min-w-0">
                      <div className="text-[17px] font-medium">{d.name}</div>
                      <div className="text-[13px] text-white/70">{meta}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={DOC_TONES[d.status]}>{t.docStatus[d.status]}</Badge>
                    {canUpload ? <UploadButton caseId={c!.id} docKey={d.key} label={d.name} context={uploadContext(d)} text={t.caseDetail.uploadDoc} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.documents}</h2>
              {progress.total ? <div className="text-[13px] text-white/70">{t.caseDetail.docsOf(progress.ok, progress.total)}</div> : null}
            </div>
            {progress.total ? <ProgressBar value={progress.pct} label={t.caseDetail.docsOf(progress.ok, progress.total)} showValue /> : null}
            {c.documents.length ? (
              DOC_CATEGORIES.map((cat) => {
                const docs = c!.documents.filter((d) => d.category === cat);
                if (!docs.length) return null;
                return (
                  <div key={cat} className="flex flex-col">
                    <h3 className="m-0 py-1.5 text-[11px] font-normal uppercase tracking-[.14em] text-white/45">{t.docCats[cat]}</h3>
                    {docs.map((d, i) => {
                      const meta = docMeta(d, t);
                      return (
                        <div key={`${cat}-${i}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.14] py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <DocIcon d={d} />
                            <div className="min-w-0">
                              <div className="text-[15px] font-medium">{d.name}</div>
                              {meta ? <div className="truncate text-[13px] text-white/70">{meta}</div> : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={DOC_TONES[d.status]}>{t.docStatus[d.status]}</Badge>
                            {canUpload && needsDocument(d.status) ? (
                              <UploadButton caseId={c!.id} docKey={d.key} label={d.name} context={uploadContext(d)} variant="secondary" />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <p className="m-0 text-[15px] text-white/70">{t.caseDetail.noDocs}</p>
            )}
            {closed ? (
              <p className="m-0 border-t border-white/[.14] pt-4 text-[14px] text-white/60">{t.caseDetail.closedNoUpload}</p>
            ) : !readOnly ? (
              <div className="border-t border-white/[.14] pt-4">
                <UploadButton caseId={c.id} docKey={null} label={t.caseDetail.otherDoc} context={`${c.kunde} · ${c.nr} · ${t.docCats.weitere}`} variant="secondary" text={t.caseDetail.uploadOther} />
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.released}</h2>
            {dossier.failed ? <p className="m-0 text-[15px] text-white/70">{t.caseDetail.filesUnavailable}</p> : <FileList caseId={c.id} files={dossier.released} empty={t.caseDetail.noReleased} />}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.files}</h2>
              {dossier.files.length ? <span className="text-[13px] text-white/70">{dossier.files.length}</span> : null}
            </div>
            {dossier.failed ? (
              <p className="m-0 text-[15px] text-white/70">{t.caseDetail.filesUnavailable}</p>
            ) : (
              <FileList caseId={c.id} files={dossier.files} empty={t.caseDetail.filesNone} />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.overview}</h2>
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-3.5">
              {c.facts.map((f) => (
                <div key={f.k} className="flex flex-col gap-0.5 border-t border-white/[.14] pt-3">
                  <dt className="text-[13px] text-white/70">{t.caseDetail.facts[f.k] || f.k}</dt>
                  <dd className="m-0 text-[15px] font-medium tabular-nums">{f.v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.updates}</h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {updates.slice(0, 12).map((u, i) => (
                <li key={i} className="flex gap-4 border-t border-white/[.14] py-3">
                  <span className="w-[82px] flex-none pt-0.5 text-[13px] tabular-nums text-white/70">{formatDate(u.at)}</span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="break-words text-[15px]">{u.text}</span>
                    {u.by ? <span className="text-[13px] text-white/45">{u.by}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {!closed ? (
            <Card>
              <h2 className="m-0 text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{t.caseDetail.messageTitle}</h2>
              <p className="m-0 text-[15px] text-white/70">
                {t.caseDetail.messageVia.before} <span className="font-medium text-white">{address}</span> {t.caseDetail.messageVia.after}
              </p>
              <MessageForm caseId={c.id} readOnly={readOnly} address={address} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
