/**
 * Plausibility of the amounts (HYPOTEQ «Pre-Check und Rücklieferung» 03.11.2026, Befunde 4 and 5;
 * DECISIONS V104). Pure.
 *
 * The test ran a Geschätzter Objektwert of CHF 10'000 under a mortgage of CHF 500'000, and
 * amounts in the billions, without a word. These checks say so under the field — they never
 * block «Weiter» or the closing (the customer may know better; the analyst sees the same hints
 * in the Abgleich JSON). The limits are start values in one place until HYPOTEQ confirms them.
 *
 *   ceiling     an amount above its ceiling                     «ungewöhnlich hoch – bitte prüfen»
 *   floor       a Kaufpreis / Objektwert below CHF 100'000      «ungewöhnlich tief – bitte prüfen»
 *   overValue   the mortgage above the Objektwert               «höher als der Objektwert»
 *   farBelow    a Kauf's Objektwert under half the Kaufpreis    «weit unter dem Kaufpreis»
 *   renoOver    the Renovationsbetrag above the Kaufpreis       «höher als der Kaufpreis»
 */

import { calcForState } from "./calc";
import type { FunnelState } from "./types";

/** Start values (CHF) — HYPOTEQ to confirm. */
export const PLAUSIBILITY_LIMITS = {
  /** Kaufpreis, Objektwert, bestehende Hypothek, Erhöhung, Renovation, each Eigenmittel row. */
  propertyMax: 50_000_000,
  /** Kaufpreis and Objektwert, when entered. */
  propertyMin: 100_000,
  /** Bruttoeinkommen per Kreditnehmer and the Netto-Mietertrag, per year. */
  incomeMax: 5_000_000,
  /** A Kauf's Objektwert below this share of the Kaufpreis. */
  valueShareOfPrice: 0.5,
} as const;

export type PlausibilityCode = "ceiling" | "floor" | "overValue" | "farBelow" | "renoOver";

export interface PlausibilityWarning {
  /** The field it belongs to, as validate.ts names them (`val`, `old`, `em.schenk`, `inc`). */
  field: string;
  code: PlausibilityCode;
  /** i18n key `val.plaus.<code>`. */
  key: string;
  /** CHF amounts for the message. */
  params: Record<string, number>;
}

export type PlausibilityState = Pick<FunnelState, "ans" | "fin" | "borrowers"> & Partial<Pick<FunnelState, "em" | "txt" | "info">>;

const pos = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

export function plausibilityWarnings(state: PlausibilityState): PlausibilityWarning[] {
  const L = PLAUSIBILITY_LIMITS;
  const { ans, fin } = state;
  const kauf = ans.antrag === "Neue Hypothek";
  const abl = ans.antrag === "Ablösung";
  const out: PlausibilityWarning[] = [];
  const warn = (field: string, code: PlausibilityCode, params: Record<string, number> = {}) => out.push({ field, code, key: `val.plaus.${code}`, params });
  const ceiling = (field: string, value: number, max: number) => {
    if (value > max) warn(field, "ceiling", { amount: value, max });
  };

  const price = kauf ? pos(fin.kaufpreis) : 0;
  const reno = kauf && ans.reno === "Ja" ? pos(fin.renoBetrag) : 0;
  const val = pos(fin.val);
  const old = abl ? pos(fin.old) : 0;
  const up = abl && ans.aufstockung === "Ja" ? pos(fin.up) : 0;

  if (kauf) {
    ceiling("kaufpreis", price, L.propertyMax);
    if (price > 0 && price < L.propertyMin) warn("kaufpreis", "floor", { amount: price, min: L.propertyMin });
    ceiling("renoBetrag", reno, L.propertyMax);
    if (price > 0 && reno > price) warn("renoBetrag", "renoOver", { amount: reno, price });
  }
  if (abl) {
    ceiling("old", old, L.propertyMax);
    ceiling("up", up, L.propertyMax);
  }

  // The Objektwert: its own bounds, then against the mortgage and (Kauf) the Kaufpreis.
  // The most telling first: against the mortgage, against the Kaufpreis, then the bounds.
  if (val > 0 && ans.antrag) {
    const mortgage = abl ? old + up : kauf ? calcForState(state as Parameters<typeof calcForState>[0]).need : 0;
    if (mortgage > val) warn("val", "overValue", { amount: val, mortgage });
    else if (kauf && price > 0 && val < price * L.valueShareOfPrice) warn("val", "farBelow", { amount: val, price });
    if (val > L.propertyMax) warn("val", "ceiling", { amount: val, max: L.propertyMax });
    else if (val < L.propertyMin) warn("val", "floor", { amount: val, min: L.propertyMin });
  }

  // Eigenmittel rows.
  const em = state.em;
  if (em) for (const [k, v] of Object.entries(em)) ceiling(`em.${k}`, pos(v as number), L.propertyMax);

  // Incomes and the rent.
  ceiling("inc", pos(fin.inc), L.incomeMax);
  if (state.borrowers.length > 1) ceiling("inc2", pos(fin.inc2), L.incomeMax);
  ceiling("miete", pos(fin.miete), L.incomeMax);
  return out;
}

/** The warnings by field (the first per field — the most telling comes first). */
export function warningsByField(list: readonly PlausibilityWarning[]): Map<string, PlausibilityWarning> {
  const m = new Map<string, PlausibilityWarning>();
  for (const w of list) if (!m.has(w.field)) m.set(w.field, w);
  return m;
}
