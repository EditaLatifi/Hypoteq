"use client";

/**
 * Partner recognition for the Berater entry (spec 2.2, DECISIONS D13).
 *
 * POST /api/partner/recognize { email } ~400 ms after the address becomes syntactically valid.
 * The answer is kept in a small store so the header («Erfasst von {Name}») and step 1 read the
 * same result. A failed or degraded lookup is «unknown»: the partner sees the «Noch kein
 * Partner?» form and the funnel carries on — recognition never blocks.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { isLookupEmail, normalisePartner, type PartnerInfo } from "./logic";

export const PARTNER_DEBOUNCE_MS = 400;

interface PartnerLookupState {
  /** The address the result belongs to (trimmed, lower case). */
  email: string;
  loading: boolean;
  result: PartnerInfo | null;
}

export const usePartnerLookup = create<PartnerLookupState>(() => ({ email: "", loading: false, result: null }));

/** Answers per address for this page session; degraded answers are not cached. */
const cache = new Map<string, PartnerInfo>();

/** Runs the lookup for the Berater e-mail. Call once, at the funnel root. */
export function usePartnerRecognition(email: string, enabled: boolean): void {
  useEffect(() => {
    const raw = (email || "").trim();
    const key = raw.toLowerCase();
    if (!enabled || !isLookupEmail(raw)) {
      usePartnerLookup.setState({ email: key, loading: false, result: null });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      usePartnerLookup.setState({ email: key, loading: false, result: cached });
      return;
    }
    // Keep the previous answer visible only if it is for this very address.
    const prev = usePartnerLookup.getState();
    usePartnerLookup.setState({ email: key, loading: true, result: prev.email === key ? prev.result : null });

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      let result: PartnerInfo;
      try {
        const res = await fetch("/api/partner/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: raw }),
          signal: ctrl.signal,
        });
        result = res.ok ? normalisePartner(await res.json()) : { status: "unknown", degraded: true };
      } catch {
        if (ctrl.signal.aborted) return;
        result = { status: "unknown", degraded: true };
      }
      if (ctrl.signal.aborted) return;
      if (!result.degraded) cache.set(key, result);
      usePartnerLookup.setState({ email: key, loading: false, result });
    }, PARTNER_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [email, enabled]);
}
