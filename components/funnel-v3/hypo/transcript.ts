"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { translate, type Lang } from "@/lib/funnel-v3/i18n";
import { ampel, fieldLabel, formatParams, transcriptText, valueText } from "@/lib/funnel-v3/hypo/engine";
import type { HypoMessage } from "@/lib/funnel-v3/hypo/session";
import type { HypoPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { useHypo } from "./hypoStore";

/** The transcript stays well under what a text file in the case folder needs to be readable. */
const MAX_TRANSCRIPT = 100_000;

function messageText(m: HypoMessage, lang: Lang): string {
  if (m.from === "user") return m.text;
  switch (m.kind) {
    case "text":
      return translate(lang, m.key, m.params ? formatParams(m.params, lang) : undefined);
    case "link":
      return `${translate(lang, m.key)} ${m.url}`;
    case "recognised": {
      const items = m.items.map((i) => `${fieldLabel(i.key, lang)}: ${valueText(i.key, i.value, lang)} (${ampel(i.confidence)} ${Math.round(i.confidence * 100)} %)`);
      const notes = m.notes?.length ? [`${translate(lang, "hypo.card.notes")}: ${m.notes.join(" · ")}`] : [];
      return `[${translate(lang, "hypo.card.recognised")}] ${[...items, ...notes].join(" · ")}`;
    }
    case "document": {
      const f = useFunnelV3.getState().files.find((x) => x.id === m.fileId);
      return `[${f?.name ?? m.fileId}] ${f?.analysis?.docTypeLabel ?? ""}`.trim();
    }
    case "conflict": {
      const choice = useFunnelV3.getState().choices[m.fieldId];
      return `[${translate(lang, "hypo.card.conflict")}] ${m.fieldId}${choice ? ` → ${choice.chosenSource}: ${choice.value}` : ""}`;
    }
    case "summary":
      return `[${translate(lang, "hypo.card.summary")}]`;
  }
}

/**
 * What the chat adds to the request (DECISIONS V92): the valuation order and the transcript —
 * null when the request did not start in HYPO.
 */
export function hypoPayload(lang: Lang): HypoPayload | null {
  if (useFunnelV3.getState().channel !== "chat") return null;
  const { session, messages } = useHypo.getState();
  const lines = messages.map((m) => ({ from: m.from, text: messageText(m, lang), at: m.at }));
  const text = transcriptText(lines, { lang, role: session.role });
  return {
    bewertung: session.bewertung,
    ...(session.adresse ? { adresse: session.adresse } : {}),
    transcript: text.length > MAX_TRANSCRIPT ? `${text.slice(0, MAX_TRANSCRIPT)}\n…` : text,
  };
}
