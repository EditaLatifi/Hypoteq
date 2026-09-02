"use client";

import { useEffect } from "react";

export interface ToastLine {
  text: string;
  /** The headline of the toast. Exactly one line should carry it. */
  big?: boolean;
}

/**
 * The confirmation the mockup shows after an action that changes something.
 *
 * It exists because several of this step's actions are otherwise invisible. Pressing
 * "Dokumentwert übernehmen" makes a warning panel disappear — which reads equally well as
 * "accepted" and as "dismissed", and the difference matters when the thing accepted is a
 * salary figure headed for a lender. The toast says which happened, and says the original
 * value survives in the history.
 *
 * Dismisses itself after 5.2 seconds, as the mockup does. It is a confirmation and not a
 * dialog: nothing is waiting on it, and a customer who has moved on should not have to close
 * an acknowledgement of something they already did.
 */
export default function FunnelToast({
  lines,
  onDone,
}: {
  lines: ToastLine[] | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!lines?.length) return;
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
    // Re-armed per toast, so a second action while one is showing restarts the clock rather
    // than inheriting the remains of the first one's.
  }, [lines, onDone]);

  if (!lines?.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 flex flex-col gap-1.5"
      style={{
        left: "50%",
        bottom: 96,
        transform: "translateX(-50%)",
        background: "var(--forest-800)",
        border: "1px solid var(--on-dark-14)",
        borderRadius: "var(--radius-md)",
        padding: "16px 20px",
        minWidth: 320,
        maxWidth: "min(92vw, 520px)",
        animation: "hqrise .3s var(--ease-out) both",
      }}
    >
      {lines.map((l, i) => (
        <span
          key={i}
          style={{
            fontSize: l.big ? "var(--text-body)" : "var(--text-body-sm)",
            fontWeight: l.big ? ("var(--weight-semibold)" as any) : ("var(--weight-regular)" as any),
            color: l.big ? "#fff" : "var(--on-dark-70)",
          }}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
