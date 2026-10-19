/**
 * The live calculation (Handover 5, the prototype's calc(); DECISIONS V1). Shown from
 * «Objekt & Finanzierung» on, in the closing, the mail and the dossier, and sent to Salesforce.
 *
 *   Kauf
 *     Gesamtkosten        Kaufpreis + Renovationsbetrag (Renovation = Ja)
 *     Eigenmittel total   Ersparnisse + 3a + PK-Vorbezug + Schenkung + Erbvorbezug + Darlehen
 *                         (PK-Verpfändung is a security, not Eigenmittel)
 *     Hypothek            Gesamtkosten − Eigenmittel total · none entered: 80 % of the Gesamtkosten
 *     Belehnungsbasis     min(Gesamtkosten, Objektwert) — Niederstwertprinzip; empty Objektwert = Gesamtkosten (V20)
 *     harte Eigenmittel   Eigenmittel total − PK-Vorbezug · at least 10 % of the Kaufpreis
 *   Ablösung
 *     Hypothek            bestehende Hypothek + Erhöhung · Belehnungsbasis = Objektwert
 *   Both
 *     Belehnung           Hypothek / Basis                                           · max 80 %
 *     Tragbarkeit         (Hypothek × 5 % + max(Hypothek − ⅔ Basis, 0) / 15 + Basis × 1 %)
 *                         / Bruttoeinkommen Haushalt (Kreditnehmer 1 + 2)            · max 33 %
 *     Urteil              «Finanzierung möglich» (all limits kept) · «Prüfung nötig» · «Angaben ergänzen»
 *
 * Testfall Rosanna (Handover 5): Kaufpreis 500'000, Objektwert 1'000'000, Einkommen 150'000, no
 * Eigenmittel → Hypothek 400'000 · Belehnung 80 % · Tragbarkeit 19.6 % · «Finanzierung möglich».
 *
 * Juristische Person: Belehnung yes, Tragbarkeit «–» (no income) — it does not take part in
 * the verdict (DECISIONS D7). Unterhalt is not part of the Tragbarkeit (D7).
 *
 * Every parameter is a named constant below: the homepage calculator's formula may replace
 * this one (Handover 5, 10.3; DECISIONS V1) — here, in one place.
 *
 * Percentages are returned as percentages (44.4), not ratios, matching what is displayed.
 */

import type { Antrag, Eigenmittel, Kreditnehmer, YesNo } from "./types";

/** Belehnung limit, %. */
export const LTV_LIMIT = 80;
/** Tragbarkeit limit, %. */
export const AFFORDABILITY_LIMIT = 33;
/** Kauf without Eigenmittel entered: the mortgage is this share of the Gesamtkosten. */
export const PURCHASE_LTV = 0.8;
/** Kalkulatorischer Zins. */
export const STRESS_RATE = 0.05;
/** The 2nd mortgage (above ⅔ of the basis) is amortised over this many years. */
export const AMORTISATION_YEARS = 15;
export const AMORTISATION_THRESHOLD = 2 / 3;
/** Neben- und Unterhaltskosten, share of the basis per year. */
export const MAINTENANCE_RATE = 0.01;
/** Harte Eigenmittel: at least this share of the Kaufpreis. */
export const HARD_EQUITY_MIN = 0.1;

export interface CalcInput {
  antrag?: Antrag;
  kn: Kreditnehmer;
  // Kauf
  /** Kaufpreis. */
  kaufpreis: number;
  /** Renovation = Ja? (the amount counts only then). */
  reno: YesNo;
  /** Renovationsbetrag. */
  renoBetrag: number;
  /** The Eigenmittel table (PK-Verpfändung is not counted). */
  em: Eigenmittel;
  // Ablösung
  aufstockung: YesNo;
  /** Bestehende Hypothek. */
  old: number;
  /** Gewünschte Erhöhung. */
  up: number;
  // Both
  /** Geschätzter Objektwert (Kauf: empty = Kaufpreis + Renovation, DECISIONS V20). */
  val: number;
  /** Bruttoeinkommen of Kreditnehmer 1 and 2. */
  inc: number;
  inc2: number;
}

export type Verdict = "ok" | "review" | "incomplete";

export interface CalcResult {
  /** Hypothek — the Gesamtfinanzierung / geschätzter Hypothekarbedarf (CHF). */
  need: number;
  /** Kauf: Kaufpreis + Renovationsbetrag; Ablösung: 0. */
  cost: number;
  /** Eigenmittel total (Kauf), without PK-Verpfändung. */
  emTotal: number;
  /** Eigenmittel total in % of the Gesamtkosten; null without Gesamtkosten. */
  emPct: number | null;
  /** Harte Eigenmittel = Eigenmittel total − PK-Vorbezug. */
  hard: number;
  /** Harte Eigenmittel ≥ 10 % of the Kaufpreis — true when it does not apply (Ablösung, none entered). */
  hardOk: boolean;
  /** The Objektwert the calculation used (Kauf: Kaufpreis + Renovation when none was given). */
  value: number;
  /** Belehnungsbasis. */
  basis: number;
  /** Bruttoeinkommen Haushalt. */
  income: number;
  /** Belehnung in %; null without a basis. */
  ltv: number | null;
  /** Tragbarkeit in %; null without income, and always for a juristische Person. */
  affordability: number | null;
  verdict: Verdict;
  ltvOk: boolean;
  /** True when the Tragbarkeit is within the limit — and for a juristische Person, where it does not apply. */
  affOk: boolean;
}

const num = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** Ersparnisse + 3a + PK-Vorbezug + Schenkung + Erbvorbezug + Darlehen — PK-Verpfändung does not count. */
export function equityTotal(em: Eigenmittel): number {
  return num(em.spar) + num(em.s3a) + num(em.pkVor) + num(em.schenk) + num(em.erbe) + num(em.darl);
}

export function calcFinancing(input: CalcInput): CalcResult {
  const isJur = input.kn === "Juristische Person";
  const isAbl = input.antrag === "Ablösung";
  const price = num(input.kaufpreis);
  const cost = isAbl ? 0 : price + (input.reno === "Ja" ? num(input.renoBetrag) : 0);
  const emTotal = isAbl ? 0 : equityTotal(input.em);
  const hard = isAbl ? 0 : emTotal - num(input.em.pkVor);
  // An empty Objektwert at a Kauf stands for the Gesamtkosten, Kaufpreis plus Renovation
  // (DECISIONS V20, as in the prototype). Handover 2 says «leer = Kaufpreis», which would never
  // count a renovation as value (86.7 % instead of 81.3 % in the preview test); for HYPOTEQ to confirm.
  const value = num(input.val) || (isAbl ? 0 : cost);
  const basis = isAbl ? value : value ? Math.min(cost, value) : cost;
  const need = isAbl
    ? num(input.old) + (input.aufstockung === "Ja" ? num(input.up) : 0)
    : emTotal > 0
      ? Math.max(cost - emTotal, 0)
      : cost * PURCHASE_LTV;
  const income = isJur ? 0 : num(input.inc) + num(input.inc2);

  const ltv = basis > 0 ? (need / basis) * 100 : null;
  const affordability =
    !isJur && income > 0 && basis > 0
      ? ((need * STRESS_RATE + Math.max(need - basis * AMORTISATION_THRESHOLD, 0) / AMORTISATION_YEARS + basis * MAINTENANCE_RATE) /
          income) *
        100
      : null;

  const ltvOk = ltv !== null && ltv <= LTV_LIMIT;
  const affOk = isJur ? true : affordability !== null && affordability <= AFFORDABILITY_LIMIT;
  // Handover over prototype: «mind. 10 % des Kaufpreises» — the prototype took the Gesamtkosten.
  const hardOk = isAbl || emTotal === 0 || hard >= price * HARD_EQUITY_MIN;

  const incomplete = !input.antrag || basis <= 0 || need <= 0 || (!isJur && income <= 0);
  const verdict: Verdict = incomplete ? "incomplete" : ltvOk && affOk && hardOk ? "ok" : "review";

  return {
    need,
    cost,
    emTotal,
    emPct: cost > 0 ? (emTotal / cost) * 100 : null,
    hard,
    hardOk,
    value,
    basis,
    income,
    ltv,
    affordability,
    verdict,
    ltvOk,
    affOk,
  };
}

/** The calculation input of a funnel state (the answer model's names → CalcInput). */
export function calcInputOf(state: {
  ans: { antrag?: Antrag; kn: Kreditnehmer; reno: YesNo; aufstockung: YesNo };
  fin: { kaufpreis: number; renoBetrag?: number; old: number; up: number; val: number; inc: number; inc2?: number };
  em?: Eigenmittel;
  borrowers?: readonly unknown[];
}): CalcInput {
  const { ans, fin } = state;
  return {
    antrag: ans.antrag,
    kn: ans.kn,
    kaufpreis: fin.kaufpreis,
    reno: ans.reno,
    renoBetrag: fin.renoBetrag ?? 0,
    em: state.em ?? { spar: 0, s3a: 0, pkVor: 0, pkVerp: 0, schenk: 0, erbe: 0, darl: 0 },
    aufstockung: ans.aufstockung,
    old: fin.old,
    up: fin.up,
    val: fin.val,
    inc: fin.inc,
    // Kreditnehmer 2's income counts only while there is a Kreditnehmer 2.
    inc2: !state.borrowers || state.borrowers.length > 1 ? fin.inc2 ?? 0 : 0,
  };
}

/** calcFinancing(calcInputOf(state)). */
export function calcForState(state: Parameters<typeof calcInputOf>[0]): CalcResult {
  return calcFinancing(calcInputOf(state));
}
