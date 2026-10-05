"use client";

/**
 * View state of the funnel shell that is not part of the answers and is not persisted:
 * which steps have had a «Weiter» attempt (errors show only after one, spec 1.6) and whether
 * the collapsed rail is open on narrow screens.
 */

import { create } from "zustand";

interface FunnelUIState {
  attempted: number[];
  railOpen: boolean;
  markAttempted: (step: number) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
}

export const useFunnelUI = create<FunnelUIState>((set) => ({
  attempted: [],
  railOpen: false,
  markAttempted: (step) => set((s) => (s.attempted.includes(step) ? {} : { attempted: [...s.attempted, step] })),
  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
}));
