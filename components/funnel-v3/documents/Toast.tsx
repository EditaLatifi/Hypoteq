"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastLine {
  text: string;
  big?: boolean;
}

/** Prototype toast: one message at a time, gone after six seconds. */
export function useToast(): { lines: ToastLine[] | null; say: (lines: (ToastLine | null | false)[]) => void } {
  const [lines, setLines] = useState<ToastLine[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((next: (ToastLine | null | false)[]) => {
    const clean = next.filter((l): l is ToastLine => Boolean(l));
    if (timer.current) clearTimeout(timer.current);
    setLines(clean.length ? clean : null);
    timer.current = setTimeout(() => setLines(null), 6000);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { lines, say };
}

export default function Toast({ lines }: { lines: ToastLine[] | null }) {
  if (!lines) return null;
  return (
    <div className="v3-toast" role="status" aria-live="polite">
      {lines.map((l, i) => (
        <span key={i} className={`v3-toast-line${l.big ? " v3-toast-line--big" : ""}`}>
          {l.text}
        </span>
      ))}
    </div>
  );
}
