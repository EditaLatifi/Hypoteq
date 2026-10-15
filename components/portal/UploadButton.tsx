"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Upload } from "lucide-react";
import Modal from "@/components/portal/Modal";
import { useT } from "@/components/portal/I18n";
import { useToast } from "@/components/portal/Toast";
import { ProgressBar, btn } from "@/components/portal/ui";

const MAX = 20 * 1024 * 1024;
const EXT = ["pdf", "jpg", "jpeg", "png"];
// Microsoft Graph wants chunks in multiples of 320 KiB; 5 MiB is 16 of them.
const CHUNK = 5 * 1024 * 1024;

type Phase = "idle" | "uploading" | "done";

function sizeLabel(bytes: number): string {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * «Dokument hochladen» and its dialog (handoff «Case Detail» 5): drag & drop or choose a
 * file, PDF/JPG/JPEG/PNG up to 20 MB, a progress bar, then «Hochgeladen», a toast and — once
 * the dialog closes — the refreshed Case with the new entry under «Letzte Updates». The file
 * goes from the browser straight into the Case's SharePoint folder; the server checks the
 * request before and the result after (app/api/portal/upload).
 */
export default function UploadButton({
  caseId,
  docKey,
  label,
  context,
  variant = "primary",
  text,
}: {
  caseId: string;
  docKey: string | null;
  label: string;
  /** «Kunde · Case-Nr · Kategorie» under the dialog title. */
  context?: string;
  variant?: "primary" | "secondary";
  text?: string;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

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
    setProgress(1);
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
        setProgress(Math.max(1, Math.round((offset / file.size) * 100)));
      }
      if (!item?.id) throw new Error(t.uploadDlg.failed);

      const fin = await fetch("/api/portal/upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, docKey, itemId: item.id }),
      });
      const f = await fin.json();
      if (!fin.ok) throw new Error(f?.error || t.uploadDlg.failed);
      setProgress(100);
      setPhase("done");
      toast(t.uploadDlg.toast(label));
    } catch (err: any) {
      setPhase("idle");
      setProgress(0);
      setError(err?.message || t.uploadDlg.failed);
    }
  }

  const isImage = !!file && /\.(jpe?g|png)$/i.test(file.name);
  const meta = !file ? "" : `${sizeLabel(file.size)} · ${phase === "done" ? t.uploadDlg.done : phase === "uploading" ? t.uploadDlg.uploading : t.uploadDlg.ready}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`${variant === "primary" ? `${btn.primary} px-4` : btn.secondary} h-11 text-[15px] min-[900px]:h-9`}
      >
        <Upload size={17} aria-hidden /> {text || t.caseDetail.upload}
      </button>

      <Modal open={open} onClose={close} title={t.uploadDlg.title(label)} sub={context}>
        <p className="m-0 text-[15px] text-white/70">{t.uploadDlg.sub}</p>

        {file ? (
          <div className="flex flex-col gap-3 rounded-xl bg-white/[.08] p-4">
            <div className="flex items-center gap-3">
              {isImage ? <ImageIcon size={22} aria-hidden className="flex-none text-[#CAF476]" /> : <FileText size={22} aria-hidden className="flex-none text-[#CAF476]" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{file.name}</div>
                <div className="text-[13px] text-white/70">{meta}</div>
              </div>
            </div>
            <ProgressBar value={progress} label={t.uploadDlg.uploading} showValue />
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed px-5 py-8 text-center transition-colors duration-200 ease-out hover:border-[#CAF476] hover:bg-white/[.08] focus-within:border-[#CAF476] ${
              dragging ? "border-[#CAF476] bg-white/[.08]" : "border-white/30 bg-white/[.04]"
            }`}
          >
            <Upload size={28} aria-hidden className="text-[#CAF476]" />
            <span className="text-[17px] font-medium">{t.uploadDlg.drop}</span>
            <span className="text-[13px] text-white/70">{t.uploadDlg.types}</span>
            <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}

        {error ? (
          <div role="alert" className="text-[14px] text-[#F3C4BF]">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={close} disabled={phase === "uploading"} className={`${btn.ghost} h-11 rounded-full px-3 text-[15px] disabled:opacity-50 min-[900px]:h-10`}>
            {phase === "done" ? t.common.close : t.common.cancel}
          </button>
          {phase !== "done" && file ? (
            <button type="button" onClick={upload} disabled={phase === "uploading"} className={`${btn.primary} h-11 px-5 text-[15px] min-[900px]:h-10`}>
              <Upload size={17} aria-hidden /> {phase === "uploading" ? `${t.uploadDlg.uploading} ${progress} %` : t.caseDetail.upload}
            </button>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
