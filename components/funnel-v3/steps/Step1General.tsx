"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { Answers } from "@/lib/funnel-v3/types";
import { useFunnelState, useStepErrors } from "../hooks";
import { visibleFields } from "../logic";
import PartnerBlock from "../PartnerBlock";
import StepHead from "../StepHead";
import Choice from "../ui/Choice";
import { TextField } from "../ui/Fields";

/** Schritt 1 · Allgemeines (spec 3): Berater e-mail, Antrag, Kreditnehmer, contact. */
export default function Step1General() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const errors = useStepErrors(1);
  const setAns = useFunnelV3((s) => s.setAns);
  const setTxt = useFunnelV3((s) => s.setTxt);
  const show = new Set(visibleFields(1, state));
  const { ans, txt } = state;
  const set = (k: keyof Answers) => (v: string) => setAns(k, v as never);

  return (
    <>
      <StepHead step={1} title={t("s1.title")} lead={t("s1.lead")} large />

      {show.has("bmail") ? <PartnerBlock errors={errors} /> : null}

      <Choice qkey="antrag" value={ans.antrag} onChange={set("antrag")} reqState={state} error={errors.antrag} />
      <Choice qkey="kn" value={ans.kn} onChange={set("kn")} reqState={state} error={errors.kn} />

      <div className="v3-section">
        <span className="v3-eyebrow">{t(state.role === "kunde" ? "s1.contactOwn" : "s1.contactClient")}</span>
        <Choice qkey="anrede" value={ans.anrede} onChange={set("anrede")} hideLabel error={errors.anrede} />
        <div className="v3-two">
          <TextField
            field="vor"
            autoComplete={state.role === "kunde" ? "given-name" : "off"}
            label={t("s1.firstName")}
            placeholder={t("s1.firstName")}
            value={txt.vor}
            onChange={(v) => setTxt("vor", v)}
            error={errors.vor}
          />
          <TextField
            field="nach"
            autoComplete={state.role === "kunde" ? "family-name" : "off"}
            label={t("s1.lastName")}
            placeholder={t("s1.lastName")}
            value={txt.nach}
            onChange={(v) => setTxt("nach", v)}
            error={errors.nach}
          />
          <TextField
            field="mail"
            type="email"
            inputMode="email"
            autoComplete={state.role === "kunde" ? "email" : "off"}
            label={t("s1.email")}
            placeholder={t("s1.emailPh")}
            value={txt.mail}
            onChange={(v) => setTxt("mail", v)}
            error={errors.mail}
          />
          {show.has("tel") ? (
            <TextField
              field="tel"
              type="tel"
              autoComplete="tel"
              label={t("s1.phone")}
              placeholder={t("s1.phonePh")}
              value={txt.tel}
              onChange={(v) => setTxt("tel", v)}
              error={errors.tel}
            />
          ) : null}
        </div>
        <span className="v3-note">{t("s1.contactNote")}</span>
      </div>
    </>
  );
}
