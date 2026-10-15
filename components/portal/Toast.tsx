"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useT } from "@/components/portal/I18n";

/**
 * Toasts (handoff: after an upload, after a message). The provider sits in the portal shell,
 * so a toast survives the page refresh that follows an upload. Announced politely to screen
 * readers; gone after 3.8 s like the prototype's.
 */

const Ctx = createContext<(text: string) => void>(() => {});

export function useToast(): (text: string) => void {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(next);
    timer.current = setTimeout(() => setText(""), 3800);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[70] flex justify-center min-[900px]:bottom-[calc(24px+env(safe-area-inset-bottom))]"
      >
        {text ? (
          <div className="hq-in pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-xl border border-[#2F8F52]/40 bg-[#1A2E20] px-4 py-3 text-[15px] text-white shadow-[0_20px_50px_rgba(5,12,8,.5)]">
            <CheckCircle2 size={20} className="flex-none text-[#CAF476]" />
            <span className="min-w-0 flex-1">{text}</span>
            <button type="button" onClick={() => setText("")} aria-label={t.common.close} className="-mr-1 grid h-11 w-11 flex-none place-items-center min-[900px]:h-9 min-[900px]:w-9 rounded-full hover:bg-white/[.08]">
              <X size={18} />
            </button>
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
