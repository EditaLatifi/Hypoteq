"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { AFFORDABILITY_LIMIT, LTV_LIMIT, calcFinancing } from "@/lib/funnel-v3/calc";
import { chf, pct } from "@/lib/funnel-v3/format";
import { useFunnelState } from "../hooks";
import { VERDICT_KEY, barWidth, calcInputOf, needSubline } from "../logic";

/**
 * The dark live-calculation card (Handover 2 «ab Schritt 2», chapter 5; DECISIONS V1): the
 * Hypothek, Belehnung and Tragbarkeit with bars, and the verdict «Finanzierung möglich» ·
 * «Prüfung nötig» · «Angaben ergänzen». Shown on «Objekt & Finanzierung» and «Personen».
 */
export default function CalcCard() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const c = calcFinancing(calcInputOf(state));
  const jp = state.ans.kn === "Juristische Person";
  const abl = state.ans.antrag === "Ablösung";

  return (
    <section className="v3-calc" aria-label={t(abl ? "s4.total" : "s4.need")}>
      <div className="v3-calc-top">
        <span className={`v3-calc-verdict${c.verdict === "ok" ? " is-ok" : ""}`} aria-live="polite">
          {t(VERDICT_KEY[c.verdict])}
        </span>
        <span className="v3-calc-label">{t(abl ? "s4.total" : "s4.need")}</span>
        <span className="v3-calc-need">{chf(c.need)}</span>
        <span className="v3-calc-sub">{needSubline(state, t)}</span>
      </div>
      <div className="v3-calc-divider" />
      <div className="v3-two">
        <div className="v3-stat">
          <div className="v3-stat-row">
            <span className="v3-stat-label">{t("s4.ltv")}</span>
            <span className="v3-stat-value">{pct(c.ltv)}</span>
          </div>
          <div className="v3-stat-bar" aria-hidden="true">
            <div className={`v3-stat-fill${c.ltv !== null && c.ltv > LTV_LIMIT ? " is-danger" : ""}`} style={{ width: `${barWidth(c.ltv, 1.25)}%` }} />
          </div>
          <span className="v3-stat-hint">{t(abl ? "s4.ltvHint" : "calc.byPrice")}</span>
        </div>
        <div className="v3-stat">
          <div className="v3-stat-row">
            <span className="v3-stat-label">{t("s4.aff")}</span>
            <span className="v3-stat-value">{jp ? "–" : pct(c.affordability)}</span>
          </div>
          <div className="v3-stat-bar" aria-hidden="true">
            <div
              className={`v3-stat-fill${c.affordability !== null && c.affordability > AFFORDABILITY_LIMIT ? " is-warning" : ""}`}
              style={{ width: `${jp ? 0 : barWidth(c.affordability, 2.5)}%` }}
            />
          </div>
          <span className="v3-stat-hint">{t("s4.affHint")}</span>
        </div>
      </div>
      {!jp && c.income <= 0 ? <span className="v3-calc-note">{t("calc.incNote")}</span> : null}
    </section>
  );
}
