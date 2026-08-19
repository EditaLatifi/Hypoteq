"use client";

import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Nachreich page (spec V2): "Link führt zu einer personalisierten Nachreich-Seite (nur
 * fehlende Felder)".
 *
 * The token in the URL is the only credential, so this page asks the server what is
 * missing rather than trusting anything the client could have edited, and it never
 * displays dossier details — just the outstanding document fields and an upload control
 * for each.
 */

type Phase = "loading" | "ready" | "invalid" | "submitting" | "done";

interface PendingFile {
  id: string;
  file: File;
  docType: string;
}

export default function NachreichenPage({
  params,
}: {
  params: { locale: string; token: string };
}) {
  const locale = (["de", "fr", "it", "en"].includes(params.locale) ? params.locale : "de") as
    | "de"
    | "fr"
    | "it"
    | "en";
  // Driven by the URL, not by localStorage: this page is reached from a link in an e-mail,
  // usually on a device that has never opened the funnel, so there is no stored language
  // preference to fall back on — and defaulting to German for a French customer would make
  // the one page they were sent unreadable.
  const { t } = useTranslation(locale);

  const [phase, setPhase] = useState<Phase>("loading");
  const [reason, setReason] = useState<string>("");
  const [missing, setMissing] = useState<string[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string>("");
  const [nowComplete, setNowComplete] = useState(false);
  const [stillMissing, setStillMissing] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/nachreichen/${params.token}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.valid) {
          setReason(json?.reason || "not_found");
          setPhase("invalid");
          return;
        }
        setMissing(json.missing || []);
        setEmail(json.email || null);
        setFolderId(json.folderId || null);
        setSubmissionId(json.submissionId || null);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setReason("not_found");
          setPhase("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    const added = Array.from(picked).map((file) => ({ id: uuidv4(), file, docType }));
    // Re-picking replaces this document's selection instead of accumulating, so the tile
    // always shows what will actually be sent.
    setFiles((prev) => [...prev.filter((f) => f.docType !== docType), ...added]);
    e.target.value = "";
  };

  const uploadOne = useCallback(
    async (file: File, currentFolderId: string | null) => {
      const startRes = await fetch("/api/upload-doc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          email,
          // Keys the folder to the original submission, so what arrives now sits beside
          // the documents that came with it.
          inquiryId: submissionId,
          folderId: currentFolderId,
        }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson?.uploadUrl) {
        throw new Error(startJson?.details || startJson?.error || "upload start failed");
      }

      // 5 MiB chunks — a multiple of 320 KiB, as Microsoft Graph requires.
      const CHUNK = 5 * 1024 * 1024;
      let offset = 0;
      let item: any = null;
      while (offset < file.size) {
        const end = Math.min(offset + CHUNK, file.size);
        const res = await fetch(startJson.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(end - offset),
            "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
          },
          body: file.slice(offset, end),
        });
        if (!res.ok && res.status !== 202) throw new Error(`upload failed (${res.status})`);
        if (res.status !== 202) item = await res.json().catch(() => null);
        offset = end;
      }
      return { folderId: startJson.folderId as string, webUrl: item?.webUrl ?? null };
    },
    [email, submissionId]
  );

  const submit = async () => {
    if (files.length === 0) return;
    setPhase("submitting");
    setError("");
    try {
      let currentFolder = folderId;
      const uploaded: Array<{ name: string; url: string | null }> = [];
      for (const pending of files) {
        const out = await uploadOne(pending.file, currentFolder);
        if (!currentFolder && out.folderId) currentFolder = out.folderId;
        uploaded.push({ name: pending.file.name, url: out.webUrl });
      }

      const res = await fetch(`/api/nachreichen/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providedKeys: Array.from(new Set(files.map((f) => f.docType))),
          files: uploaded,
          locale,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || json?.reason || "submit failed");

      setNowComplete(json.complete === true);
      setStillMissing(json.remaining || []);
      setPhase("done");
    } catch (e: any) {
      setError(e?.message || "unknown error");
      setPhase("ready");
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full min-h-screen flex justify-center px-4 py-12 md:py-20 font-sfpro">
      <div className="w-full max-w-[760px]">{children}</div>
    </div>
  );

  if (phase === "loading") {
    return (
      <Shell>
        <p className="text-center text-[#132219]/60">{t("nachreichen.loading" as any)}</p>
      </Shell>
    );
  }

  if (phase === "invalid") {
    const key =
      reason === "expired"
        ? "nachreichen.expired"
        : reason === "already_complete"
          ? "nachreichen.alreadyComplete"
          : "nachreichen.notFound";
    return (
      <Shell>
        <div className="bg-white border border-[#F0F0F0] rounded-2xl md:rounded-3xl p-8 md:p-10 text-center shadow-sm">
          <h1 className="text-[24px] md:text-[28px] font-semibold text-[#132219] mb-3">
            {t("nachreichen.title" as any)}
          </h1>
          <p className="text-[15px] text-[#132219]/70">{t(key as any)}</p>
        </div>
      </Shell>
    );
  }

  if (phase === "done") {
    return (
      <Shell>
        <div className="bg-white border border-[#F0F0F0] rounded-2xl md:rounded-3xl p-8 md:p-10 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#CAF476] flex items-center justify-center">
            <svg className="w-7 h-7 text-[#132219]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[24px] md:text-[28px] font-semibold text-[#132219] mb-3">
            {t(nowComplete ? ("nachreichen.doneComplete" as any) : ("nachreichen.donePartial" as any))}
          </h1>
          {!nowComplete && stillMissing.length > 0 && (
            <ul className="mt-4 text-left inline-block text-[14px] text-[#132219]/75 list-disc pl-5">
              {stillMissing.map((k) => (
                <li key={k} className="mb-1">{t(k as any)}</li>
              ))}
            </ul>
          )}
        </div>
      </Shell>
    );
  }

  const busy = phase === "submitting";

  return (
    <Shell>
      <div className="text-center mb-8 md:mb-10">
        <h1 className="text-[26px] sm:text-[30px] md:text-[34px] font-semibold text-[#132219] tracking-tight">
          {t("nachreichen.title" as any)}
        </h1>
        <p className="mt-3 text-[14px] md:text-[15px] text-[#132219]/70 max-w-[520px] mx-auto leading-relaxed">
          {t("nachreichen.intro" as any)}
        </p>
      </div>

      <div className="bg-white shadow-sm rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-10 border border-[#F0F0F0]">
        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          {missing.map((doc) => {
            const picked = files.filter((f) => f.docType === doc);
            const saved = picked.length > 0;
            return (
              <label
                key={doc}
                className={`flex items-center justify-between gap-3 px-4 sm:px-5 md:px-6 py-3 sm:py-3.5 md:py-4
                  cursor-pointer rounded-xl md:rounded-2xl shadow-sm border transition-all
                  ${saved ? "bg-[#EAF7D8] border-[#CAEBAA]" : "bg-[#FFFDF5] border-[#F0D48A] hover:bg-[#FFF8E6]"}`}
              >
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={busy}
                  onChange={(e) => onPick(e, doc)}
                />
                <span className="text-[13px] sm:text-[14px] md:text-[15px] text-[#132219] leading-tight break-words">
                  {t(doc as any)}
                  <span className="text-[#C0392B] font-semibold"> *</span>
                  {saved && (
                    <span className="block text-[11px] sm:text-[12px] text-[#132219]/60 mt-0.5">
                      {picked.map((f) => f.file.name).join(", ")}
                    </span>
                  )}
                </span>
                <div
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 border transition
                    ${saved ? "bg-[#CAF476] border-[#132219]" : "bg-white border-gray-300"}`}
                >
                  {saved ? (
                    <svg className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#132219]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    // Same affordance as the funnel: an upload arrow until a file is
                    // attached, so the control reads as "put a document here".
                    <svg
                      className="w-3.5 h-3.5 md:w-[17px] md:h-[17px] text-[#132219]/50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
                    </svg>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {error && (
          <p className="mt-5 text-[13px] text-[#C0392B]">{t("nachreichen.error" as any)} {error}</p>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={submit}
            disabled={busy || files.length === 0}
            className={`px-8 md:px-10 py-3 bg-[#CAF476] rounded-full font-medium text-[#132219] shadow
              hover:bg-[#BCDF6A] transition-colors text-sm md:text-base
              ${busy || files.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {busy ? t("nachreichen.sending" as any) : t("nachreichen.send" as any)}
          </button>
        </div>
      </div>
    </Shell>
  );
}
