"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "@/components/portal/I18n";

/*
 * Small pieces the profile cards share, in the style of the portal's upload dialog.
 */

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/[.14] bg-[#1A2E20] p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="m-0 text-[21px] font-semibold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="grid h-9 w-9 flex-none place-items-center rounded-full hover:bg-white/[.08]">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#CAF476]" : "bg-white/[.2]"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#132219] transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** A confirmation or an error inside a card (the portal has no toasts). */
export function Notice({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-[#E6A29C]/40 bg-[#B23B34]/15 px-4 py-3 text-[15px] text-[#F3C4BF]">
        {error}
      </div>
    );
  }
  if (ok) {
    return (
      <div role="status" className="rounded-xl bg-[#CAF476]/15 px-4 py-3 text-[15px] text-[#DAF6A2]">
        {ok}
      </div>
    );
  }
  return null;
}

export const inputClass =
  "w-full rounded-xl border border-white/[.14] bg-white/[.08] px-3.5 text-[15px] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)] disabled:opacity-50";

export const selectClass =
  "h-11 w-full rounded-xl border border-white/[.14] bg-[#1A2E20] px-3.5 text-[15px] text-white outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)]";

/** Upload a picked image to /api/portal/image/<kind>; returns an error text or null. */
export async function uploadImage(kind: "photo" | "logo", file: File, fallbackError: string): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch(`/api/portal/image/${kind}`, { method: "POST", body: fd });
    if (res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.error || fallbackError;
  } catch {
    return fallbackError;
  }
}
