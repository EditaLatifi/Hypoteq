/**
 * Step 6 «Abschluss» (Spezifikation 3, Schritt 6). Pure: everything the closing screen shows,
 * computed from the answers and the documents summary, in the funnel language.
 *
 *   - Kennzahlen: Gesamtfinanzierung, Belehnung, Tragbarkeit (calcFinancing), Unterlagen
 *     erfüllt / total («Habe ich nicht» counts as fulfilled, like the documents step)
 *   - Titel: «Das können wir finanzieren. Jetzt zur Bank.» only when the calculation verdict
 *     is ok AND no required document is missing; otherwise «Letzter Blick auf die Anfrage»
 *   - Hinweise an die Bank (bankHints, each with the extraction's note)
 *   - Prüfliste: Antrag, Objekt, Kreditnehmer, Tragbarkeit und Belehnung, Unterlagen,
 *     «Aus Dokumenten übernommen» (only once a value was read from a document), each
 *     «Bestätigt» or «Offen» as in the prototype
 *
 * Every document number is the shared tally (documentTally): the documents step, the
 * Kennzahl, the Prüfliste and the lead show the same figures, and they add up.
 */

import { calcForState, type CalcResult } from "./calc";
import type { FileEntry, SubmittedDocument } from "./files";
import { chf, pct } from "./format";
import { optionLabel, translate, type Lang, type Params } from "./i18n";
import { documentTally, type BankHint, type StatusResult } from "./requirementStatus";
import { chipsFor, type FunnelState } from "./types";

export interface FinishKpi {
  key: "need" | "ltv" | "aff" | "docs";
  label: string;
  value: string;
}

export interface FinishHint {
  instanceId: string;
  kind: BankHint["kind"];
  title: string;
  text: string;
}

export type CheckKey = "antrag" | "objekt" | "kreditnehmer" | "trag" | "docs" | "fromDocs";

export interface FinishCheck {
  key: CheckKey;
  label: string;
  sub: string;
  ok: boolean;
  /** «Bestätigt» / «Offen». */
  badge: string;
}

export interface FinishSummary {
  calc: CalcResult;
  /** True: «Das können wir finanzieren. Jetzt zur Bank.» */
  allGood: boolean;
  title: string;
  lead: string;
  kpis: FinishKpi[];
  hints: FinishHint[];
  hintsLabel: string;
  checks: FinishCheck[];
  /** Required requirements with nothing (or nothing finished) on them. */
  missingRequired: number;
  /** Requirements a person should look at: partial or outdated. */
  toReview: number;
  fulfilled: number;
  total: number;
  /** Extracted values (from analysed files on the list) — «N Angaben ausgelesen». */
  extractedFields: number;
  /** Values the customer confirmed or corrected — «M manuell bestätigt». */
  confirmedFields: number;
}

export interface FinishSummaryInput {
  state: Pick<FunnelState, "role" | "ans" | "txt" | "fin" | "borrowers"> & Partial<Pick<FunnelState, "em">>;
  /** documentsSummary(state).status */
  status: StatusResult;
  files: FileEntry[];
  hints: BankHint[];
  submittedDocuments?: SubmittedDocument[];
  lang: Lang;
}

const hasValue = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

/** Extracted values of the analysed files that count for a requirement on the list. */
export function countExtractedFields(status: StatusResult, files: FileEntry[]): number {
  const counted = new Set(status.requirements.flatMap((r) => r.fileIds));
  let n = 0;
  for (const f of files) {
    if (!counted.has(f.id) || f.analysisState !== "done" || !f.analysis?.fields) continue;
    for (const field of Object.values(f.analysis.fields)) if (field && hasValue(field.value)) n++;
  }
  return n;
}

export function countConfirmedFields(docs: SubmittedDocument[] | undefined): number {
  let n = 0;
  for (const d of docs || []) n += Object.keys(d.humanEdits || {}).length;
  return n;
}

export function finishSummary(input: FinishSummaryInput): FinishSummary {
  const { state, status, lang } = input;
  const t = (key: string, params?: Params) => translate(lang, key, params);
  const opt = (group: string, value: string | null | undefined) => optionLabel(lang, group, value);
  const { ans, txt } = state;
  const isAbl = ans.antrag === "Ablösung";
  const isJur = ans.kn === "Juristische Person";

  const calc = calcForState(state);

  // ---- documents
  const total = status.counts.total;
  const fulfilled = status.counts.fulfilled;
  const missingRequired = status.requirements.filter((r) => !r.instance.optional && (r.state === "missing" || r.state === "analysing")).length;
  const tally = documentTally(status.counts);
  const toReview = tally.review;
  // The verdict waits only for required documents; the numbers shown are the shared tally.
  const extractedFields = countExtractedFields(status, input.files);
  const confirmedFields = countConfirmedFields(input.submittedDocuments);

  const allGood = calc.verdict === "ok" && missingRequired === 0;
  const title = t(allGood ? "s6.titleOk" : "s6.title");
  const lead = missingRequired > 0 ? t("s6.leadMissing", { n: tally.missing }) : calc.verdict === "ok" ? t("s6.leadOk") : t("s6.leadReview");

  // ---- KPIs (prototype: Gesamtfinanzierung / Geschätzter Hypothekbedarf, Belehnung, Tragbarkeit, Unterlagen)
  const kpis: FinishKpi[] = [
    { key: "need", label: t(isAbl ? "s4.total" : "s4.need"), value: chf(calc.need) },
    { key: "ltv", label: t("s4.ltv"), value: pct(calc.ltv) },
    { key: "aff", label: t("s4.aff"), value: pct(calc.affordability) },
    { key: "docs", label: t("s6.kpi.docs"), value: `${fulfilled} / ${total}` },
  ];

  const hints: FinishHint[] = input.hints.map((h) => ({ instanceId: h.instanceId, kind: h.kind, title: t(h.titleKey), text: h.text }));

  // ---- Prüfliste
  const place = [txt.plz.trim(), txt.ort.trim()].filter(Boolean).join(" ");
  const borrowerNames = isJur
    ? [txt.firma.trim()].filter(Boolean)
    : state.borrowers
        .map((b, i) => [(i === 0 ? txt.vor || b.vor : b.vor).trim(), (i === 0 ? txt.nach || b.nach : b.nach).trim()].filter(Boolean).join(" "))
        .filter(Boolean);
  const nameLine = borrowerNames.length
    ? borrowerNames.join(" & ")
    : t(isJur ? "s6.kn.companyMissing" : "s6.kn.nameMissing");

  // v5 (prototype finalChecks): name, income, then the chips that were tapped.
  const tapped = chipsFor(ans.kn).filter((c) => ans[c] === "Ja").map((c) => t(`chip.${c}`));
  const knParts = isJur
    ? [nameLine, txt.zeichner.trim(), ...tapped].filter(Boolean)
    : [nameLine, calc.income > 0 ? t("s6.kn.gross", { amount: chf(calc.income) }) : t("s6.kn.incomeMissing"), ...tapped];

  const docsSub = [
    t("s5.fulfilled", { ok: fulfilled, total }),
    ...(toReview ? [t("s6.docs.review", { n: toReview })] : []),
    ...(tally.missing ? [t("s6.docs.missing", { n: tally.missing })] : []),
  ].join(" · ");

  const rows: Omit<FinishCheck, "badge">[] = [
    {
      key: "antrag",
      label: t("s6.check.antrag"),
      sub: [ans.antrag ? opt("antrag", ans.antrag) : "–", ...(isAbl ? [t("s6.antrag.total", { amount: chf(calc.need) })] : [])].join(" · "),
      ok: !!ans.antrag,
    },
    {
      key: "objekt",
      label: t("s6.check.objekt"),
      sub: [place, opt("lieg", ans.lieg), opt("nutz", ans.nutz)].filter(Boolean).join(" · ") || t("s6.objekt.none"),
      ok: !!(ans.lieg && ans.nutz && txt.plz.trim() && txt.ort.trim()),
    },
    {
      key: "kreditnehmer",
      label: t("s6.check.kreditnehmer"),
      sub: knParts.join(" · "),
      ok: borrowerNames.length > 0 && (isJur || calc.income > 0),
    },
    {
      key: "trag",
      label: t("s6.check.trag"),
      sub: `${pct(calc.affordability)} · ${pct(calc.ltv)}`,
      ok: calc.verdict === "ok",
    },
    {
      key: "docs",
      label: t("s6.check.docs"),
      sub: docsSub,
      ok: missingRequired === 0 && toReview === 0,
    },
    // Only once something was read from a document: «0 Angaben ausgelesen · Bestätigt» said nothing.
    ...(extractedFields > 0 || confirmedFields > 0
      ? [
          {
            key: "fromDocs" as const,
            label: t("s6.check.fromDocs"),
            sub: t("s6.fromDocsLine", { n: extractedFields, m: confirmedFields }),
            ok: true,
          },
        ]
      : []),
  ];
  const checks = rows.map((r) => ({ ...r, badge: t(r.ok ? "s6.badge.ok" : "s6.badge.open") }));

  return {
    calc,
    allGood,
    title,
    lead,
    kpis,
    hints,
    hintsLabel: t("s6.hints", { n: hints.length }),
    checks,
    missingRequired,
    toReview,
    fulfilled,
    total,
    extractedFields,
    confirmedFields,
  };
}
