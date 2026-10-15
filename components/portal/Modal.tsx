"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "@/components/portal/I18n";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The portal's dialog (handoff Dialog: forest card on a dimmed page). Keyboard behaviour of
 * a modal dialog: focus moves in on open and back to the trigger on close, Tab stays inside,
 * Esc closes. `onClose` may refuse (e.g. while an upload runs) simply by not closing.
 */
export default function Modal({
  open,
  onClose,
  title,
  sub,
  width = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = box.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first || box.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#050C08]/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="hq-in flex max-h-[calc(100vh-32px)] w-full flex-col gap-4 overflow-y-auto rounded-2xl border border-white/[.14] bg-[#1A2E20] p-6 text-white shadow-[0_30px_80px_rgba(3,8,5,.6)] outline-none"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} className="m-0 text-[21px] font-semibold leading-tight tracking-[-0.01em]">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="-mr-2 -mt-1 grid h-11 w-11 flex-none place-items-center rounded-full hover:bg-white/[.08]">
            <X size={20} />
          </button>
        </div>
        {sub ? <div className="-mt-2 text-[15px] text-white/70">{sub}</div> : null}
        {children}
      </div>
    </div>
  );
}
