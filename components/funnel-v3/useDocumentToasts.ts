"use client";

import { useEffect, useRef } from "react";
import { useDocumentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { prefilledCount } from "@/lib/funnel-v3/prefill";
import type { RequirementInstance } from "@/lib/funnel-v3/requirements";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { ToastLine } from "./documents/Toast";
import { factAdditions, reasonLine } from "./logic";
import { useFunnelUI } from "./uiStore";

/**
 * The funnel's short messages about the documents, wherever the customer is (prototype
 * resolveFile «last»): when a batch of uploads is read — files processed, requirements met,
 * values taken over (Schnellanmeldung), points to check, extras — and when the list grew
 * because a document showed a bonus, a Lohnerhöhung or «ab 50» (Handover 4.2 «Die Liste
 * wächst nach dem Upload; der Nutzer sieht eine kurze Meldung»). Growth during a batch joins
 * the batch's message, so one message says it all.
 */
export function useDocumentToasts(enabled: boolean): void {
  const { t, opt } = useFunnelT();
  const say = useFunnelUI((s) => s.say);
  const summary = useDocumentsSummary();
  const info = useFunnelV3((s) => s.info);
  const mode = useFunnelV3((s) => s.mode);
  const src = useFunnelV3((s) => s.src);
  const busy = summary.busy;
  const list = summary.instances;

  const prevList = useRef<RequirementInstance[] | null>(null);
  const prevInfo = useRef(info);
  const grown = useRef<ToastLine[]>([]);
  const wasBusy = useRef(false);

  // The list grew from the documents' facts.
  useEffect(() => {
    if (!enabled) return;
    const before = prevList.current;
    const infoChanged = prevInfo.current !== info;
    prevList.current = list;
    prevInfo.current = info;
    if (!before || !infoChanged) return;
    const added = factAdditions(before, list);
    if (!added.length) return;
    const lines = added.map((r) => ({ text: `+ ${t(r.labelKey)} · ${reasonLine(r.reason, t, opt)}` }));
    if (busy > 0) grown.current.push(...lines);
    else say([{ text: t("docs.toast.grew", { n: added.length }), big: true }, ...lines]);
    // Only the list and the facts matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, info, enabled]);

  // A batch is through.
  useEffect(() => {
    if (!enabled) return;
    if (busy > 0) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    const c = summary.status.counts;
    const files = summary.files;
    const done = files.filter((f) => f.analysisState === "done").length;
    const extraN = files.filter((f) => !f.instanceId && ["surplus", "notneeded", "duplicate"].includes(summary.placements.get(f.id)?.extraKind ?? "")).length;
    const failed = files.filter((f) => f.uploadState === "failed").length;
    const warn = c.partial + c.outdated;
    const taken = mode === "schnell" ? prefilledCount(src) : 0;
    const growth = grown.current;
    grown.current = [];
    say([
      { text: "✓ " + t("toast.done", { files: done, req: c.ok }), big: true },
      taken ? { text: "✓ " + t("toast.prefilled", { n: taken }) } : summary.fieldsRead ? { text: "✓ " + t("toast.fields", { n: summary.fieldsRead }) } : null,
      growth.length ? { text: t("docs.toast.grew", { n: growth.length }) } : null,
      ...growth,
      warn ? { text: "⚠ " + t("docs.toast.check", { n: warn }) } : null,
      extraN ? { text: t("docs.toast.extra", { n: extraN }) } : null,
      failed ? { text: "⚠ " + t("docs.toast.uploadFailed", { n: failed }) } : null,
    ]);
    // Only the transition matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, enabled]);
}
