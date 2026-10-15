/**
 * «Weiter» validation (spec 1.6, DECISIONS D5; v5: Handover 2 and 3). Per screen, so both
 * entries check the same fields wherever the screen sits (steps.ts). Only the fields listed
 * below are required; everything else has a default.
 *
 *   kontakt   Berater-E-Mail (Berater) · E-Mail and Telefon of the customer
 *   anfrage   Berater-E-Mail (Berater) · Kreditantrag · Kreditnehmer · natürliche Person:
 *             Anrede, Vorname, Nachname · juristische Person: Firma, zeichnungsberechtigte
 *             Person · E-Mail · Telefon (both roles since v5)
 *   objekt    PLZ, Ort, Art der Immobilie, Art der Liegenschaft, Nutzung · Ablösung: bestehende
 *             Hypothek, Erhöhung (Erhöhung = Ja), Objektwert (the Belehnungsbasis) · Kauf:
 *             Kaufpreis, Renovationsbetrag (Renovation = Ja)
 *   personen  natürliche Person: Bruttoeinkommen and Beschäftigung of Kreditnehmer 1; Vorname
 *             and Nachname of Kreditnehmer 2 when added · Name Solidarbürge (chip on)
 *   upload, abschluss  nothing (the closing has its own gate: the Auskunftsermächtigung)
 *
 * Returns field → i18n key (`val.required` · `val.choose` · `val.email` · `val.amount`).
 * An empty object means the step may be left. Field names are the answer-model keys
 * (`antrag`, `vor`, `plz`, `old`, …); per-borrower fields are `borrower.<index>.<key>`.
 */

import type { FunnelState } from "./types";
import { screenAt, type Screen } from "./steps";

export type ValidationKey = "val.required" | "val.choose" | "val.email" | "val.amount";
export type StepErrors = Record<string, ValidationKey>;

/** Same check as /api/inquiry, so what passes here passes there. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const blank = (s: string | undefined | null) => !s || !s.trim();

type ValidationState = Pick<FunnelState, "role" | "ans" | "txt" | "fin" | "borrowers">;

export function validateScreen(screen: Screen | null, state: ValidationState): StepErrors {
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

  switch (screen) {
    case "kontakt":
      if (role === "berater") email("bmail", txt.bmail);
      email("mail", txt.mail);
      required("tel");
      break;

    case "anfrage":
      if (role === "berater") email("bmail", txt.bmail);
      choose("antrag");
      choose("kn");
      if (isJur) {
        required("firma");
        required("zeichner");
      } else {
        choose("anrede");
        required("vor");
        required("nach");
      }
      email("mail", txt.mail);
      required("tel");
      break;

    case "objekt":
      required("plz");
      required("ort");
      choose("immo");
      choose("lieg");
      choose("nutz");
      if (ans.antrag === "Ablösung") {
        amount("old");
        if (ans.aufstockung === "Ja") amount("up");
        // The Belehnungsbasis of an Ablösung; a Kauf falls back to the Kaufpreis (calc.ts).
        amount("val");
      }
      if (ans.antrag === "Neue Hypothek") {
        amount("kaufpreis");
        if (ans.reno === "Ja") amount("renoBetrag");
      }
      break;

    case "personen":
      if (!isJur) {
        amount("inc");
        if (!state.borrowers[0]?.job) e["borrower.0.job"] = "val.choose";
        state.borrowers.forEach((b, i) => {
          if (i === 0) return;
          if (blank(b.vor)) e[`borrower.${i}.vor`] = "val.required";
          if (blank(b.nach)) e[`borrower.${i}.nach`] = "val.required";
        });
      }
      if (ans.buerge === "Ja") required("buergeName");
      break;
  }
  return e;
}

/** The errors of step n in the state's mode. */
export function validateStep(step: number, state: ValidationState & Pick<FunnelState, "mode">): StepErrors {
  return validateScreen(screenAt(state.mode, step), state);
}

export function isStepValid(step: number, state: ValidationState & Pick<FunnelState, "mode">): boolean {
  return Object.keys(validateStep(step, state)).length === 0;
}
