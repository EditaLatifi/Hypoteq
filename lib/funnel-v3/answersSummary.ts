/**
 * «Deine Angaben aus dem Fragepfad» (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 2.1):
 * the answers of the question path as compact boxes on the last step, each with the screen its
 * «Bearbeiten» link opens. Pure — computed from the answers, in the funnel language.
 *
 *   Anfrage      Art · Personentyp
 *   Objekt       Liegenschaft · PLZ Ort · Nutzung
 *   Finanzierung Hypothekbedarf (Kauf: Kaufpreis, Eigenmittel; Ablösung: bestehende Hypothek, Erhöhung)
 *   Kreditnehmer one box per person: Name · Beschäftigung, Bruttoeinkommen (a company: Firma)
 *   Tragbarkeit und Belehnung, calculated (calc.ts), with the verdict of the calculation card
 */

import { calcForState, type CalcResult, type Verdict } from "./calc";
import { chf, pct } from "./format";
import { optionLabel, translate, type Lang, type Params } from "./i18n";
import type { Screen } from "./steps";
import type { FunnelState } from "./types";

export interface SummaryBox {
  key: string;
  /** Shown in capitals above the value. */
  label: string;
  /** The screen «Bearbeiten» opens. */
  screen: Screen;
  value: string;
  detail: string;
  /** Nothing answered yet: the value is a placeholder. */
  empty: boolean;
}

export type SummaryState = Pick<FunnelState, "ans" | "txt" | "fin" | "borrowers"> & Partial<Pick<FunnelState, "em">>;

/** The verdict line of the calculation card (components/funnel-v3/logic.ts VERDICT_KEY). */
const VERDICT_KEY: Record<Verdict, string> = { ok: "s4.verdict.ok", review: "s4.verdict.check", incomplete: "s4.verdict.missing" };

const DASH = "–";

export function answersSummary(state: SummaryState, lang: Lang, calc: CalcResult = calcForState(state)): SummaryBox[] {
  const t = (key: string, params?: Params) => translate(lang, key, params);
  const opt = (group: string, value: string | null | undefined) => optionLabel(lang, group, value);
  const { ans, txt, fin } = state;
  const isJur = ans.kn === "Juristische Person";
  const isAbl = ans.antrag === "Ablösung";
  const pair = (label: string, amount: number) => (amount > 0 ? `${label} ${chf(amount)}` : "");
  const line = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  const boxes: SummaryBox[] = [];

  boxes.push({
    key: "anfrage",
    label: t("step.anfrage"),
    screen: "anfrage",
    value: opt("antrag", ans.antrag) || DASH,
    detail: opt("kn", ans.kn),
    empty: !ans.antrag,
  });

  const place = [txt.plz.trim(), txt.ort.trim()].filter(Boolean).join(" ");
  boxes.push({
    key: "objekt",
    label: t("s6.check.objekt"),
    screen: "objekt",
    value: opt("lieg", ans.lieg) || place || DASH,
    detail: line(ans.lieg ? place : "", opt("nutz", ans.nutz)),
    empty: !ans.lieg && !place,
  });

  boxes.push({
    key: "finanzierung",
    label: t("mail.section.financing"),
    screen: "objekt",
    value: calc.need > 0 ? chf(calc.need) : DASH,
    detail: isAbl
      ? line(t("s4.total"), pair(t("s2.existingMortgage"), fin.old), ans.aufstockung === "Ja" ? pair(t("s2.increase"), fin.up) : "")
      : line(t("s4.need"), pair(t("s2.price"), fin.kaufpreis), pair(t("sum.equity"), calc.emTotal)),
    empty: !(calc.need > 0),
  });

  if (isJur) {
    const firma = txt.firma.trim();
    boxes.push({
      key: "company",
      label: t("q.kn"),
      screen: "personen",
      value: firma || t("s6.kn.companyMissing"),
      detail: txt.zeichner.trim(),
      empty: !firma,
    });
  } else {
    const people = state.borrowers.length ? state.borrowers : [{ id: "1", vor: "", nach: "", pkSe: "Nein" as const }];
    people.forEach((b, i) => {
      const name = [(i === 0 ? txt.vor || b.vor : b.vor).trim(), (i === 0 ? txt.nach || b.nach : b.nach).trim()].filter(Boolean).join(" ");
      const income = i === 0 ? fin.inc : i === 1 ? fin.inc2 || 0 : 0;
      boxes.push({
        key: `person:${b.id}`,
        label: t("s3.borrower", { n: i + 1 }),
        screen: "personen",
        value: name || t("s6.kn.nameMissing"),
        detail: line(opt("job", b.job), income > 0 ? t("s6.kn.gross", { amount: chf(income) }) : i < 2 ? t("s6.kn.incomeMissing") : ""),
        empty: !name,
      });
    });
  }

  boxes.push({
    key: "trag",
    label: t("s6.check.trag"),
    screen: "objekt",
    value: t(VERDICT_KEY[calc.verdict]),
    detail: line(isJur || calc.affordability === null ? "" : `${t("s4.aff")} ${pct(calc.affordability)}`, calc.ltv === null ? "" : `${t("s4.ltv")} ${pct(calc.ltv)}`),
    empty: calc.verdict === "incomplete",
  });

  return boxes;
}
