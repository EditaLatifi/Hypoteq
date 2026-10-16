"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { Answers, FieldPath } from "@/lib/funnel-v3/types";
import type { StepErrors } from "@/lib/funnel-v3/validate";
import { useFunnelState, useScreenErrors } from "../hooks";
import { visibleFields } from "../logic";
import PartnerBlock from "../PartnerBlock";
import Choice from "../ui/Choice";
import { TextField } from "../ui/Fields";

/**
 * «Anfrage» (Handover 2 Schritt 1; Schnellanmeldung step 3, prefilled): Berater e-mail with
 * partner recognition, Kreditantrag and Kreditnehmer as cards that scroll on to the next
 * question, then the contact — Anrede and name for a natürliche Person, Firma gemäss
 * Handelsregister and zeichnungsberechtigte Person for a juristische, e-mail and phone in both.
 */
export default function ScreenAnfrage() {
  const state = useFunnelState();
  const errors = useScreenErrors("anfrage");
  const setAns = useFunnelV3((s) => s.setAns);
  const show = new Set(visibleFields("anfrage", state));
  const { ans } = state;
  const set = (k: keyof Answers) => (v: string) => setAns(k, v as never);

  return (
    <>
      {show.has("bmail") ? <PartnerBlock errors={errors} /> : null}

      <Choice qkey="antrag" value={ans.antrag} onChange={set("antrag")} reqState={state} source="ans.antrag" error={errors.antrag} />
      <Choice qkey="kn" value={ans.kn} onChange={set("kn")} reqState={state} source="ans.kn" error={errors.kn} />

      <ContactFields errors={errors} full />
    </>
  );
}

/**
 * The contact block. `full` (Anfrage): Anrede and name, or Firma and signatory, before e-mail
 * and phone. Without (Kontakt of the Schnellanmeldung): e-mail and phone only — the name comes
 * from the ID (Handover 3).
 */
export function ContactFields({ errors, full }: { errors: StepErrors; full?: boolean }) {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const setAns = useFunnelV3((s) => s.setAns);
  const setTxt = useFunnelV3((s) => s.setTxt);
  const { ans, txt, role } = state;
  const jp = ans.kn === "Juristische Person";
  const own = role === "kunde";
  const text = (field: "vor" | "nach" | "firma" | "zeichner", label: string, placeholder: string, autoComplete: string) => (
    <TextField
      field={field}
      autoComplete={autoComplete}
      label={label}
      placeholder={placeholder}
      value={txt[field]}
      onChange={(v) => setTxt(field, v)}
      source={`txt.${field}` as FieldPath}
      error={errors[field]}
    />
  );

  return (
    <div className="v3-section">
      <span className="v3-eyebrow">{t(own ? "s1.contactOwn" : "s1.contactClient")}</span>
      {full && !jp ? (
        <Choice
          qkey="anrede"
          value={ans.anrede}
          onChange={(v) => setAns("anrede", v as Answers["anrede"])}
          hideLabel
          source="ans.anrede"
          error={errors.anrede}
        />
      ) : null}
      <div className="v3-two">
        {full && jp ? (
          <>
            {text("firma", t("s1.companyHr"), t("s1.companyPh"), "organization")}
            {text("zeichner", t("s3.signatory"), t("s3.namePh"), "off")}
          </>
        ) : null}
        {full && !jp ? (
          <>
            {text("vor", t("s1.firstName"), t("s1.firstName"), own ? "given-name" : "off")}
            {text("nach", t("s1.lastName"), t("s1.lastName"), own ? "family-name" : "off")}
          </>
        ) : null}
        <TextField
          field="mail"
          type="email"
          inputMode="email"
          autoComplete={own ? "email" : "off"}
          label={t("s1.email")}
          placeholder={t("s1.emailPh")}
          value={txt.mail}
          onChange={(v) => setTxt("mail", v)}
          error={errors.mail}
        />
        <TextField
          field="tel"
          type="tel"
          autoComplete={own ? "tel" : "off"}
          label={t("s1.phone")}
          placeholder={t("s1.phonePh")}
          value={txt.tel}
          onChange={(v) => setTxt("tel", v)}
          error={errors.tel}
        />
      </div>
      <span className="v3-note">{t("s1.contactNote")}</span>
    </div>
  );
}
