"use client";

/**
 * Partner Fast Lead in the funnel (DECISIONS P39). The customer's personal link is
 * `/{lang}/funnel?lead=<token>`: the funnel asks /api/funnel/lead/[token] who invited them and
 * fills their contact into the empty fields (store applyLead). The token then leaves the address
 * bar — it stays in the session (sessionStorage) and goes with the submit, where the server
 * credits the partner. An invitation that is used, expired or unknown opens the funnel as the
 * customer's own request; nothing blocks.
 */

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { normaliseLeadAnswer } from "./logic";

/** The `lead` parameter out of the address bar, without a navigation. */
function dropLeadParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("lead")) return;
    url.searchParams.delete("lead");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* the address keeps it; harmless */
  }
}

export async function openLead(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`/api/funnel/lead/${encodeURIComponent(token)}`, { cache: "no-store" });
    const answer = normaliseLeadAnswer(await res.json().catch(() => null));
    if (!answer) return false;
    useFunnelV3.getState().applyLead({ token, ...answer.lead }, answer.customer);
    return true;
  } catch {
    return false;
  } finally {
    dropLeadParam();
  }
}
