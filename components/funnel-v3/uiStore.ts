"use client";

/**
 * View state of the funnel shell that is not part of the answers and is not persisted:
 * which screens have had a «Weiter» attempt (errors show only after one, spec 1.6) — kept per
 * screen, not per step number, since a mode switch renumbers the steps (steps.ts) — whether
 * the collapsed rail is open on narrow screens, the one toast of the funnel (prototype
 * `say`: one message at a time, gone after six seconds), the way back of a «Bearbeiten» link
 * and the closing's outcome.
 */

import { create } from "zustand";
import type { Screen } from "@/lib/funnel-v3/steps";
import type { ToastLine } from "./documents/Toast";
import type { DoneInfo } from "./finish/doneState";

export const TOAST_MS = 6000;

interface FunnelUIState {
  attempted: Screen[];
  railOpen: boolean;
  toast: ToastLine[] | null;
  /**
   * The screen a «Bearbeiten» link on the last step came from (Spezifikation Datenabgleich
   * 2.1): while set, the edited screen offers «Zurück zu …» instead of «Weiter».
   */
  returnTo: Screen | null;
  /** The closing went through: the confirmation page shows (doneState.ts keeps it per submission). */
  done: DoneInfo | null;
  /** «Abschliessen» found differences: the Abgleich page shows before the submit (Spezifikation Datenabgleich 3). */
  reviewing: boolean;
  markAttempted: (screen: Screen) => void;
  setReturnTo: (screen: Screen | null) => void;
  setDone: (done: DoneInfo | null) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  /** Show a toast; empty lines are dropped, an empty list hides it. */
  say: (lines: (ToastLine | null | false | undefined)[]) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useFunnelUI = create<FunnelUIState>((set) => ({
  attempted: [],
  railOpen: false,
  toast: null,
  returnTo: null,
  done: null,
  reviewing: false,
  markAttempted: (screen) => set((s) => (s.attempted.includes(screen) ? {} : { attempted: [...s.attempted, screen] })),
  setReturnTo: (returnTo) => set((s) => (s.returnTo === returnTo ? {} : { returnTo })),
  setDone: (done) => set({ done }),
  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
  say: (lines) => {
    const clean = lines.filter((l): l is ToastLine => Boolean(l));
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: clean.length ? clean : null });
    toastTimer = setTimeout(() => set({ toast: null }), TOAST_MS);
  },
}));
