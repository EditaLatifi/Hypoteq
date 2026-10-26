"use client";

import { useMemo } from "react";
import { answersSummary } from "@/lib/funnel-v3/answersSummary";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { editFrom, useFunnelState } from "../hooks";

/**
 * «Deine Angaben aus dem Fragepfad» (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 2.1):
 * under the completeness card of the last step, one compact card per topic — label in
 * capitals with «Bearbeiten», the value, a detail line (lib/funnel-v3/answersSummary.ts).
 * «Bearbeiten» opens the screen and offers the way back here (hooks.ts editFrom/goReturn);
 * the documents and what was read from them stay as they are.
 */
export default function AnswersSummary() {
  const { t, lang } = useFunnelT();
  const state = useFunnelState();
  const boxes = useMemo(() => answersSummary(state, lang), [state, lang]);

  return (
    <section className="v3-answers" aria-labelledby="v3-answers-title">
      <span id="v3-answers-title" className="v3-eyebrow">
        {t("sum.title")}
      </span>
      <div className="v3-answers-grid">
        {boxes.map((b) => (
          <div key={b.key} className={`v3-answer${b.empty ? " is-empty" : ""}`}>
            <div className="v3-answer-head">
              <span className="v3-answer-label">{b.label}</span>
              <button type="button" className="v3-answer-edit" aria-label={t("sum.editAria", { label: b.label })} onClick={() => editFrom("abschluss", b.screen)}>
                {t("sum.edit")}
              </button>
            </div>
            <span className="v3-answer-value">{b.value}</span>
            {b.detail ? <span className="v3-answer-detail">{b.detail}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
