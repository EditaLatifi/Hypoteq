"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { MAX_BORROWERS, type Answers, type Borrower, type FunnelState } from "@/lib/funnel-v3/types";
import type { StepErrors } from "@/lib/funnel-v3/validate";
import { useFunnelState, useStepErrors } from "../hooks";
import { visibleFields } from "../logic";
import StepHead from "../StepHead";
import Choice from "../ui/Choice";
import { AmountField, TextField } from "../ui/Fields";

/**
 * Schritt 3 · Personen «Wer finanziert?» (spec 3). Up to three natural-person borrowers (D2)
 * with Beschäftigung and «Pensionskasse vorhanden?» per person (D3); a juristische Person
 * replaces the borrower block with Firma and zeichnungsberechtigte Person.
 */
export default function Step3Persons() {
  const { t, opt } = useFunnelT();
  const state = useFunnelState();
  const errors = useStepErrors(3);
  const setAns = useFunnelV3((s) => s.setAns);
  const setTxt = useFunnelV3((s) => s.setTxt);
  const setFin = useFunnelV3((s) => s.setFin);
  const addBorrower = useFunnelV3((s) => s.addBorrower);
  const show = new Set(visibleFields(3, state));
  const { ans, txt, fin, borrowers } = state;
  const jp = ans.kn === "Juristische Person";
  const single = borrowers.length <= 1;
  const set = (k: keyof Answers) => (v: string) => setAns(k, v as never);
  const choice = (k: keyof Answers) => (
    <Choice qkey={k} value={ans[k] as string | undefined} onChange={set(k)} reqState={state} error={errors[k]} />
  );

  const income = (label: string, hint: string) => (
    <AmountField field="inc" label={label} hint={hint} value={fin.inc} onChange={(n) => setFin("inc", n)} error={errors.inc} />
  );

  return (
    <>
      <StepHead step={3} title={t("s3.title")} lead={t("s3.lead")} />

      {jp ? (
        <div className="v3-panel">
          <div className="v3-panel-head">
            <span className="v3-eyebrow">{t("s3.borrower", { n: 1 })}</span>
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
              error={errors.firma}
            />
            <TextField
              field="zeichner"
              autoComplete="off"
              label={t("s3.signatory")}
              placeholder={t("s3.namePh")}
              value={txt.zeichner}
              onChange={(v) => setTxt("zeichner", v)}
              error={errors.zeichner}
            />
          </div>
          <span className="v3-note">{t("s3.jpNote")}</span>
        </div>
      ) : (
        <>
          {borrowers.map((b, i) => (
            <BorrowerCard
              key={b.id}
              borrower={b}
              index={i}
              state={state}
              errors={errors}
              income={single && i === 0 ? income(t("s3.income"), t("s3.incomeHint")) : null}
              ab50={single && i === 0 ? choice("ab50") : null}
            />
          ))}
          {borrowers.length < MAX_BORROWERS ? (
            <div>
              <button type="button" className="v3-btn v3-btn--outline v3-btn--sm" onClick={addBorrower}>
                <Plus size={16} aria-hidden="true" />
                {t("s3.addBorrower")}
              </button>
            </div>
          ) : null}
          {!single ? (
            <>
              <div className="v3-two">{income(t("s4.householdIncome"), t("s3.incomeHint"))}</div>
              {choice("ab50")}
            </>
          ) : null}
          {choice("kinder")}
          {show.has("unterhalt") ? <div className="v3-sub">{choice("unterhalt")}</div> : null}
        </>
      )}

      {choice("kredite")}
      {choice("leasing")}
      {choice("buerge")}
      {show.has("buergeName") ? (
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
    </>
  );
}

function BorrowerCard({
  borrower,
  index,
  state,
  errors,
  income,
  ab50,
}: {
  borrower: Borrower;
  index: number;
  state: FunnelState;
  errors: StepErrors;
  income: ReactNode;
  ab50: ReactNode;
}) {
  const { t, opt } = useFunnelT();
  const setTxt = useFunnelV3((s) => s.setTxt);
  const updateBorrower = useFunnelV3((s) => s.updateBorrower);
  const removeBorrower = useFunnelV3((s) => s.removeBorrower);
  const first = index === 0;
  // The first borrower is the contact from step 1; the store keeps the two in step.
  const name = (key: "vor" | "nach", v: string) => (first ? setTxt(key, v) : updateBorrower(borrower.id, { [key]: v }));
  const vor = first ? state.txt.vor : borrower.vor;
  const nach = first ? state.txt.nach : borrower.nach;

  return (
    <div className="v3-panel v3-rise" role="group" aria-label={t("s3.borrower", { n: index + 1 })}>
      <div className="v3-panel-head">
        <span className="v3-eyebrow">{t("s3.borrower", { n: index + 1 })}</span>
        <span className="v3-panel-head-right">
          <span className="v3-panel-kind">{opt("kn", "Natürliche Person")}</span>
          {!first ? (
            <button
              type="button"
              className="v3-btn v3-btn--text"
              aria-label={`${t("common.remove")}: ${t("s3.borrower", { n: index + 1 })}`}
              onClick={() => removeBorrower(borrower.id)}
            >
              {t("common.remove")}
            </button>
          ) : null}
        </span>
      </div>
      <div className="v3-two">
        <TextField
          field={`borrower.${index}.vor`}
          autoComplete="off"
          label={t("s3.firstNames")}
          placeholder={t("s3.firstNames")}
          value={vor}
          onChange={(v) => name("vor", v)}
        />
        <TextField
          field={`borrower.${index}.nach`}
          autoComplete="off"
          label={t("s1.lastName")}
          placeholder={t("s1.lastName")}
          value={nach}
          onChange={(v) => name("nach", v)}
        />
        {income}
      </div>
      <Choice
        qkey="job"
        field={`borrower.${index}.job`}
        value={borrower.job}
        onChange={(v) => updateBorrower(borrower.id, { job: v as Borrower["job"] })}
        reqState={state}
        borrowerId={borrower.id}
        error={errors[`borrower.${index}.job`]}
      />
      {borrower.job === "Selbständig" ? (
        <Choice
          qkey="pkSe"
          field={`borrower.${index}.pkSe`}
          value={borrower.pkSe}
          onChange={(v) => updateBorrower(borrower.id, { pkSe: v as Borrower["pkSe"] })}
          reqState={state}
          borrowerId={borrower.id}
        />
      ) : null}
      {ab50}
    </div>
  );
}
