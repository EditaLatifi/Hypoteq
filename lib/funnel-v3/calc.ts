/**
 * The live calculation of step 4 (spec chapter 3, «Schritt 4 · Finanzierung»; DECISIONS D7).
 *
 *   Gesamtfinanzierung  Ablösung: old + (Erhöhung = Ja ? up : 0) · Neue Hypothek: val × 80 %
 *   Belehnung           need / val                                   · limit 80 %
 *   Tragbarkeit         (need × 5 % + max(need − ⅔ val, 0) / 15 + val × 1 %) / inc · limit 33 %
 *   Urteil              ok (both limits kept) · review · incomplete (values missing)
 *
 * Juristische Person: Belehnung yes, Tragbarkeit «–» (no income) — it does not take part in
 * the verdict. Unterhalt is not part of the Tragbarkeit (D7).
 *
 * Percentages are returned as percentages (44.8), not ratios, matching what is displayed.
 */

import type { Antrag, Kreditnehmer, YesNo } from "./types";

export const LTV_LIMIT = 80;
export const AFFORDABILITY_LIMIT = 33;
/** Neue Hypothek: the estimate assumes 80 % Belehnung. */
export const PURCHASE_LTV = 0.8;
export const STRESS_RATE = 0.05;
export const AMORTISATION_YEARS = 15;
export const AMORTISATION_THRESHOLD = 2 / 3;
export const MAINTENANCE_RATE = 0.01;

export interface CalcInput {
  antrag?: Antrag;
  aufstockung: YesNo;
  /** Bestehende Hypothek. */
  old: number;
  /** Gewünschte Erhöhung. */
  up: number;
  /** Geschätzter Objektwert. */
  val: number;
  /** Bruttoeinkommen Haushalt. */
  inc: number;
  kn: Kreditnehmer;
}

export type Verdict = "ok" | "review" | "incomplete";

export interface CalcResult {
  /** Gesamtfinanzierung (CHF). */
  need: number;
  /** Belehnung in %; null without an Objektwert. */
  ltv: number | null;
  /** Tragbarkeit in %; null without income, and always for a juristische Person. */
  affordability: number | null;
  verdict: Verdict;
  ltvOk: boolean;
  /** True when the Tragbarkeit is within the limit — and for a juristische Person, where it does not apply. */
  affOk: boolean;
}

const num = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function calcFinancing(input: CalcInput): CalcResult {
  const old = num(input.old);
  const up = num(input.up);
  const val = num(input.val);
  const inc = num(input.inc);
  const isJur = input.kn === "Juristische Person";
  const isAbl = input.antrag === "Ablösung";

  const need = isAbl ? old + (input.aufstockung === "Ja" ? up : 0) : val * PURCHASE_LTV;

  const ltv = val > 0 ? (need / val) * 100 : null;

  const affordability =
    !isJur && inc > 0
      ? ((need * STRESS_RATE +
          Math.max(need - val * AMORTISATION_THRESHOLD, 0) / AMORTISATION_YEARS +
          val * MAINTENANCE_RATE) /
          inc) *
        100
      : null;

  const ltvOk = ltv !== null && ltv <= LTV_LIMIT;
  const affOk = isJur ? true : affordability !== null && affordability <= AFFORDABILITY_LIMIT;

  const incomplete = !input.antrag || val <= 0 || need <= 0 || (!isJur && inc <= 0);
  const verdict: Verdict = incomplete ? "incomplete" : ltvOk && affOk ? "ok" : "review";

  return { need, ltv, affordability, verdict, ltvOk, affOk };
}
