"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Upload, X } from "lucide-react";
import { useT } from "@/components/portal/I18n";
import { btn } from "@/components/portal/ui";

const MAX = 20 * 1024 * 1024;
const EXT = ["pdf", "jpg", "jpeg", "png"];
// Microsoft Graph wants chunks in multiples of 320 KiB; 5 MiB is 16 of them.
const CHUNK = 5 * 1024 * 1024;

type Phase = "idle" | "uploading" | "done";

export default function UploadButton({
  caseId,
  docKey,
  label,
  variant = "primary",
  text,
}: {
  caseId: string;
  docKey: string | null;
  label: string;
  variant?: "primary" | "secondary";
  text?: string;
}) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
  }

  function close() {
    if (phase === "uploading") return;
    if (phase === "done") router.refresh();
    setOpen(false);
    reset();
  }

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (!EXT.includes(ext)) return setError(t.uploadDlg.badType);
    if (f.size > MAX) return setError(t.uploadDlg.tooLarge);
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setPhase("uploading");
    setError(null);
    try {
      const start = await fetch("/api/portal/upload/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, docKey, fileName: file.name, size: file.size }),
      });
      const s = await start.json();
      if (!start.ok) throw new Error(s?.error || t.uploadDlg.failed);

      let offset = 0;
      let item: any = null;
      while (offset < file.size) {
        const end = Math.min(offset + CHUNK, file.size);
        const res = await fetch(s.uploadUrl, {
          method: "PUT",
          headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
          body: file.slice(offset, end),
        });
        if (!res.ok && res.status !== 202) throw new Error(t.uploadDlg.failed);
        if (res.status === 200 || res.status === 201) item = await res.json();
        offset = end;
        setProgress(Math.round((offset / file.size) * 100));
      }
      if (!item?.id) throw new Error(t.uploadDlg.failed);

      const fin = await fetch("/api/portal/upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, docKey, itemId: item.id }),
      });
      const f = await fin.json();
      if (!fin.ok) throw new Error(f?.error || t.uploadDlg.failed);
      setPhase("done");
    } catch (err: any) {
      setPhase("idle");
      setError(err?.message || t.uploadDlg.failed);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "primary" ? `${btn.primary} h-9 px-4 text-[15px]` : `${btn.secondary} h-9 text-[15px]`}
      >
        <Upload size={17} /> {text || t.caseDetail.upload}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={t.uploadDlg.title(label)} onClick={close}>
          <div className="flex w-full max-w-[520px] flex-col gap-4 rounded-2xl border border-white/[.14] bg-[#1A2E20] p-6 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="m-0 text-[21px] font-semibold leading-tight">{t.uploadDlg.title(label)}</h2>
              <button type="button" onClick={close} aria-label={t.common.close} className="grid h-9 w-9 flex-none place-items-center rounded-full hover:bg-white/[.08]">
                <X size={20} />
              </button>
            </div>
            <p className="m-0 text-[15px] text-white/70">{t.uploadDlg.sub}</p>

            {phase === "done" ? (
              <div className="flex items-center gap-3 rounded-xl bg-[#CAF476]/15 p-4 text-[15px] text-[#DAF6A2]">
                <CheckCircle2 size={22} /> {t.uploadDlg.done}
              </div>
            ) : file ? (
              <div className="flex flex-col gap-3 rounded-xl bg-white/[.08] p-4">
                <div className="flex items-center gap-3">
                  <FileText size={22} className="flex-none text-[#CAF476]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{file.name}</div>
                    <div className="text-[13px] text-white/60">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                </div>
                {phase === "uploading" ? (
                  <div className="h-2 overflow-hidden rounded-full bg-white/[.14]" aria-label={t.uploadDlg.uploading}>
                    <div className="h-full bg-[#CAF476] transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                ) : null}
              </div>
            ) : (
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pick(e.dataTransfer.files?.[0]);
                }}
                className="flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-white/30 bg-white/[.04] px-5 py-8 text-center hover:border-[#CAF476] hover:bg-white/[.08]"
              >
                <Upload size={28} className="text-[#CAF476]" />
                <span className="text-[17px] font-medium">{t.uploadDlg.drop}</span>
                <span className="text-[13px] text-white/70">{t.uploadDlg.types}</span>
                <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            )}

            {error ? <div className="text-[14px] text-[#F3C4BF]">{error}</div> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} disabled={phase === "uploading"} className={`${btn.ghost} h-10 px-3 text-[15px] disabled:opacity-50`}>
                {phase === "done" ? t.common.close : t.common.cancel}
              </button>
              {phase !== "done" && file ? (
                <button type="button" onClick={upload} disabled={phase === "uploading"} className={`${btn.primary} h-10 px-5 text-[15px]`}>
                  <Upload size={17} /> {phase === "uploading" ? `${t.uploadDlg.uploading} ${progress}%` : t.caseDetail.upload}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
