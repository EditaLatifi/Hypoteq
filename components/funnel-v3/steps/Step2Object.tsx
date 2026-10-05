"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { Answers } from "@/lib/funnel-v3/types";
import { useFunnelState, useStepErrors } from "../hooks";
import { visibleFields } from "../logic";
import StepHead from "../StepHead";
import Choice from "../ui/Choice";
import { AmountField, TextArea, TextField } from "../ui/Fields";

/** Schritt 2 · Objekt «Was finanzieren wir?» (spec 3). */
export default function Step2Object() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const errors = useStepErrors(2);
  const setAns = useFunnelV3((s) => s.setAns);
  const setTxt = useFunnelV3((s) => s.setTxt);
  const setFin = useFunnelV3((s) => s.setFin);
  const show = new Set(visibleFields(2, state));
  const { ans, txt, fin } = state;
  const set = (k: keyof Answers) => (v: string) => setAns(k, v as never);
  const choice = (k: keyof Answers) => (
    <Choice qkey={k} value={ans[k] as string | undefined} onChange={set(k)} reqState={state} error={errors[k]} />
  );

  return (
    <>
      <StepHead step={2} title={t("s2.title")} lead={t("s2.lead")} />

      <div className="v3-row">
        <TextField
          field="plz"
          className="v3-field--plz"
          inputMode="numeric"
          autoComplete="off"
          label={t("s2.zip")}
          placeholder={t("s2.zip")}
          value={txt.plz}
          onChange={(v) => setTxt("plz", v)}
          error={errors.plz}
        />
        <TextField
          field="ort"
          className="v3-field--ort"
          autoComplete="off"
          label={t("s2.city")}
          placeholder={t("s2.city")}
          value={txt.ort}
          onChange={(v) => setTxt("ort", v)}
          error={errors.ort}
        />
      </div>
      <span className="v3-note v3-note--tight">{t("s2.fromDocs")}</span>

      {choice("immo")}
      {choice("lieg")}
      {choice("nutz")}
      {show.has("nbDocs") ? <div className="v3-sub">{choice("nbDocs")}</div> : null}
      {choice("heizung")}
      {choice("baurecht")}

      {show.has("old") ? (
        <div className="v3-panel v3-panel--loose">
          <span className="v3-eyebrow">{t("s2.existingMortgage")}</span>
          <div className="v3-two">
            <AmountField
              field="old"
              label={t("s2.existingMortgage")}
              hint={t("s2.existingMortgageHint")}
              value={fin.old}
              onChange={(n) => setFin("old", n)}
              error={errors.old}
            />
          </div>
          {choice("aufstockung")}
          {show.has("up") ? (
            <div className="v3-stack v3-stack--16 v3-rise">
              <AmountField
                field="up"
                label={t("s2.increase")}
                value={fin.up}
                onChange={(n) => setFin("up", n)}
                error={errors.up}
              />
              <TextArea
                field="zweck"
                label={t("s2.purpose")}
                placeholder={t("s2.purposePh")}
                value={txt.zweck}
                onChange={(v) => setTxt("zweck", v)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {show.has("kaufpreis") ? (
        <div className="v3-stack">
          <AmountField
            field="kaufpreis"
            label={t("s2.price")}
            value={fin.kaufpreis}
            onChange={(n) => setFin("kaufpreis", n)}
            error={errors.kaufpreis}
          />
          {choice("reno")}
          {choice("reserviert")}
        </div>
      ) : null}

      {choice("angebote")}
    </>
  );
}
