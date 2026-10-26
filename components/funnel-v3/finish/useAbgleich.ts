"use client";

/**
 * The funnel against the documents in the browser (Spezifikation Datenabgleich 3, 4): HYPOTEQ's
 * Prüfregeln from /api/funnel/pruefregeln (read once per page; the built-in start values until
 * they arrive or when they do not), evaluated over the answers, the placed files and the
 * customer's choices. The server evaluates the same again for Salesforce.
 */

import { useEffect, useMemo, useState } from "react";
import { evaluateAbgleich, type AbgleichResult } from "@/lib/funnel-v3/abgleich/evaluate";
import { FALLBACK_RULES, type PruefRegel } from "@/lib/funnel-v3/abgleich/rules";
import { useDocumentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelState } from "../hooks";

let loaded: Promise<readonly PruefRegel[]> | null = null;

function fetchRules(): Promise<readonly PruefRegel[]> {
  if (!loaded) {
    loaded =
      typeof fetch !== "function"
        ? Promise.resolve(FALLBACK_RULES)
        : fetch("/api/funnel/pruefregeln", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => (j && Array.isArray(j.rules) && j.rules.length ? (j.rules as PruefRegel[]) : FALLBACK_RULES))
            .catch(() => FALLBACK_RULES);
  }
  return loaded;
}

export function usePruefregeln(): readonly PruefRegel[] {
  const [rules, setRules] = useState<readonly PruefRegel[]>(FALLBACK_RULES);
  useEffect(() => {
    let alive = true;
    void fetchRules().then((r) => alive && setRules(r));
    return () => {
      alive = false;
    };
  }, []);
  return rules;
}

export function useAbgleich(): AbgleichResult & { reading: boolean } {
  const state = useFunnelState();
  const choices = useFunnelV3((s) => s.choices);
  const summary = useDocumentsSummary();
  const rules = usePruefregeln();
  return useMemo(() => {
    const docs = summary.files
      .filter((f) => f.uploadState === "uploaded")
      .map((f) => ({ id: f.id, instanceId: f.instanceId ?? null, analysis: f.analysis, extraKind: summary.placements.get(f.id)?.extraKind ?? null, humanEdits: f.humanEdits ?? null }));
    return { ...evaluateAbgleich({ state, docs, rules, choices }), reading: summary.busy > 0 };
  }, [state, choices, summary, rules]);
}
