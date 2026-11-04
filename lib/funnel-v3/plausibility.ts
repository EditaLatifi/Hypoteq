/**
 * Plausibility of the amounts (HYPOTEQ 03.11.2026 Befunde 4, 5; Fisnik 04.11.2026 Punkt 4;
 * DECISIONS V104). Pure.
 *
 * «Bewusst locker — lieber eine Anfrage zu viel im System als ein Kunde, der am Formular abprallt.»
 *
 *   hard stops (validate.ts, «Weiter» stays locked) — only what makes no sense technically:
 *     range       Kaufpreis, Objektwert, bestehende Hypothek under CHF 10'000 or over CHF 100 Mio.
 *     ceiling     Erhöhung, Renovationsbetrag, an Eigenmittel row over CHF 100 Mio. (typing errors)
 *     overCost    the mortgage above Objektwert plus Renovationsbetrag
 *   one soft note (here, never blocking) — also in the Abgleich JSON for the Pre-Check:
 *     overValue   Belehnung over 100 %: the mortgage above the Objektwert alone
 *
 * No limits on incomes or anything else. Where there is no Renovation (an Ablösung), «Objektwert
 * plus Renovation» is the Objektwert, so a mortgage above it is the hard stop there.
 */

import { calcForState } from "./calc";
import { objektwertShown } from "./objektwert";
import type { FunnelState } from "./types";

export const AMOUNT_LIMITS = {
  /** Kaufpreis, Objektwert, bestehende Hypothek. */
  min: 10_000,
  /** Every property and financing amount. */
  max: 100_000_000,
} as const;

export type PlausibilityState = Pick<FunnelState, "ans" | "fin" | "borrowers"> & Partial<Pick<FunnelState, "em" | "txt" | "info" | "touched" | "src">>;

const pos = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** The mortgage the request asks for, the Objektwert it stands on, the Renovationsbetrag. */
export function mortgageFigures(state: PlausibilityState): { mortgage: number; value: number; reno: number } {
  const { ans, fin } = state;
  const value = objektwertShown(state);
  if (ans.antrag === "Ablösung") return { mortgage: pos(fin.old) + (ans.aufstockung === "Ja" ? pos(fin.up) : 0), value, reno: 0 };
  if (ans.antrag === "Neue Hypothek") {
    const reno = ans.reno === "Ja" ? pos(fin.renoBetrag) : 0;
    return { mortgage: calcForState({ ...state, fin: { ...fin, val: value } } as Parameters<typeof calcForState>[0]).need, value, reno };
  }
  return { mortgage: 0, value, reno: 0 };
}

export type PlausibilityCode = "overValue";

export interface PlausibilityWarning {
  /** The field it belongs to (`val`). */
  field: string;
  code: PlausibilityCode;
  /** i18n key `val.plaus.<code>` — what the customer reads. */
  key: string;
  /** CHF amounts for the message. */
  params: Record<string, number>;
}

/**
 * The soft note: Belehnung over 100 % — unless the hard stop (mortgage above Objektwert plus
 * Renovation) already holds the step.
 */
export function plausibilityWarnings(state: PlausibilityState): PlausibilityWarning[] {
  const { mortgage, value, reno } = mortgageFigures(state);
  if (!(value > 0) || !(mortgage > value) || mortgage > value + reno) return [];
  return [{ field: "val", code: "overValue", key: "val.plaus.overValue", params: { amount: value, mortgage } }];
}

/** The warnings by field (the first per field). */
export function warningsByField(list: readonly PlausibilityWarning[]): Map<string, PlausibilityWarning> {
  const m = new Map<string, PlausibilityWarning>();
  for (const w of list) if (!m.has(w.field)) m.set(w.field, w);
  return m;
}
