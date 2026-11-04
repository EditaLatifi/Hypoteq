/**
 * The Geschätzter Objektwert, prefilled (HYPOTEQ 03.11.2026 Befund 5; Fisnik 04.11.2026 Punkt 5;
 * DECISIONS V107). Pure.
 *
 * At a Kauf the field shows Kaufpreis plus Renovationsbetrag until the customer changes it —
 * editable, the same number the calculation took for an empty field anyway (V20). A value the
 * customer typed (or cleared), or one a document prefilled, is theirs. The request carries the
 * shown value and `valPrefilled: true` while it is the computed one, so the Pre-Check knows it is
 * calculated, not confirmed (Abgleich JSON `objektwert.prefilled`).
 */

import type { FunnelState } from "./types";

export type ObjektwertState = Pick<FunnelState, "ans" | "fin"> & Partial<Pick<FunnelState, "touched" | "src">>;

/** Kaufpreis + Renovationsbetrag at a Kauf; 0 otherwise. */
export function objektwertDefault(state: ObjektwertState): number {
  if (state.ans.antrag !== "Neue Hypothek") return 0;
  const price = state.fin.kaufpreis > 0 ? state.fin.kaufpreis : 0;
  const reno = state.ans.reno === "Ja" && (state.fin.renoBetrag ?? 0) > 0 ? state.fin.renoBetrag ?? 0 : 0;
  return price > 0 ? price + reno : 0;
}

/** The field shows the computed value: a Kauf, nothing typed, cleared or prefilled from a document. */
export function isObjektwertPrefilled(state: ObjektwertState): boolean {
  if (state.fin.val > 0) return false;
  if (state.touched?.["fin.val"] || state.src?.["fin.val"]) return false;
  return objektwertDefault(state) > 0;
}

/** The Objektwert as the field shows it (and as the request sends it). */
export function objektwertShown(state: ObjektwertState): number {
  return isObjektwertPrefilled(state) ? objektwertDefault(state) : state.fin.val > 0 ? state.fin.val : 0;
}
