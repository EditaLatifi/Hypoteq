"use client";

import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFunnelV3, type Step } from "@/lib/funnel-v3/store";
import { reqList, type RequirementInstance } from "@/lib/funnel-v3/requirements";
import { requirementStatus } from "@/lib/funnel-v3/requirementStatus";
import { toUploadedFiles, type FileEntry } from "@/lib/funnel-v3/files";
import { validateScreen, type StepErrors } from "@/lib/funnel-v3/validate";
import { screenAt, stepCount, type Screen } from "@/lib/funnel-v3/steps";
import type { FunnelState } from "@/lib/funnel-v3/types";
import { fieldId, firstErrorField, visibleFields } from "./logic";
import { useFunnelUI } from "./uiStore";

/** The answer model, re-rendering only when one of its parts changes. */
export function useFunnelState(): FunnelState {
  return useFunnelV3(
    useShallow((s) => ({
      role: s.role,
      mode: s.mode,
      ans: s.ans,
      borrowers: s.borrowers,
      txt: s.txt,
      fin: s.fin,
      em: s.em,
      info: s.info,
      src: s.src,
      touched: s.touched,
      sig: s.sig,
    }))
  );
}

/** The current step, its screen and the mode's step count. */
export function useScreen(): { step: number; screen: Screen | null; total: number; mode: FunnelState["mode"] } {
  const { step, mode } = useFunnelV3(useShallow((s) => ({ step: s.step, mode: s.mode })));
  return { step, mode, screen: screenAt(mode, step), total: stepCount(mode) };
}

export interface Requirements {
  list: RequirementInstance[];
  /** Instance ids whose documents are complete («Erkannt»). */
  okIds: ReadonlySet<string>;
  fulfilled: number;
  total: number;
}

/** The live requirement list and, once files exist, how far it is fulfilled. */
export function useRequirements(): Requirements {
  const { ans, borrowers, txt, em, info } = useFunnelV3(
    useShallow((s) => ({ ans: s.ans, borrowers: s.borrowers, txt: s.txt, em: s.em, info: s.info }))
  );
  const files = useFunnelV3((s) => s.files);
  return useMemo(() => {
    const list = reqList({ ans, borrowers, txt, em, info });
    let okIds = new Set<string>();
    let fulfilled = 0;
    if (Array.isArray(files) && files.length) {
      try {
        const status = requirementStatus(list, toUploadedFiles(files as FileEntry[]));
        okIds = new Set(status.requirements.filter((r) => r.state === "ok").map((r) => r.instance.instanceId));
        fulfilled = status.counts.fulfilled;
      } catch {
        // An entry this code does not understand only costs the rail its ticks.
      }
    }
    return { list, okIds, fulfilled, total: list.length };
  }, [ans, borrowers, txt, em, info, files]);
}

/** Validation errors of a screen — only after «Weiter» was tried there (spec 1.6). */
export function useScreenErrors(screen: Screen | null): StepErrors {
  const shown = useFunnelUI((s) => (screen ? s.attempted.includes(screen) : false));
  const state = useFunnelState();
  return useMemo(() => (shown ? validateScreen(screen, state) : {}), [shown, screen, state]);
}

function focusField(field: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(fieldId(field));
  if (!el) return;
  const target =
    el.getAttribute("role") === "radiogroup" || el.getAttribute("role") === "group"
      ? ((el.querySelector('[role="radio"][tabindex="0"]') || el.querySelector("button")) as HTMLElement | null)
      : el;
  target?.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** Forward (validated), back, and jumps in the path (D6). Shared by buttons, arrows and keys. */
export function useFunnelNav() {
  const goNext = useCallback(() => {
    const s = useFunnelV3.getState();
    if (s.step <= 0 || s.step >= stepCount(s.mode)) return;
    const screen = screenAt(s.mode, s.step);
    const errors = validateScreen(screen, s);
    if (Object.keys(errors).length) {
      if (screen) useFunnelUI.getState().markAttempted(screen);
      const first = firstErrorField(errors, visibleFields(screen, s));
      if (first) requestAnimationFrame(() => focusField(first));
      return;
    }
    s.next();
  }, []);
  const goPrev = useCallback(() => {
    const s = useFunnelV3.getState();
    if (s.step > 0) s.back();
  }, []);
  const goTo = useCallback((n: number) => useFunnelV3.getState().goto(n as Step), []);
  return { goNext, goPrev, goTo };
}

/** Focus a field after the screen that holds it opened (a suggestion «Betrag eintragen»). */
export function focusFieldSoon(field: string): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => focusField(field), 120);
}
