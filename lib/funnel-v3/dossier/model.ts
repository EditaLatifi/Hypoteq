/**
 * The Fall-Dossier as data (prototype docs/funnel-v3/prototype/dossier-app.html). Pure:
 * the sections, rows and annex the PDF renderer draws, in the funnel language (D11).
 *
 *   running header / footer · Deckblatt with KPIs · 01 Antrag · 02 Objekt · 03 Kreditnehmer ·
 *   04 Finanzierung und Tragbarkeit · 05 Verlauf · Annex Dokumentenverzeichnis A Objekt /
 *   B Hypothek / C Person / D Eigenmittel / E Weitere Dateien · Vollständigkeit
 *
 * The annex lists files under the name they have in the case folder (spec 5.1: «Das
 * Fall-Dossier und sein Annex verwenden die neuen Namen»); a draft before the closing uses
 * the original names, because nothing has been renamed yet.
 */

import { calcFinancing, AFFORDABILITY_LIMIT, AMORTISATION_THRESHOLD, AMORTISATION_YEARS, MAINTENANCE_RATE, STRESS_RATE, type CalcResult } from "../calc";
import type { V3Analysis } from "../files";
import { chf, date as fmtDate, pct } from "../format";
import { interpolate, optionLabel, translate, type Lang, type Params } from "../i18n";
import { GROUP_ORDER, reqList, type ReqGroup, type ReqReason } from "../requirements";
import { bankHints, requirementStatus, type BankHint, type ExtraKind, type RequirementStatus, type StatusResult, type UploadedFile } from "../requirementStatus";
import { KORRESPONDENZSPRACHE } from "../toInquiryPayload";
import type { FunnelState } from "../types";
import { DOSSIER_TEXTS, type DossierTexts } from "./texts";

/** One uploaded file as the dossier sees it. */
export interface DossierFile {
  id: string;
  /** The name in the case folder (stored name); the original name before the closing. */
  name: string;
  originalName?: string;
  /** Requirement instance the file is placed on; null for «Weitere Dateien». */
  instanceId: string | null;
  extraKind?: ExtraKind;
  keep?: boolean;
  outdatedOverride?: boolean;
  /** Deleted from the case folder at the closing (duplicate / not needed and not kept). */
  removed?: boolean;
  analysis?: V3Analysis | null;
}

export interface DossierInput {
  lang: Lang;
  /** Before the closing: no case number, «Entwurf» everywhere. */
  draft: boolean;
  caseNumber: string | null;
  /** Date of the closing (or of the draft). */
  date: Date;
  state: Pick<FunnelState, "role" | "ans" | "txt" | "fin" | "borrowers">;
  files: DossierFile[];
  /** Instance ids marked «Habe ich nicht». */
  skipped?: string[];
}

export interface KeyValue {
  label: string;
  value: string;
  strong?: boolean;
}

export interface Kpi {
  label: string;
  value: string;
  accent?: boolean;
}

export interface TableCell {
  text: string;
  /** Second line, smaller and muted (e.g. the requirement's origin). */
  sub?: string;
  /** The sub line is a warning (missing / outdated). */
  warn?: boolean;
  strong?: boolean;
  muted?: boolean;
}

export interface Table {
  head: string[];
  /** Relative column widths. */
  widths: number[];
  /** Columns aligned right. */
  right?: number[];
  rows: TableCell[][];
}

export interface DossierSection {
  title: string;
  /** Two key/value columns. */
  columns?: [KeyValue[], KeyValue[]];
  /** Lime-bordered remarks (Verwendungszweck, Hinweise an die Bank). */
  callouts?: { label: string; text: string }[];
  /** Heading above the callouts (section 04: «Hinweise an die Bank»). */
  calloutsTitle?: string;
  /** Dark KPI band (section 04). */
  band?: Kpi[];
  table?: Table;
  notes?: string[];
}

export interface AnnexGroup {
  title: string;
  table: Table;
}

export interface DossierModel {
  lang: Lang;
  documentTitle: string;
  header: { brand: string; right: string };
  footer: { left: string; right: string; page: string };
  cover: {
    eyebrow: string;
    title: string[];
    description: string;
    kpis: Kpi[];
    left: string;
    right: string;
    draft?: string;
  };
  sections: DossierSection[];
  annex: {
    title: string;
    intro: string;
    groups: AnnexGroup[];
    completeness: { label: string; value: string; note: string };
  };
  /** For callers and tests. */
  status: StatusResult;
  hints: BankHint[];
  calc: CalcResult;
}

const MAX_FACTS = 4;

export function toUploadedFile(f: DossierFile): UploadedFile {
  return {
    fileId: f.id,
    requirementId: f.instanceId ?? null,
    status: f.analysis?.status === "failed" ? "failed" : "done",
    outdated: Boolean(f.analysis?.outdated),
    outdatedOverride: Boolean(f.outdatedOverride),
    extraKind: f.instanceId ? undefined : f.extraKind ?? f.analysis?.extraKind ?? "unknown",
    note: f.analysis?.note ?? undefined,
  };
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** «Eigentümer: Gary Samuel Gerber · Blatt: 7357 / 7361» from the extracted fields. */
function facts(files: DossierFile[], max = MAX_FACTS): string {
  const out: string[] = [];
  for (const f of files) {
    for (const [key, field] of Object.entries(f.analysis?.fields || {})) {
      const v = str(field?.value);
      if (!v || out.length >= max) continue;
      out.push(`${key}: ${v}`);
    }
  }
  return out.join(" · ");
}

function firstField(files: DossierFile[], keys: string[]): string {
  for (const f of files)
    for (const k of keys) {
      const v = str(f.analysis?.fields?.[k]?.value);
      if (v) return v;
    }
  return "";
}

export function buildDossierModel(input: DossierInput): DossierModel {
  const { lang, state } = input;
  const T: DossierTexts = DOSSIER_TEXTS[lang] ?? DOSSIER_TEXTS.de;
  const t = (key: string, params?: Params) => translate(lang, key, params);
  const d = (text: string, params?: Params) => interpolate(text, params);
  const opt = (group: string, value: string | null | undefined) => optionLabel(lang, group, value);
  const { ans, txt, fin } = state;
  const isAbl = ans.antrag === "Ablösung";
  const isKauf = ans.antrag === "Neue Hypothek";
  const isJur = ans.kn === "Juristische Person";
  const increase = isAbl && ans.aufstockung === "Ja";

  // ---- documents
  const instances = reqList(state);
  const uploaded = input.files.filter((f) => !f.removed).map(toUploadedFile);
  const status = requirementStatus(instances, uploaded, input.skipped ?? []);
  const hints = bankHints(status, uploaded);
  const byId = new Map(input.files.map((f) => [f.id, f]));
  const filesOf = (r: RequirementStatus) => r.fileIds.map((id) => byId.get(id)).filter((f): f is DossierFile => !!f);
  const filesOfReq = (id: string) => status.requirements.filter((r) => r.instance.id === id).flatMap(filesOf);

  const calc = calcFinancing({ antrag: ans.antrag, aufstockung: ans.aufstockung, old: fin.old, up: fin.up, val: fin.val, inc: fin.inc, kn: ans.kn });
  const bank = (filesOfReq("hyp_zins").concat(filesOfReq("hyp_rahmen"), filesOfReq("hyp_sicher")).map((f) => str(f.analysis?.bank)).find(Boolean)) || "";

  const caseLabel = input.caseNumber || (input.draft ? T.draft : "–");
  const today = fmtDate(input.date);
  const place = [txt.plz.trim(), txt.ort.trim()].filter(Boolean).join(" ");
  const names = isJur
    ? [txt.firma.trim()].filter(Boolean)
    : state.borrowers.map((b, i) => [(i === 0 ? txt.vor || b.vor : b.vor).trim(), (i === 0 ? txt.nach || b.nach : b.nach).trim()].filter(Boolean).join(" ")).filter(Boolean);
  const lastName = isJur ? txt.firma.trim() : (txt.nach || state.borrowers[0]?.nach || "").trim();

  // ---- header, footer, cover
  const antragLabel = ans.antrag ? opt("antrag", ans.antrag) : "–";
  const partnerName = [txt.pvor.trim(), txt.pnach.trim()].filter(Boolean).join(" ");
  const submitter = state.role === "berater"
    ? t("side.submittedBy", { name: [partnerName, txt.bmail.trim()].filter(Boolean).join(" · ") || "HYPOTEQ" })
    : t("side.ownRequest");

  const descParts: string[] = [];
  const objectLine = [opt("lieg", ans.lieg), opt("nutz", ans.nutz)].filter(Boolean).join(", ");
  if (objectLine) descParts.push(objectLine.charAt(0).toUpperCase() + objectLine.slice(1));
  if (isAbl && fin.old > 0) {
    descParts.push(d(bank ? T.descAblBank : T.descAbl, { bank, old: chf(fin.old) }) + (increase && fin.up > 0 ? d(T.descIncrease, { up: chf(fin.up) }) : ""));
  } else if (isKauf && fin.kaufpreis > 0) {
    descParts.push(d(T.descKauf, { price: chf(fin.kaufpreis) }));
  }

  const kpiNeed: Kpi = { label: t(isAbl ? "s4.total" : "s4.need"), value: chf(calc.need), accent: true };
  const kpiLtv: Kpi = { label: t("s4.ltv"), value: pct(calc.ltv), accent: true };
  const kpiAff: Kpi = { label: t("s4.aff"), value: pct(calc.affordability), accent: true };

  const cover = {
    eyebrow: d(T.eyebrow, { antrag: increase ? d(T.withIncrease, { antrag: antragLabel }) : antragLabel }),
    title: [names.join(" & ") || "–", place].filter(Boolean),
    description: descParts.length ? descParts.join(". ") + "." : "",
    kpis: [kpiNeed, kpiLtv, kpiAff],
    left: submitter,
    right: d(T.dateLine, { case: caseLabel, date: today }),
    ...(input.draft ? { draft: T.draft } : {}),
  };

  // ---- 01 Antrag
  const yesNo = (v: string | undefined) => (v === "Ja" ? t("common.yes") : v === "Nein" ? t("common.no") : "–");
  const knLine = isJur ? opt("kn", ans.kn) : d(T.natBorrowers, { kn: opt("kn", ans.kn), n: Math.max(names.length, 1) });
  const s1Left: KeyValue[] = [
    { label: T.antrag, value: antragLabel },
    { label: T.kreditnehmer, value: knLine },
    ...(isAbl ? [{ label: T.existingBank, value: bank || "–" }, { label: T.existingMortgage, value: chf(fin.old) }] : []),
    ...(isKauf ? [{ label: T.price, value: fin.kaufpreis > 0 ? chf(fin.kaufpreis) : "–" }] : []),
  ];
  const s1Right: KeyValue[] = [
    ...(increase ? [{ label: T.increase, value: chf(fin.up) }] : []),
    { label: T.total, value: chf(calc.need), strong: true },
    { label: T.term, value: ans.laufzeit ? opt("laufzeit", ans.laufzeit) : "–" },
    { label: T.offers, value: ans.angebote === "Ja" ? yesNo("Ja") : T.offersNone },
    { label: T.language, value: languageName(lang) },
  ];
  const callouts: { label: string; text: string }[] = [];
  if (increase && txt.zweck.trim()) callouts.push({ label: T.purpose, text: txt.zweck.trim() });
  if (txt.kommentar.trim()) callouts.push({ label: T.comment, text: txt.kommentar.trim() });

  // ---- 02 Objekt (answers, then what the object documents say)
  const s2Left: KeyValue[] = [
    { label: T.place, value: place || "–" },
    { label: T.immo, value: opt("immo", ans.immo) || "–" },
    { label: T.lieg, value: opt("lieg", ans.lieg) || "–" },
    { label: T.nutz, value: opt("nutz", ans.nutz) || "–" },
  ];
  const s2Right: KeyValue[] = [
    { label: T.heating, value: opt("heizung", ans.heizung) || "–" },
    { label: T.buildingRight, value: yesNo(ans.baurecht) },
    { label: T.value, value: fin.val > 0 ? chf(fin.val) : "–" },
  ];
  const objectFacts = factRows(status, byId, "objekt", 6);
  objectFacts.forEach((kv, i) => (i % 2 ? s2Right : s2Left).push(kv));

  // ---- 03 Kreditnehmer
  const s3Left: KeyValue[] = [];
  const s3Right: KeyValue[] = [];
  if (isJur) {
    s3Left.push({ label: T.company, value: txt.firma.trim() || "–" }, { label: T.signatory, value: txt.zeichner.trim() || "–" });
  } else {
    state.borrowers.forEach((b, i) => {
      const name = names[i] || "–";
      const idFiles = status.requirements.filter((r) => r.instance.id === "id" && r.instance.borrowerId === b.id).flatMap(filesOf);
      const born = firstField(idFiles, ["Geburtsdatum", "Geburtsdatum / Nationalität"]);
      const nat = firstField(idFiles, ["Nationalität", "Nationalitaet"]);
      s3Left.push({ label: d(T.borrower, { n: i + 1 }), value: [name, born, nat].filter(Boolean).join(" · ") });
      s3Left.push({ label: T.job, value: [opt("job", b.job) || "–", b.job === "Selbständig" ? `${T.pkSe}: ${yesNo(b.pkSe)}` : ""].filter(Boolean).join(" · ") });
    });
    s3Left.push({ label: T.ab50, value: yesNo(ans.ab50) });
    s3Right.push({ label: T.income, value: fin.inc > 0 ? chf(fin.inc) : "–", strong: true });
    s3Right.push({ label: T.children, value: yesNo(ans.kinder) });
    s3Right.push({ label: T.maintenance, value: yesNo(ans.unterhalt) });
  }
  s3Right.push({ label: T.loans, value: yesNo(ans.kredite) });
  s3Right.push({ label: T.leasing, value: yesNo(ans.leasing) });
  s3Right.push({ label: T.guarantor, value: ans.buerge === "Ja" ? txt.buergeName.trim() || yesNo("Ja") : T.guarantorNone });

  // ---- 04 Finanzierung und Tragbarkeit
  const need = calc.need;
  const interest = need * STRESS_RATE;
  const amort = Math.max(need - fin.val * AMORTISATION_THRESHOLD, 0) / AMORTISATION_YEARS;
  const running = fin.val * MAINTENANCE_RATE;
  const burden = interest + amort + running;
  const costRows: TableCell[][] = [
    [{ text: d(T.interest, { need: chf(need) }) }, { text: chf(interest) }],
    [{ text: amort > 0 ? T.amortisation : T.amortisationNone }, { text: chf(amort) }],
    [{ text: T.maintenanceCost }, { text: chf(running) }],
    [{ text: T.totalBurden, strong: true }, { text: chf(burden), strong: true }],
  ];
  if (!isJur) costRows.push([{ text: d(T.shareOfIncome, { inc: fin.inc > 0 ? chf(fin.inc) : "–" }), muted: true }, { text: `${pct(calc.affordability)} (max. ${AFFORDABILITY_LIMIT} %)` }]);
  const verdictKey = calc.verdict === "ok" ? "s4.verdict.ok" : calc.verdict === "review" ? "s4.verdict.check" : "s4.verdict.missing";
  const sources = [
    ans.s3a === "Ja" ? T.equity3a : "",
    ans.pk === "Ja" ? T.equityPk : "",
    ans.schenkung === "Ja" ? T.equityGift : "",
    ans.erbe === "Ja" ? T.equityInheritance : "",
    ans.darlehen === "Ja" ? T.equityLoan : "",
  ].filter(Boolean);
  const s4Notes = [
    `${T.verdict}: ${t(verdictKey)}`,
    ...(isJur ? [T.affNotApplicable] : []),
    ...(ans.unterhalt === "Ja" && !isJur ? [T.maintNote] : []),
    sources.length ? d(T.equity, { sources: sources.join(", ") }) : T.equityNone,
  ];

  // ---- 05 Verlauf
  const storedFiles = input.files.filter((f) => !f.removed);
  const history: TableCell[][] = [
    [{ text: today, muted: true }, { text: input.draft ? T.historyDraft : d(T.historySubmitted, { case: input.caseNumber ? ` · ${input.caseNumber}` : "" }) }],
    [{ text: today, muted: true }, { text: d(T.historyFiles, { n: storedFiles.length, ok: status.counts.fulfilled, total: status.counts.total }) }],
  ];
  if (hints.length) history.push([{ text: today, muted: true }, { text: d(T.historyHints, { n: hints.length }) }]);

  const sections: DossierSection[] = [
    { title: T.s1, columns: [s1Left, s1Right], callouts },
    { title: T.s2, columns: [s2Left, s2Right] },
    { title: T.s3, columns: [s3Left, s3Right] },
    {
      title: T.s4,
      band: [
        { label: T.objectValue, value: fin.val > 0 ? chf(fin.val) : "–" },
        { label: T.newMortgage, value: chf(need), accent: true },
        { label: t("s4.ltv"), value: pct(calc.ltv) },
        { label: t("s4.aff"), value: pct(calc.affordability) },
      ],
      table: { head: [T.costs, T.amount], widths: [3, 1.3], right: [1], rows: costRows },
      notes: s4Notes,
    },
    { title: T.s5, table: { head: [], widths: [0.9, 5], rows: history } },
  ];

  // ---- Annex
  const reasonText = (reason: ReqReason): string => {
    if (reason.key !== "why.because") return t(reason.key);
    const r = reason.conditions.map((c) => `${T.questions[c.question] ?? c.question} = ${opt(c.question, c.value) || c.value}`).join(" · ");
    return t("why.because", { reason: r });
  };
  const letters: Record<ReqGroup, string> = { objekt: "A", hypothek: "B", person: "C", eigenmittel: "D" };
  const groupTitle: Record<ReqGroup, string> = { objekt: t("grp.objekt"), hypothek: t("grp.hypothek"), person: t("grp.person"), eigenmittel: T.grpD };
  const reqHead = [T.colNo, T.colReq, T.colFile, T.colFacts];
  const groups: AnnexGroup[] = [];
  const personNames = new Set(status.requirements.filter((r) => r.instance.group === "person").map((r) => r.instance.person?.display).filter(Boolean));
  for (const g of GROUP_ORDER) {
    const rs = status.requirements.filter((r) => r.instance.group === g);
    if (!rs.length) continue;
    const rows = rs.map((r, i): TableCell[] => {
      const fs = filesOf(r);
      const label = t(r.instance.labelKey) + (r.instance.person?.display && personNames.size > 1 ? ` · ${r.instance.person.display}` : "");
      const stateLine = stateNote(r, fs, lang, T);
      return [
        { text: `${letters[g]}${i + 1}` },
        { text: label, sub: [reasonText(r.instance.reason), stateLine.text].filter(Boolean).join(" · "), warn: stateLine.warn },
        { text: fs.length ? fs.map((f) => f.name).join("\n") : T.noFile },
        { text: facts(fs) },
      ];
    });
    const single = g === "person" && personNames.size === 1 ? ` · ${[...personNames][0]}` : "";
    groups.push({ title: `${letters[g]} · ${groupTitle[g]}${single}`, table: { head: reqHead, widths: [0.45, 2.1, 2.6, 2.5], rows } });
  }
  const extras = input.files.filter((f) => !f.instanceId || !status.requirements.some((r) => r.fileIds.includes(f.id)));
  if (extras.length) {
    const rows = extras.map((f, i): TableCell[] => {
      const kind = (f.instanceId ? "unknown" : f.extraKind ?? f.analysis?.extraKind ?? "unknown") as ExtraKind;
      const why = [t(`state.${kind}`), str(f.analysis?.extraReason), f.removed ? (kind === "duplicate" ? T.duplicateOf : T.notStored) : T.kept].filter(Boolean).join(" – ");
      return [{ text: `E${i + 1}` }, { text: f.name, sub: f.originalName && f.originalName !== f.name ? f.originalName : undefined }, { text: why }];
    });
    groups.push({ title: `E · ${T.grpE}`, table: { head: [T.colNo, T.colFile, T.colKind], widths: [0.45, 4.5, 2.7], rows } });
  }

  const counted = new Set(status.requirements.flatMap((r) => r.fileIds));
  const recognised = input.files.filter((f) => counted.has(f.id)).length;
  const keptExtras = extras.filter((f) => !f.removed).length;
  const removedExtras = extras.filter((f) => f.removed).length;
  const extrasLine = removedExtras > 0 ? T.annexExtras : T.annexExtrasKept;
  const intro = d(T.annexIntro, { n: recognised }) + (extras.length ? " " + d(extrasLine, { kept: keptExtras, removed: removedExtras }) : "");

  const hintTitles = hints.map((h) => t(h.titleKey) + (h.kind === "outdated" ? ` (${t("state.outdated")})` : ""));
  const completeness = {
    label: T.completeness,
    value: t("s5.fulfilled", { ok: status.counts.fulfilled, total: status.counts.total }),
    note: hints.length ? d(T.hintsCount, { n: hints.length, list: hintTitles.join("; ") }) : T.noHints,
  };

  // Hinweise an die Bank also stand in section 04, with the extraction's note.
  if (hints.length) {
    sections[3].callouts = hints.map((h) => ({ label: t(h.titleKey), text: h.text || t("state.outdated") }));
    sections[3].calloutsTitle = T.hintsTitle;
  }

  return {
    lang,
    documentTitle: `${T.title} ${caseLabel}`,
    header: { brand: "HYPOTEQ", right: [T.title, caseLabel, [lastName, txt.ort.trim()].filter(Boolean).join(", ")].filter(Boolean).join(" · ") },
    footer: { left: T.confidential, right: T.site, page: T.page },
    cover,
    sections,
    annex: { title: T.annex, intro, groups, completeness },
    status,
    hints,
    calc,
  };
}

function languageName(lang: Lang): string {
  // The Salesforce value is German; in the dossier the language names itself.
  const own: Record<Lang, string> = { de: "Deutsch", en: "English", fr: "Français", it: "Italiano" };
  return own[lang] ?? KORRESPONDENZSPRACHE[lang];
}

/** The status part of the annex origin line: «Fehlt», «Veraltet · 15.01.2026, trotzdem verwendet», «2 von 3 Dateien». */
function stateNote(r: RequirementStatus, files: DossierFile[], lang: Lang, T: DossierTexts): { text: string; warn: boolean } {
  const t = (key: string, params?: Params) => translate(lang, key, params);
  switch (r.state) {
    case "missing":
    case "analysing":
      return { text: t("state.missing"), warn: !r.instance.optional };
    case "skipped":
      return { text: t("state.skipped"), warn: false };
    case "partial":
      return { text: t("s5.filesOf", { n: r.doneFiles, total: r.expect }), warn: true };
    case "outdated":
    case "ok": {
      if (!r.outdatedFile) return { text: "", warn: false };
      const when = files.map((f) => f.analysis?.docDate).filter(Boolean).map((x) => fmtDate(String(x)) || String(x))[0];
      return { text: [t("state.outdated"), when, r.overridden ? T.used : ""].filter(Boolean).join(" · "), warn: true };
    }
  }
}

/** Extracted values of the documents of one group, as key/value rows (deduplicated by key). */
function factRows(status: StatusResult, byId: Map<string, DossierFile>, group: ReqGroup, max: number): KeyValue[] {
  const out: KeyValue[] = [];
  const seen = new Set<string>();
  for (const r of status.requirements) {
    if (r.instance.group !== group) continue;
    for (const id of r.fileIds) {
      const f = byId.get(id);
      for (const [key, field] of Object.entries(f?.analysis?.fields || {})) {
        const v = str(field?.value);
        if (!v || seen.has(key.toLowerCase()) || out.length >= max) continue;
        seen.add(key.toLowerCase());
        out.push({ label: key, value: v });
      }
    }
  }
  return out;
}
