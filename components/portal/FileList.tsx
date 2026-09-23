"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Eye, FileText, Image as ImageIcon, X } from "lucide-react";
import { useT } from "@/components/portal/I18n";
import { btn, formatDate } from "@/components/portal/ui";

export type PortalFile = { id: string; name: string; size: number; modified: string };

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Files of a Case dossier with an in-portal preview. The viewer URL is fetched only when
 * the partner clicks "Ansehen": it is short-lived and every request is checked and logged
 * on the server.
 */
export default function FileList({ caseId, files, empty }: { caseId: string; files: PortalFile[]; empty: string }) {
  const t = useT();
  const [open, setOpen] = useState<PortalFile | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    fetch(`/api/portal/files/${caseId}/${open.id}?mode=preview`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => !cancelled && setUrl(j.url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, caseId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!files.length) return <p className="m-0 text-[15px] text-white/70">{empty}</p>;

  const download = (f: PortalFile) => `/api/portal/files/${caseId}/${f.id}`;

  return (
    <>
      <div className="flex flex-col">
        {files.map((f) => {
          const isImage = /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name);
          return (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.14] py-3">
              <button type="button" onClick={() => setOpen(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-[#DAF6A2]">
                {isImage ? <ImageIcon size={20} className="flex-none text-[#CAF476]" /> : <FileText size={20} className="flex-none text-[#CAF476]" />}
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{f.name}</span>
                  <span className="block text-[13px] text-white/70">
                    {sizeLabel(f.size)} · {formatDate(f.modified)}
                  </span>
                </span>
              </button>
              <div className="flex flex-none items-center gap-1">
                <button type="button" onClick={() => setOpen(f)} className={`${btn.ghost} h-9 px-2 text-[15px]`}>
                  <Eye size={18} /> {t.caseDetail.view}
                </button>
                <a href={download(f)} aria-label={`${t.caseDetail.download}: ${f.name}`} title={t.caseDetail.download} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/[.08]">
                  <Download size={18} />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 p-2 md:p-6" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-white/[.14] bg-[#1A2E20]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-white/[.14] px-4 py-3">
              <div className="min-w-0 truncate text-[15px] font-semibold">{open.name}</div>
              <div className="flex flex-none items-center gap-1">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className={`${btn.ghost} hidden h-9 px-2 text-[14px] sm:inline-flex`}>
                    <ExternalLink size={17} /> {t.caseDetail.openNewTab}
                  </a>
                ) : null}
                <a href={download(open)} className={`${btn.ghost} h-9 px-2 text-[14px]`}>
                  <Download size={17} /> <span className="hidden sm:inline">{t.caseDetail.download}</span>
                </a>
                <button type="button" onClick={() => setOpen(null)} aria-label={t.common.close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/[.08]">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="relative flex-1 bg-white">
              {url ? (
                <iframe src={url} title={open.name} className="absolute inset-0 h-full w-full border-0" />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[#132219] px-6 text-center text-[15px] text-white/70">
                  {failed ? t.caseDetail.previewFailed : t.caseDetail.previewLoading}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
