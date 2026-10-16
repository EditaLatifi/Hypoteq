"use client";

import { Plus } from "lucide-react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { effectiveBorrowers, reqList } from "@/lib/funnel-v3/requirements";
import { MAX_BORROWERS, type Borrower } from "@/lib/funnel-v3/types";
import { useFunnelState, useScreenErrors } from "../hooks";
import { deltaLabel } from "../logic";
import Choice from "../ui/Choice";
import Chips from "../ui/Chips";
import { AmountField, TextField } from "../ui/Fields";
import CalcCard from "./CalcCard";

/**
 * «Personen» (Handover 2 Schritt 3; Schnellanmeldung step 5, prefilled — recognised chips are
 * tapped): Kreditnehmer 1 with name, Bruttoeinkommen and Beschäftigung («Pensionskasse
 * vorhanden?» for Selbständige); Kreditnehmer 2 only after «+ Kreditnehmer hinzufügen»
 * (DECISIONS V8, V13); a juristische Person shows Firma and signatory from step 1. Then
 * «Trifft etwas davon zu?» and, with the Solidarbürgschaft, the Bürge's name.
 */
export default function ScreenPersonen() {
  const { t, opt } = useFunnelT();
  const state = useFunnelState();
  const errors = useScreenErrors("personen");
  const setTxt = useFunnelV3((s) => s.setTxt);
  const setFin = useFunnelV3((s) => s.setFin);
  const addBorrower = useFunnelV3((s) => s.addBorrower);
  const removeBorrower = useFunnelV3((s) => s.removeBorrower);
  const updateBorrower = useFunnelV3((s) => s.updateBorrower);
  const { ans, txt, fin, borrowers } = state;
  const jp = ans.kn === "Juristische Person";
  const first = borrowers[0];
  const second = borrowers[1];
  // «+N» on «Kreditnehmer hinzufügen»: Handover 4.1 P17 for a second borrower.
  const addDelta = deltaLabel(
    reqList({ ...state, borrowers: [...effectiveBorrowers(state), { id: "kn2-preview", vor: "", nach: "", pkSe: "Nein" }] }).length -
      reqList(state).length,
    t
  );

  return (
    <>
      {jp ? (
        <div className="v3-panel">
          <div className="v3-panel-head">
            <span className="v3-eyebrow">{t("q.kn")}</span>
            <span className="v3-panel-kind">{opt("kn", "Juristische Person")}</span>
          </div>
          <div className="v3-two">
            <TextField
              field="firma"
              autoComplete="organization"
              label={t("s1.company")}
              placeholder={t("s3.companyName")}
              value={txt.firma}
              onChange={(v) => setTxt("firma", v)}
              source="txt.firma"
              error={errors.firma}
            />
            <TextField
              field="zeichner"
              autoComplete="off"
              label={t("s3.signatory")}
              placeholder={t("s3.namePh")}
              value={txt.zeichner}
              onChange={(v) => setTxt("zeichner", v)}
              source="txt.zeichner"
              error={errors.zeichner}
            />
          </div>
          <span className="v3-note">{t("s3.jpNote")}</span>
        </div>
      ) : (
        <>
          <div className="v3-panel" role="group" aria-label={t("s3.borrower", { n: 1 })}>
            <div className="v3-panel-head">
              <span className="v3-eyebrow">{t("s3.borrower", { n: 1 })}</span>
              <span className="v3-panel-kind">{opt("kn", "Natürliche Person")}</span>
            </div>
            <div className="v3-two">
              {/* Kreditnehmer 1 is the contact of step 1; the store keeps the two in step. */}
              <TextField
                field="borrower.0.vor"
                autoComplete="off"
                label={t("s3.firstNames")}
                placeholder={t("s3.firstNames")}
                value={txt.vor}
                onChange={(v) => setTxt("vor", v)}
                source="txt.vor"
                error={errors["borrower.0.vor"]}
              />
              <TextField
                field="borrower.0.nach"
                autoComplete="off"
                label={t("s1.lastName")}
                placeholder={t("s1.lastName")}
                value={txt.nach}
                onChange={(v) => setTxt("nach", v)}
                source="txt.nach"
                error={errors["borrower.0.nach"]}
              />
              <AmountField
                field="inc"
                label={t("s3.income")}
                hint={t("s3.incomeHint")}
                value={fin.inc}
                onChange={(n) => setFin("inc", n)}
                source="fin.inc"
                error={errors.inc}
              />
            </div>
            {first ? (
              <>
                <Choice
                  qkey="job"
                  field="borrower.0.job"
                  value={first.job}
                  onChange={(v) => updateBorrower(first.id, { job: v as Borrower["job"] })}
                  reqState={state}
                  borrowerId={first.id}
                  source="borrower.0.job"
                  error={errors["borrower.0.job"]}
                />
                {first.job === "Selbständig" ? (
                  <div className="v3-sub">
                    <Choice
                      qkey="pkSe"
                      field="borrower.0.pkSe"
                      value={first.pkSe}
                      onChange={(v) => updateBorrower(first.id, { pkSe: v as Borrower["pkSe"] })}
                      reqState={state}
                      borrowerId={first.id}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {second ? (
            <div className="v3-panel v3-rise" role="group" aria-label={t("s3.borrower", { n: 2 })}>
              <div className="v3-panel-head">
                <span className="v3-eyebrow">{t("s3.borrower", { n: 2 })}</span>
                <button
                  type="button"
                  className="v3-btn v3-btn--text"
                  aria-label={`${t("common.remove")}: ${t("s3.borrower", { n: 2 })}`}
                  onClick={() => removeBorrower(second.id)}
                >
                  {t("common.remove")}
                </button>
              </div>
              <div className="v3-two">
                <TextField
                  field="borrower.1.vor"
                  autoComplete="off"
                  label={t("s3.firstNames")}
                  placeholder={t("s3.firstNames")}
                  value={second.vor}
                  onChange={(v) => updateBorrower(second.id, { vor: v })}
                  error={errors["borrower.1.vor"]}
                />
                <TextField
                  field="borrower.1.nach"
                  autoComplete="off"
                  label={t("s1.lastName")}
                  placeholder={t("s1.lastName")}
                  value={second.nach}
                  onChange={(v) => updateBorrower(second.id, { nach: v })}
                  error={errors["borrower.1.nach"]}
                />
                <AmountField field="inc2" label={t("s3.income")} value={fin.inc2} onChange={(n) => setFin("inc2", n)} source="fin.inc2" />
              </div>
            </div>
          ) : null}

          {borrowers.length < MAX_BORROWERS ? (
            <div>
              <button type="button" className="v3-btn v3-btn--outline v3-btn--sm" onClick={addBorrower}>
                <Plus size={16} aria-hidden="true" />
                {t("s3.addBorrower")}
                {addDelta ? <span className="v3-delta">{addDelta.short}</span> : null}
              </button>
            </div>
          ) : null}
        </>
      )}

      <Chips reqState={state} />

      {ans.buerge === "Ja" ? (
        <div className="v3-two v3-rise">
          <TextField
            field="buergeName"
            autoComplete="off"
            label={t("s3.guarantorName")}
            placeholder={t("s3.namePh")}
            value={txt.buergeName}
            onChange={(v) => setTxt("buergeName", v)}
            error={errors.buergeName}
          />
        </div>
      ) : null}

      <CalcCard />
    </>
  );
}
