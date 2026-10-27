"use client";

/**
 * The conversation of HYPO (Konzept Kap. 5): messages and HYPO's session, kept in sessionStorage
 * beside the funnel's own copy, so a reload resumes the chat as it resumes the funnel (Kap. 5.6).
 * The answers are not here — they are in the funnel store (lib/funnel-v3/store.ts).
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { initialSession, type HypoMessage, type HypoSession } from "@/lib/funnel-v3/hypo/session";

export interface HypoConfig {
  /** The start screen offers HYPO on this deployment. */
  enabled: boolean;
  /** The model can be asked; false = chips and plain answers only (Kap. 9 «Fallback»). */
  model: boolean;
  academy: Partial<Record<string, string>>;
}

interface HypoStore {
  session: HypoSession;
  messages: HypoMessage[];
  /** Files and Abgleich fields that already have their card in the chat. */
  shownFiles: string[];
  shownConflicts: string[];
  /** Not persisted: a turn is running (input locked, typing indicator). */
  busy: boolean;
  /** Not persisted: GET /api/hypo. */
  config: HypoConfig | null;
}

const memory: Record<string, string> = {};
const memoryStorage: StateStorage = {
  getItem: (k) => (k in memory ? memory[k] : null),
  setItem: (k, v) => {
    memory[k] = v;
  },
  removeItem: (k) => {
    delete memory[k];
  },
};

function sessionStore(): StateStorage {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) return window.sessionStorage;
  } catch {
    // blocked storage: the chat lives in memory
  }
  return memoryStorage;
}

export const HYPO_STORAGE_KEY = "hypoteq-hypo";

export const useHypo = create<HypoStore>()(
  persist(
    (): HypoStore => ({
      session: initialSession(),
      messages: [],
      shownFiles: [],
      shownConflicts: [],
      busy: false,
      config: null,
    }),
    {
      name: HYPO_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(sessionStore),
      skipHydration: true,
      partialize: (s) => ({ session: s.session, messages: s.messages, shownFiles: s.shownFiles, shownConflicts: s.shownConflicts }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<HypoStore>;
        return {
          ...current,
          session: p.session && typeof p.session === "object" ? { ...initialSession(), ...p.session } : current.session,
          messages: Array.isArray(p.messages) ? p.messages : [],
          shownFiles: Array.isArray(p.shownFiles) ? p.shownFiles : [],
          shownConflicts: Array.isArray(p.shownConflicts) ? p.shownConflicts : [],
        };
      },
    }
  )
);

/** Restores the chat from sessionStorage after mount (as useFunnelV3Hydration); true once done. */
export function useHypoHydration(): boolean {
  const [hydrated, setHydrated] = useState(() => useHypo.persist.hasHydrated());
  useEffect(() => {
    const unsub = useHypo.persist.onFinishHydration(() => setHydrated(true));
    if (!useHypo.persist.hasHydrated()) void useHypo.persist.rehydrate();
    else setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}

/** «Neuen Antrag stellen» / a new start in the chat. */
export function resetHypo(role: HypoSession["role"] = "kunde"): void {
  useHypo.setState({ session: initialSession(role), messages: [], shownFiles: [], shownConflicts: [], busy: false });
}

let configLoad: Promise<HypoConfig> | null = null;

/** GET /api/hypo once per page; HYPO off when it cannot be read. */
export function loadHypoConfig(): Promise<HypoConfig> {
  if (!configLoad) {
    configLoad = fetch("/api/hypo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j): HypoConfig => ({ enabled: j?.enabled === true, model: j?.model === true, academy: j?.academy && typeof j.academy === "object" ? j.academy : {} }))
      .catch((): HypoConfig => ({ enabled: false, model: false, academy: {} }))
      .then((c) => {
        useHypo.setState({ config: c });
        return c;
      });
  }
  return configLoad;
}
