"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, FileText, HardHat, Layers, Send, Sparkles, Store, Timer, Upload, X } from "lucide-react";
import { submitSpecialAction } from "@/app/portal/specialActions";
import { useT } from "@/components/portal/I18n";
import { showToast } from "@/components/portal/special/toast";
import { Eyebrow, Field, FormError, btn } from "@/components/portal/ui";
import {
  CUSTOMER_KINDS,
  DOCS_STEP,
  EMPTY_ANSWERS,
  LIMITS,
  REVIEW_STEP,
  SPECIAL_ACCEPT,
  SPECIAL_MAX_FILES,
  SPECIAL_TYPES,
  TIMEFRAMES,
  fileProblem,
  formatFileSize,
  reachableStep,
  stepErrors,
  summaryRows,
  type SpecialAnswers,
  type SpecialType,
} from "@/lib/portal/special";

/*
 * Spezialfinanzierung wizard (handoff 4, prototype screen «Spezialfinanzierung»): five
 * steps, a stepper that only jumps to steps whose predecessors are valid, uploads that
 * start the moment a file is picked, and a submit the server checks again.
 */

const ICONS: Record<SpecialType, typeof Layers> = {
  mezzanine: Layers,
  bauprojekt: HardHat,
  rendite: Building2,
  gewerbe: Store,
  ueberbrueckung: Timer,
  andere: Sparkles,
};

// Microsoft Graph wants chunks in multiples of 320 KiB; 5 MiB is 16 of them.
const CHUNK = 5 * 1024 * 1024;

type UploadItem = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "done" | "failed";
  progress: number;
  itemId?: string;
  error?: string;
};

const focusRing = "outline-none focus-visible:shadow-[0_0_0_3px_rgba(202,244,118,.55)]";
const labelCls = "text-[15px] font-semibold text-white";
// The select keeps the card colour (as in the prototype), so the native option list stays dark.
const controlCls =
  "w-full rounded-xl border border-white/[.14] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)]";

export default function SpecialWizard() {
  const t = useT();
  const s = t.special;
  const router = useRouter();
  const [a, setA] = useState<SpecialAnswers>(EMPTY_ANSWERS);
  const [ack, setAck] = useState(false);
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  // The draft request the uploads belong to; created by the first upload.
  const requestId = useRef<string | null>(null);
  const answersRef = useRef(a);
  answersRef.current = a;

  const set = (p: Partial<SpecialAnswers>) => setA((prev) => ({ ...prev, ...p }));
  const patchFile = (key: string, p: Partial<UploadItem>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));

  const errors = stepErrors(a, ack);
  const uploading = files.some((f) => f.status === "queued" || f.status === "uploading");
  const uploaded = files.filter((f) => f.status === "done" && f.itemId);
  const reach = uploading ? Math.min(reachableStep(a, ack), DOCS_STEP) : reachableStep(a, ack);
  const stepOk = errors[step] === null && !(step === DOCS_STEP && uploading);
  const canSubmit = errors.every((e) => e === null) && !uploading && !pending && !done;

  // One upload at a time: the first one creates the draft every later one goes into.
  useEffect(() => {
    if (files.some((f) => f.status === "uploading")) return;
    const next = files.find((f) => f.status === "queued");
    if (next) void upload(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function upload(item: UploadItem) {
    patchFile(item.key, { status: "uploading", progress: 0 });
    try {
      const { type, kunde } = answersRef.current;
      const start = await fetch("/api/portal/special/upload/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, type, kunde, fileName: item.file.name, size: item.file.size }),
      });
      const st = await start.json().catch(() => ({}));
      if (st?.requestId) requestId.current = st.requestId;
      if (!start.ok || !st?.uploadUrl) throw new Error(st?.error || s.err.upload);

      let offset = 0;
      let driveItem: any = null;
      while (offset < item.file.size) {
        const end = Math.min(offset + CHUNK, item.file.size);
        const res = await fetch(st.uploadUrl, {
          method: "PUT",
          headers: { "Content-Range": `bytes ${offset}-${end - 1}/${item.file.size}` },
          body: item.file.slice(offset, end),
        });
        if (!res.ok && res.status !== 202) throw new Error(s.err.upload);
        if (res.status === 200 || res.status === 201) driveItem = await res.json();
        offset = end;
        patchFile(item.key, { progress: Math.round((offset / item.file.size) * 100) });
      }
      if (!driveItem?.id) throw new Error(s.err.upload);

      const fin = await fetch("/api/portal/special/upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, itemId: driveItem.id }),
      });
      const f = await fin.json().catch(() => ({}));
      if (!fin.ok || !f?.file?.itemId) throw new Error(f?.error || s.err.upload);
      patchFile(item.key, { status: "done", progress: 100, itemId: f.file.itemId });
    } catch (err: any) {
      patchFile(item.key, { status: "failed", error: err?.message || s.err.upload });
    }
  }

  function addFiles(list: FileList | null | undefined) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    const fine = picked.filter((f) => !fileProblem(f.name, f.size));
    const bad = picked.length - fine.length;
    const room = Math.max(0, SPECIAL_MAX_FILES - files.length);
    const taken = fine.slice(0, room).map((file) => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, status: "queued" as const, progress: 0 }));
    if (taken.length) setFiles((fs) => [...fs, ...taken]);
    setFileNote(bad ? s.badFiles(bad) : fine.length > taken.length ? s.tooMany(SPECIAL_MAX_FILES) : null);
  }

  function removeFile(item: UploadItem) {
    setFiles((fs) => fs.filter((f) => f.key !== item.key));
    if (item.status === "done" && item.itemId && requestId.current) {
      void fetch("/api/portal/special/upload/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, itemId: item.itemId }),
      }).catch(() => {});
    }
  }

  function go(i: number) {
    setError(null);
    setStep(i);
    window.scrollTo(0, 0);
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await submitSpecialAction({ requestId: requestId.current, answers: a, ack, itemIds: uploaded.map((f) => f.itemId!) });
      if (!res.ok) {
        setError(res.error);
        if (typeof res.step === "number") setStep(res.step);
        return;
      }
      setDone(true);
      showToast(res.caseNr ? s.toastCase(res.caseNr) : s.toastStored, t.common.close);
      router.push(res.caseId ? `/portal/cases/${res.caseId}` : `/portal/spezialfinanzierung/${res.requestId}`);
    });
  }

  const type = a.type ? s.types[a.type] : null;
  const nameLabel = a.kundeTyp === "firma" ? s.nameCompany : s.namePerson;
  const textLen = a.beschreibung.trim().length;

  return (
    <>
      <ol aria-label={s.stepsLabel} className="m-0 grid list-none grid-cols-5 gap-2 p-0">
        {s.steps.map((label, i) => {
          const can = i <= reach;
          const on = i === step;
          return (
            <li key={label} className="min-w-0">
              <button
                type="button"
                disabled={!can}
                aria-current={on ? "step" : undefined}
                onClick={() => can && go(i)}
                className={`flex w-full flex-col gap-2 rounded-sm bg-transparent p-0 text-left text-white disabled:cursor-default ${focusRing}`}
              >
                <span className={`h-[3px] w-full rounded-sm ${i <= step ? "bg-[#CAF476]" : "bg-white/[.14]"}`} />
                <span className={`text-[13px] leading-snug ${on ? "font-semibold text-white" : i < step ? "text-white/70" : "text-white/45"}`}>
                  {i + 1} · {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-5 rounded-xl border border-white/[.08] bg-[#1A2E20] p-[clamp(20px,3vw,32px)]">
        {step === 0 ? (
          <>
            <Eyebrow accent>{s.typeTitle}</Eyebrow>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))" }}>
              {SPECIAL_TYPES.map((k) => {
                const Icon = ICONS[k];
                const on = a.type === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ type: k })}
                    className={`flex flex-col gap-2 rounded-xl border-[1.5px] p-[18px] text-left text-white transition-colors duration-[180ms] ${focusRing} ${
                      on ? "border-[#CAF476] bg-[#CAF476]/10" : "border-white/[.14] bg-white/[.04] hover:bg-white/[.08]"
                    }`}
                  >
                    <Icon size={24} strokeWidth={1.75} className="text-[#CAF476]" />
                    <span className="text-[17px] font-medium">{s.types[k].label}</span>
                    <span className="text-[13px] text-white/70">{s.types[k].text}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Eyebrow accent>{s.customerTitle}</Eyebrow>
            <div className="grid max-w-[420px] grid-cols-2 gap-2" role="group" aria-label={s.sum.kunde}>
              {CUSTOMER_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={a.kundeTyp === k}
                  onClick={() => set({ kundeTyp: k })}
                  className={`h-11 rounded-full border-[1.5px] text-[15px] font-medium transition-colors duration-[180ms] ${focusRing} ${
                    a.kundeTyp === k ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/30 text-white hover:bg-white/[.08]"
                  }`}
                >
                  {s.kinds[k]}
                </button>
              ))}
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))" }}>
              <Field
                label={nameLabel}
                placeholder={a.kundeTyp === "firma" ? s.nameCompanyPh : s.namePersonPh}
                value={a.kunde}
                maxLength={LIMITS.kunde}
                autoComplete="off"
                onChange={(e) => set({ kunde: e.target.value })}
              />
              <Field label={s.ort} placeholder={s.ortPh} value={a.ort} maxLength={LIMITS.ort} autoComplete="off" onChange={(e) => set({ ort: e.target.value })} />
              <Field
                label={s.kontakt}
                placeholder={s.kontaktPh}
                value={a.kontakt}
                maxLength={LIMITS.kontakt}
                autoComplete="off"
                onChange={(e) => set({ kontakt: e.target.value })}
              />
              <Field
                label={s.eigen}
                placeholder={s.eigenPh}
                value={a.eigenmittel}
                maxLength={LIMITS.eigenmittel}
                autoComplete="off"
                onChange={(e) => set({ eigenmittel: e.target.value })}
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Eyebrow accent>{s.projectTitle}</Eyebrow>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))" }}>
              <Field
                label={s.betrag}
                placeholder={s.betragPh}
                value={a.betrag}
                inputMode="numeric"
                maxLength={LIMITS.betrag}
                autoComplete="off"
                onChange={(e) => set({ betrag: e.target.value })}
              />
              <Field label={s.objekt} placeholder={s.objektPh} value={a.objekt} maxLength={LIMITS.objekt} autoComplete="off" onChange={(e) => set({ objekt: e.target.value })} />
            </div>
            <label className="flex max-w-[420px] flex-col gap-2">
              <span className={labelCls}>{s.zeit}</span>
              <select
                value={a.zeitrahmen}
                onChange={(e) => set({ zeitrahmen: e.target.value as SpecialAnswers["zeitrahmen"] })}
                className={`h-[50px] px-4 text-[17px] ${controlCls} bg-[#1A2E20]`}
              >
                {TIMEFRAMES.map((z) => (
                  <option key={z} value={z}>
                    {s.zeitOpts[z]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className={labelCls}>{s.text}</span>
              <textarea
                rows={7}
                value={a.beschreibung}
                maxLength={LIMITS.beschreibung}
                placeholder={s.textPh}
                onChange={(e) => set({ beschreibung: e.target.value })}
                className={`resize-y bg-white/[.08] px-3.5 py-3 text-[15px] leading-[1.4] ${controlCls}`}
              />
              <span className="text-[13px] text-white/45">{textLen < 20 ? s.textHint : s.textCount(textLen)}</span>
            </label>
          </>
        ) : null}

        {step === DOCS_STEP ? (
          <>
            <Eyebrow accent>{s.docsTitle}</Eyebrow>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] text-white/70">{s.docsHelpful(type ? type.label : s.docsAny)}</span>
              {type ? (
                <div className="flex flex-wrap gap-1.5">
                  {type.docs.map((d) => (
                    <span key={d} className="whitespace-nowrap rounded-full border border-white/20 px-[11px] py-[7px] text-[13px] leading-none">
                      {d}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <label
              onDragOver={(e: DragEvent) => e.preventDefault()}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-white/30 bg-white/[.04] px-5 py-8 text-center transition-colors duration-[180ms] hover:border-[#CAF476] hover:bg-white/[.08] focus-within:border-[#CAF476]"
            >
              <Upload size={28} className="text-[#CAF476]" />
              <span className="text-[17px] font-medium">{s.drop}</span>
              <span className="text-[13px] text-white/70">{s.dropTypes}</span>
              <input
                type="file"
                multiple
                accept={SPECIAL_ACCEPT}
                className="sr-only"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {fileNote ? <div className="text-[14px] text-[#F3C4BF]">{fileNote}</div> : null}
            {files.length ? (
              <div className="flex flex-col">
                {files.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-3 border-t border-white/[.14] py-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileText size={20} className="flex-none text-[#CAF476]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{f.file.name}</div>
                        <div className={`text-[13px] ${f.status === "failed" ? "text-[#F3C4BF]" : "text-white/70"}`}>
                          {f.status === "failed"
                            ? `${s.uploadFailed} · ${f.error || s.err.upload}`
                            : f.status === "done"
                              ? formatFileSize(f.file.size)
                              : `${formatFileSize(f.file.size)} · ${s.uploading}${f.status === "uploading" ? ` ${f.progress}%` : ""}`}
                        </div>
                        {f.status === "uploading" ? (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[.14]">
                            <div className="h-full bg-[#CAF476] transition-[width]" style={{ width: `${f.progress}%` }} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f)}
                      disabled={f.status === "uploading"}
                      aria-label={`${s.remove}: ${f.file.name}`}
                      title={s.remove}
                      className={`grid h-9 w-9 flex-none place-items-center rounded-full text-white hover:bg-white/[.08] disabled:opacity-40 ${focusRing}`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <span className="text-[13px] text-white/45">{s.docsLater}</span>
          </>
        ) : null}

        {step === REVIEW_STEP ? (
          <>
            <Eyebrow accent>{s.reviewTitle}</Eyebrow>
            <div className="grid gap-x-5 gap-y-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))" }}>
              {summaryRows(s, a, uploaded.length).map((r) => (
                <div key={r.k} className="flex flex-col gap-0.5 border-t border-white/[.14] pt-3">
                  <span className="text-[13px] text-white/70">{r.k}</span>
                  <span className="break-words text-[15px] font-medium">{r.v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-white/[.14] pt-3">
              <span className="text-[13px] text-white/70">{s.sum.text}</span>
              <span className="whitespace-pre-wrap break-words text-[15px]">{a.beschreibung}</span>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/85">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none cursor-pointer accent-[#CAF476]" />
              <span>{s.ack}</span>
            </label>
            {uploading ? <p className="m-0 text-[13px] text-white/60">{s.waitUploads}</p> : null}
          </>
        ) : null}

        <FormError>{error}</FormError>

        <div className="flex flex-wrap justify-between gap-3 border-t border-white/[.14] pt-2">
          <button type="button" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0 || pending} className={`${btn.ghost} h-9 self-center px-1 text-[16px] disabled:opacity-40`}>
            <ArrowLeft size={18} /> {s.back}
          </button>
          {step < REVIEW_STEP ? (
            <button type="button" onClick={() => go(step + 1)} disabled={!stepOk} className={`${btn.primary} h-11 text-[16px] ${focusRing}`}>
              {s.next} <ArrowRight size={18} />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!canSubmit} className={`${btn.primary} h-11 text-[16px] ${focusRing}`}>
              {pending || done ? s.submitting : s.submit} <Send size={18} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
