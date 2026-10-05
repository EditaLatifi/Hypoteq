/**
 * «Weiter» validation (spec 1.6, DECISIONS D5). Only the fields listed in D5 are required;
 * everything else has a default.
 *
 * Returns field → i18n key (`val.required` · `val.choose` · `val.email` · `val.amount`).
 * An empty object means the step may be left. Field names are the answer-model keys
 * (`antrag`, `vor`, `plz`, `old`, …); per-borrower fields are `borrower.<index>.<key>`.
 */

import type { FunnelState } from "./types";

export type ValidationKey = "val.required" | "val.choose" | "val.email" | "val.amount";
export type StepErrors = Record<string, ValidationKey>;

/** Same check as /api/inquiry, so what passes here passes there. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const blank = (s: string | undefined | null) => !s || !s.trim();

export function validateStep(step: number, state: FunnelState): StepErrors {
  const { ans, txt, fin, role } = state;
  const e: StepErrors = {};
  const email = (field: string, v: string) => {
    if (blank(v)) e[field] = "val.required";
    else if (!EMAIL_RE.test(v.trim())) e[field] = "val.email";
  };
  const required = (field: keyof typeof txt) => {
    if (blank(txt[field])) e[field] = "val.required";
  };
  const choose = (field: keyof typeof ans) => {
    if (!ans[field]) e[field] = "val.choose";
  };
  const amount = (field: keyof typeof fin) => {
    if (!(fin[field] > 0)) e[field] = "val.amount";
  };
  const isJur = ans.kn === "Juristische Person";

  switch (step) {
    case 1:
      if (role === "berater") email("bmail", txt.bmail);
      choose("antrag");
      choose("kn");
      choose("anrede");
      required("vor");
      required("nach");
      email("mail", txt.mail);
      if (role === "kunde") required("tel");
      break;

    case 2:
      required("plz");
      required("ort");
      choose("immo");
      choose("lieg");
      choose("nutz");
      if (ans.antrag === "Ablösung") {
        amount("old");
        if (ans.aufstockung === "Ja") amount("up");
      }
      if (ans.antrag === "Neue Hypothek") amount("kaufpreis");
      break;

    case 3:
      if (isJur) {
        required("firma");
        required("zeichner");
      } else {
        amount("inc");
        state.borrowers.forEach((b, i) => {
          if (!b.job) e[`borrower.${i}.job`] = "val.choose";
        });
      }
      if (ans.buerge === "Ja") required("buergeName");
      break;

    case 4:
      amount("val");
      choose("laufzeit");
      break;
  }
  return e;
}

export function isStepValid(step: number, state: FunnelState): boolean {
  return Object.keys(validateStep(step, state)).length === 0;
}
