"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { AFFORDABILITY_LIMIT, LTV_LIMIT, calcFinancing } from "@/lib/funnel-v3/calc";
import { chf, pct } from "@/lib/funnel-v3/format";
import type { Answers } from "@/lib/funnel-v3/types";
import { useFunnelState, useStepErrors } from "../hooks";
import { VERDICT_KEY, barWidth, calcInputOf, needSubline, visibleFields } from "../logic";
import StepHead from "../StepHead";
import Choice from "../ui/Choice";
import { AmountField, TextArea } from "../ui/Fields";

/** Schritt 4 · Finanzierung (spec 3) with the live calculation card (D7). */
export default function Step4Financing() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const errors = useStepErrors(4);
  const setAns = useFunnelV3((s) => s.setAns);
  const setTxt = useFunnelV3((s) => s.setTxt);
  const setFin = useFunnelV3((s) => s.setFin);
  const show = new Set(visibleFields(4, state));
  const { ans, txt, fin } = state;
  const set = (k: keyof Answers) => (v: string) => setAns(k, v as never);
  const choice = (k: keyof Answers, row?: boolean) => (
    <Choice qkey={k} value={ans[k] as string | undefined} onChange={set(k)} reqState={state} error={errors[k]} row={row} />
  );

  return (
    <>
      <StepHead step={4} title={t("s4.title")} lead={t("s4.lead")} />

      <CalcCard />

      <div className="v3-two">
        <AmountField
          field="val"
          label={t("s4.value")}
          hint={t("s4.valueHint")}
          value={fin.val}
          onChange={(n) => setFin("val", n)}
          error={errors.val}
        />
        {show.has("inc") ? (
          <AmountField
            field="inc"
            label={t("s4.householdIncome")}
            hint={t("s4.fromStep3")}
            value={fin.inc}
            onChange={(n) => setFin("inc", n)}
          />
        ) : null}
      </div>

      {choice("laufzeit")}
      {choice("s3a")}

      <div className="v3-panel">
        <span className="v3-eyebrow">{t("s4.equityVia")}</span>
        {choice("schenkung", true)}
        {choice("erbe", true)}
        {choice("darlehen", true)}
        {choice("pk", true)}
      </div>

      <TextArea
        field="kommentar"
        label={t("s4.comments")}
        placeholder={t("s4.commentsPh")}
        value={txt.kommentar}
        onChange={(v) => setTxt("kommentar", v)}
      />
    </>
  );
}

/** The dark card: Gesamtfinanzierung, Belehnung and Tragbarkeit with bars, and the verdict. */
function CalcCard() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const c = calcFinancing(calcInputOf(state));
  const jp = state.ans.kn === "Juristische Person";
  const ltvWidth = barWidth(c.ltv, 1.25);
  const affWidth = barWidth(c.affordability, 2.5);

  return (
    <section className="v3-calc" aria-label={t("s4.total")}>
      <div className="v3-calc-top">
        <span className={`v3-calc-verdict${c.verdict === "ok" ? " is-ok" : ""}`} aria-live="polite">
          {t(VERDICT_KEY[c.verdict])}
        </span>
        <span className="v3-calc-label">{t(state.ans.antrag === "Ablösung" ? "s4.total" : "s4.need")}</span>
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
            <div
              className={`v3-stat-fill${c.ltv !== null && c.ltv > LTV_LIMIT ? " is-danger" : ""}`}
              style={{ width: `${ltvWidth}%` }}
            />
          </div>
          <span className="v3-stat-hint">{t("s4.ltvHint")}</span>
        </div>
        <div className="v3-stat">
          <div className="v3-stat-row">
            <span className="v3-stat-label">{t("s4.aff")}</span>
            <span className="v3-stat-value">{jp ? "–" : pct(c.affordability)}</span>
          </div>
          <div className="v3-stat-bar" aria-hidden="true">
            <div
              className={`v3-stat-fill${c.affordability !== null && c.affordability > AFFORDABILITY_LIMIT ? " is-warning" : ""}`}
              style={{ width: `${jp ? 0 : affWidth}%` }}
            />
          </div>
          <span className="v3-stat-hint">{t("s4.affHint")}</span>
        </div>
      </div>
    </section>
  );
}
