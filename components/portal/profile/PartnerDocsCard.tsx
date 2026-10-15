"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { useT } from "@/components/portal/I18n";
import { Dialog, Notice, selectClass } from "@/components/portal/profile/bits";
import { Badge, Card, Eyebrow, btn } from "@/components/portal/ui";
import type { Tone } from "@/lib/portal/status";

export type PartnerDocRow = { id: string; kind: string; fileName: string; uploadedOn: string; status: string; tone: Tone };

const MAX = 20 * 1024 * 1024;
// Microsoft Graph wants chunks in multiples of 320 KiB; 5 MiB is 16 of them.
const CHUNK = 5 * 1024 * 1024;

/**
 * «Eigene Dokumente»: the partner company's own papers, with the status HYPOTEQ gives
 * them. Opened through the portal only (/api/portal/partner-docs/<id>), never by a link
 * into SharePoint.
 */
export default function PartnerDocsCard({ docs, canUpload, noAccount }: { docs: PartnerDocRow[]; canUpload: boolean; noAccount: boolean }) {
  const t = useT();
  const tx = t.profileExtra.docs;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  return (
    <Card className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow accent>{tx.title}</Eyebrow>
        {canUpload ? (
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setOpen(true);
            }}
            className={`${btn.secondary} h-9 border-white/30 text-[15px]`}
          >
            <Upload size={16} /> {tx.add}
          </button>
        ) : null}
      </div>
      <p className="m-0 text-[15px] text-white/70">{noAccount ? tx.noAccount : tx.text}</p>
      <Notice ok={done} />
      {docs.length ? (
        <div className="flex flex-col">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-4 border-t border-white/[.14] py-3">
              <a href={`/api/portal/partner-docs/${d.id}`} className="group flex min-w-0 items-center gap-3" title={tx.download}>
                <FileText size={20} className="flex-none text-[#CAF476]" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium group-hover:text-[#DAF6A2]">{tx.kinds[d.kind] || d.kind}</span>
                  <span className="block truncate text-[13px] text-white/70">
                    {d.fileName} · {tx.uploadedOn(d.uploadedOn)}
                  </span>
                </span>
              </a>
              <div className="flex flex-none items-center gap-2">
                <Badge tone={d.tone}>{tx.status[d.status] || d.status}</Badge>
                <a href={`/api/portal/partner-docs/${d.id}`} aria-label={`${tx.download}: ${d.fileName}`} className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/[.08] hover:text-white">
                  <Download size={17} />
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : !noAccount ? (
        <p className="m-0 border-t border-white/[.14] pt-3 text-[15px] text-white/70">{tx.empty}</p>
      ) : null}

      {open ? (
        <UploadDialog
          onClose={() => setOpen(false)}
          onDone={(name) => {
            setOpen(false);
            setDone(tx.uploaded(name));
          }}
        />
      ) : null}
    </Card>
  );
}

function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const t = useT();
  const tx = t.profileExtra.docs;
  const router = useRouter();
  const [kind, setKind] = useState("handelsregister");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress !== null;

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return setError(tx.badType);
    if (f.size > MAX) return setError(tx.tooLarge);
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setProgress(0);
    setError(null);
    try {
      const start = await fetch("/api/portal/partner-docs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, fileName: file.name, size: file.size }),
      });
      const s = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(s?.error || tx.failed);

      let offset = 0;
      let item: any = null;
      while (offset < file.size) {
        const end = Math.min(offset + CHUNK, file.size);
        const res = await fetch(s.uploadUrl, {
          method: "PUT",
          headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
          body: file.slice(offset, end),
        });
        if (!res.ok && res.status !== 202) throw new Error(tx.failed);
        if (res.status === 200 || res.status === 201) item = await res.json();
        offset = end;
        setProgress(Math.round((offset / file.size) * 100));
      }
      if (!item?.id) throw new Error(tx.failed);

      const fin = await fetch("/api/portal/partner-docs/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, itemId: item.id }),
      });
      const f = await fin.json().catch(() => ({}));
      if (!fin.ok) throw new Error(f?.error || tx.failed);
      router.refresh();
      onDone(file.name);
    } catch (err: any) {
      setProgress(null);
      setError(err?.message || tx.failed);
    }
  }

  return (
    <Dialog title={tx.dialogTitle} onClose={() => !uploading && onClose()}>
      <p className="m-0 text-[15px] text-white/70">{tx.dialogSub}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-white/70">{tx.kind}</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={uploading} className={selectClass}>
          {Object.keys(tx.kinds).map((k) => (
            <option key={k} value={k}>
              {tx.kinds[k]}
            </option>
          ))}
        </select>
      </label>

      {file ? (
        <div className="flex flex-col gap-3 rounded-xl bg-white/[.08] p-4">
          <div className="flex items-center gap-3">
            <FileText size={22} className="flex-none text-[#CAF476]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{file.name}</div>
              <div className="text-[13px] text-white/60">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
          </div>
          {uploading ? (
            <div className="h-2 overflow-hidden rounded-full bg-white/[.14]" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
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
          className="flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-white/30 bg-white/[.04] px-5 py-8 text-center hover:border-[#CAF476] hover:bg-white/[.08] focus-within:border-[#CAF476]"
        >
          <Upload size={28} className="text-[#CAF476]" />
          <span className="text-[17px] font-medium">{t.uploadDlg.drop}</span>
          <span className="text-[13px] text-white/70">{t.uploadDlg.types}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}

      <Notice error={error} />

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={uploading} className={`${btn.ghost} h-10 px-3 text-[15px] disabled:opacity-50`}>
          {t.common.cancel}
        </button>
        {file ? (
          <button type="button" onClick={upload} disabled={uploading} className={`${btn.primary} h-10 px-5 text-[15px]`}>
            <Upload size={17} /> {uploading ? `${t.uploadDlg.uploading} ${progress}%` : tx.upload}
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
