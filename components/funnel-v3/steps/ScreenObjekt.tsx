"use client";

import { useId, useState } from "react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { calcFinancing } from "@/lib/funnel-v3/calc";
import { chf } from "@/lib/funnel-v3/format";
import { EM_ROWS, NUTZUNG_OPTIONS, type Answers, type FieldPath } from "@/lib/funnel-v3/types";
import { useFunnelState, useScreenErrors } from "../hooks";
import { calcInputOf, disabledOptions, emRowHint, equityLine, visibleFields } from "../logic";
import Choice, { type ChoiceProps } from "../ui/Choice";
import { AmountField, TextArea, TextField } from "../ui/Fields";
import CalcCard from "./CalcCard";

/**
 * «Objekt & Finanzierung» (Handover 2 Schritt 2; Schnellanmeldung step 4, prefilled):
 *  - PLZ, Ort; Art der Immobilie (Bauprojekt disabled with its hint at an Ablösung); GB-Auszug
 *    und GVZ vorhanden? (Neubau); Art der Liegenschaft; Nutzung (natürliche Person Selbstbewohnt
 *    · Vermietet · Zweitwohnsitz · Vermietet & teilweise selbstbewohnt, juristische Vermietet ·
 *    Gewerbe); Netto-Mietertrag (Vermietet, also teilweise vermietet — DECISIONS V58)
 *  - Ablösung: bestehende Hypothek, Erhöhung, Betrag, Verwendungszweck
 *  - Kauf: Kaufpreis, Kaufdatum, Renovation, Renovationsbetrag, reserviert
 *  - Geschätzter Objektwert (a Kauf: empty = Kaufpreis, shown as placeholder)
 *  - Eigenmittel – Aufteilung (Kauf) or Vorsorge (Ablösung), each row naming the document it
 *    asks for, with «Eigenmittel total … · x % · davon hart …» and the 10 % warning
 *  - «Weitere Angaben (optional)», collapsed: Laufzeit, Kommentar
 *  - the live calculation.
 */
export default function ScreenObjekt() {
  const { t } = useFunnelT();
  const uid = useId();
  const state = useFunnelState();
  const errors = useScreenErrors("objekt");
  const setAns = useFunnelV3((s) => s.setAns);
  const setTxt = useFunnelV3((s) => s.setTxt);
  const setFin = useFunnelV3((s) => s.setFin);
  const setEm = useFunnelV3((s) => s.setEm);
  const show = new Set(visibleFields("objekt", state));
  const { ans, txt, fin, em } = state;
  const abl = ans.antrag === "Ablösung";
  const kauf = ans.antrag === "Neue Hypothek";
  const [more, setMore] = useState(() => Boolean(ans.laufzeit || txt.kommentar.trim()));
  const set = (k: keyof Answers) => (v: string) => setAns(k, v as never);
  const choice = (k: keyof Answers, extra: Partial<ChoiceProps> = {}) => (
    <Choice
      qkey={k}
      value={ans[k] as string | undefined}
      onChange={set(k)}
      reqState={state}
      source={`ans.${k}` as FieldPath}
      error={errors[k]}
      {...extra}
    />
  );
  const c = calcFinancing(calcInputOf(state));
  const equity = kauf ? equityLine(c, t) : null;

  return (
    <>
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
          source="txt.plz"
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
          source="txt.ort"
          error={errors.ort}
        />
      </div>

      {choice("immo", {
        disabled: disabledOptions(ans, "immo"),
        disabledTitle: t("s2.bauprojektOff"),
        hint: abl ? t("s2.bauprojektOff") : null,
      })}
      {show.has("nbDocs") ? <div className="v3-sub v3-rise">{choice("nbDocs")}</div> : null}
      {choice("lieg")}
      {choice("nutz", { options: NUTZUNG_OPTIONS[ans.kn] })}
      {show.has("miete") ? (
        <div className="v3-two v3-rise">
          <AmountField field="miete" label={t("s2.rentIncome")} hint={t("s2.rentHint")} value={fin.miete} onChange={(n) => setFin("miete", n)} />
        </div>
      ) : null}

      {abl ? (
        <div className="v3-panel v3-panel--loose v3-rise">
          <span className="v3-eyebrow">{t("s2.existingMortgage")}</span>
          <div className="v3-two">
            <AmountField
              field="old"
              label={t("s2.existingMortgage")}
              hint={t("s2.existingMortgageHint")}
              value={fin.old}
              onChange={(n) => setFin("old", n)}
              source="fin.old"
              error={errors.old}
            />
          </div>
          {choice("aufstockung")}
          {show.has("up") ? (
            <div className="v3-two v3-rise">
              <AmountField field="up" label={t("s2.increase")} value={fin.up} onChange={(n) => setFin("up", n)} error={errors.up} />
              <TextField
                field="zweck"
                autoComplete="off"
                label={t("s2.purpose")}
                placeholder={t("s2.purposePh")}
                value={txt.zweck}
                onChange={(v) => setTxt("zweck", v)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {kauf ? (
        <div className="v3-panel v3-panel--loose v3-rise">
          <span className="v3-eyebrow">{t("s2.purchase")}</span>
          <div className="v3-two">
            <AmountField
              field="kaufpreis"
              label={t("s2.price")}
              value={fin.kaufpreis}
              onChange={(n) => setFin("kaufpreis", n)}
              source="fin.kaufpreis"
              error={errors.kaufpreis}
            />
            <TextField
              field="kaufdatum"
              autoComplete="off"
              label={t("s2.purchaseDate")}
              hint={t("s2.purchaseDateHint")}
              placeholder={t("s2.datePh")}
              value={txt.kaufdatum}
              onChange={(v) => setTxt("kaufdatum", v)}
              source="txt.kaufdatum"
            />
          </div>
          {choice("reno")}
          {show.has("renoBetrag") ? (
            <div className="v3-two v3-rise">
              <AmountField
                field="renoBetrag"
                label={t("s2.renoAmount")}
                hint={t("s2.renoAmountHint")}
                value={fin.renoBetrag}
                onChange={(n) => setFin("renoBetrag", n)}
                error={errors.renoBetrag}
              />
            </div>
          ) : null}
          {choice("reserviert")}
        </div>
      ) : null}

      {ans.antrag ? (
        <>
          <div className="v3-two">
            <AmountField
              field="val"
              label={t("s4.value")}
              // Handover 2: «Bei Kauf leer = Kaufpreis (Platzhalter zeigt den Kaufpreis)».
              placeholder={kauf && fin.kaufpreis > 0 ? chf(fin.kaufpreis) : "CHF"}
              hint={t(kauf ? "s2.valueIsPrice" : "s4.valueHint")}
              value={fin.val}
              onChange={(n) => setFin("val", n)}
              source="fin.val"
              error={errors.val}
            />
          </div>
          <div className="v3-panel">
            <div className="v3-panel-copy">
              <span className="v3-eyebrow">{t(kauf ? "em.title" : "em.titleAbl")}</span>
              <span className="v3-note v3-note--dark">{t(kauf ? "em.sub" : "em.subAbl")}</span>
            </div>
            <div className="v3-three">
              {EM_ROWS[ans.antrag].map((k) => (
                <AmountField
                  key={k}
                  field={`em.${k}`}
                  label={t(`em.${k}`)}
                  hint={emRowHint(state, k, t) || undefined}
                  value={em[k]}
                  onChange={(n) => setEm(k, n)}
                  source={`em.${k}` as FieldPath}
                />
              ))}
            </div>
            {equity ? (
              <div className="v3-emtotal" aria-live="polite">
                <span className="v3-emtotal-line">{equity.text}</span>
                {equity.warn ? <span className="v3-warn v3-warn--inline">{equity.warn}</span> : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="v3-more-block">
        <button type="button" className="v3-moretoggle" aria-expanded={more} aria-controls={`${uid}-more`} onClick={() => setMore((v) => !v)}>
          {t("s2.more")}
          <span className={`v3-caret${more ? " is-open" : ""}`} aria-hidden="true">
            ▾
          </span>
        </button>
        {more ? (
          <div id={`${uid}-more`} className="v3-stack v3-rise">
            {choice("laufzeit", { reqState: undefined, source: undefined })}
            <TextArea
              field="kommentar"
              label={t("s4.comments")}
              placeholder={t("s4.commentsPh")}
              value={txt.kommentar}
              onChange={(v) => setTxt("kommentar", v)}
            />
          </div>
        ) : null}
      </div>

      <CalcCard />
    </>
  );
}
