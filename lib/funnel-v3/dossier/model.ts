/**
 * The Fall-Dossier as data (HYPOTEQ's dossier prototype, dossier-app.html — no longer in the
 * repository, it carried real customer data). Pure:
 * the sections, rows and annex the PDF renderer draws, in the funnel language (D11).
 *
 *   running header / footer · Deckblatt with KPIs · 01 Antrag · 02 Objekt · 03 Kreditnehmer ·
 *   04 Finanzierung und Tragbarkeit · 05 Verlauf · Annex Dokumentenverzeichnis A Objekt /
 *   B Hypothek / C Person / D Eigenmittel / E Weitere Dateien · Vollständigkeit
 *
 * The annex lists files under the name they have in the case folder (spec 5.1: «Das
 * Fall-Dossier und sein Annex verwenden die neuen Namen»); a draft before the closing uses
 * the original names, because nothing has been renamed yet.
 *
 * v5 (Handover 2, 3.1, 6; the v5 reference dossier): 01 carries the Kauf block (Kaufpreis,
 * Kaufdatum, Renovationsbetrag, reserviert), the Ablösedatum and Zins from the Zinsabrechnung
 * and the Auskunftsermächtigung; 02 the Netto-Mietertrag and what the object documents say;
 * 03 each Kreditnehmer (Kreditnehmer 2 only when captured) with what the ID, the tax return
 * and the Lohnausweis say, a company with UID, Sitz and signatory, the chips with their
 * documents' amounts; 04 the Eigenmittel table (entered rows, total, %, hard part). A value
 * read from the documents carries «aus Dokument» (and the document when the prefill knows it),
 * like the internal mail. The annex is the v5 list, P0 included, with the signature's state.
 */

import { calcForState, AFFORDABILITY_LIMIT, AMORTISATION_THRESHOLD, AMORTISATION_YEARS, MAINTENANCE_RATE, STRESS_RATE, type CalcResult } from "../calc";
import type { StoredFunnelState } from "../legacy";
import type { V3Analysis } from "../files";
import { chf, date as fmtDate, pct } from "../format";
import { interpolate, optionLabel, translate, type Lang, type Params } from "../i18n";
import { GROUP_ORDER, SIGNATURE_REQUIREMENT_ID, reqList, type ReqGroup, type ReqReason } from "../requirements";
import { bankHints, requirementStatus, type BankHint, type ExtraKind, type RequirementStatus, type StatusResult, type UploadedFile } from "../requirementStatus";
import { signatureReviewNote, signatureView, type SignatureStatus } from "../signature";
import { KORRESPONDENZSPRACHE } from "../toInquiryPayload";
import { EM_ROWS, isRentedNutzung, type DocInfo, type FieldPath, type FunnelState } from "../types";
import { MAIL_TEXTS } from "../mail/texts";
import { DOSSIER_TEXTS, DOSSIER_V5_TEXTS, type DossierTexts } from "./texts";

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
  /** Placed by hand (an unreadable signed Auskunftsermächtigung still counts, DECISIONS V21). */
  assignedByUser?: boolean;
  analysis?: V3Analysis | null;
}

export interface DossierInput {
  lang: Lang;
  /** Before the closing: no case number, «Entwurf» everywhere. */
  draft: boolean;
  caseNumber: string | null;
  /** Date of the closing (or of the draft). */
  date: Date;
  /** The answers (v5 shape; legacy.ts reads a stored v3 one into it). */
  state: Pick<FunnelState, "role" | "ans" | "txt" | "fin" | "borrowers"> &
    Partial<Pick<StoredFunnelState, "em" | "info" | "legacyEquity" | "legacy" | "src" | "sig" | "mode">>;
  files: DossierFile[];
  /** Instance ids marked «Habe ich nicht». */
  skipped?: string[];
}

export interface KeyValue {
  label: string;
  value: string;
  strong?: boolean;
  /** «aus Dokument» / «aus Dokument · Lohnausweis 2025» — a value read from the documents. */
  source?: string;
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
  /** Further titled tables after `table` (section 04: the Eigenmittel table). */
  subTables?: { title: string; table: Table }[];
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
  /** The Auskunftsermächtigung (signature.ts). */
  signature: SignatureStatus;
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

  const calc = calcForState(state);
  const info: DocInfo = state.info ?? {};
  const legacy = state.legacy ?? {};
  const bankFromFile = filesOfReq("hyp_zins").concat(filesOfReq("produkt")).map((f) => str(f.analysis?.bank)).find(Boolean);
  const bank = bankFromFile || str(info.bank);

  // v5: values read from the documents (Handover 3.1) and what the prefill marked (`src`).
  const V = DOSSIER_V5_TEXTS[lang] ?? DOSSIER_V5_TEXTS.de;
  const ML = (MAIL_TEXTS[lang] ?? MAIL_TEXTS.de).labels;
  const fromDoc = t("chip.fromDoc");
  const src = state.src ?? {};
  const srcOf = (...paths: FieldPath[]): string | undefined => {
    for (const p of paths) {
      const m = src[p];
      if (m) return m.doc ? `${fromDoc} · ${m.doc}` : fromDoc;
    }
    return undefined;
  };
  const kv = (label: string, value: string, source?: string, strong?: boolean): KeyValue => ({ label, value, ...(source ? { source } : {}), ...(strong ? { strong } : {}) });
  /** A fact from the documents, or nothing when no document says it. */
  const factKv = (label: string, key: keyof DocInfo): KeyValue | null => {
    const v = typeof info[key] === "string" ? str(info[key]) : "";
    return v ? kv(label, v, fromDoc) : null;
  };
  const present = <T,>(list: (T | null | undefined | false)[]): T[] => list.filter((x): x is T => !!x);

  // The Auskunftsermächtigung (Handover 6): the copies on P0, «Später nachreichen».
  const p0 = status.requirements.find((r) => r.instance.id === SIGNATURE_REQUIREMENT_ID);
  const sigView = signatureView(
    input.files.filter((f) => !f.removed).map((f) => ({ fileId: f.id, instanceId: f.instanceId, analysis: f.analysis ?? null, assignedByUser: f.assignedByUser })),
    state.sig ?? null,
    p0?.instance.person
  );
  // HYPOTEQ 19.10. E.4: submitted anyway — the AI's assessment as a note for the manual check.
  const sigLabel = sigView.override
    ? signatureReviewNote(sigView.problems, lang)
    : sigView.status === "received" ? V.sigReceived : sigView.status === "later" ? V.sigLater : sigView.status === "unsigned" ? V.sigUnsigned : V.sigMissing;

  const caseLabel = input.caseNumber || (input.draft ? T.draft : "–");
  const today = fmtDate(input.date);
  const place = [txt.plz.trim(), txt.ort.trim()].filter(Boolean).join(" ");
  // Kreditnehmer 2 exists only once added and named (Handover 2 Schritt 3).
  const borrowers = isJur ? [] : state.borrowers.filter((b, i) => i === 0 || [b.vor, b.nach].some((x) => x.trim()));
  const names = isJur
    ? [txt.firma.trim()].filter(Boolean)
    : borrowers.map((b, i) => [(i === 0 ? txt.vor || b.vor : b.vor).trim(), (i === 0 ? txt.nach || b.nach : b.nach).trim()].filter(Boolean).join(" ")).filter(Boolean);
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
    descParts.push(
      d(bank ? T.descAblBank : T.descAbl, { bank, old: chf(fin.old) }) +
        (str(info.abl) ? d(V.descDate, { date: str(info.abl) }) : "") +
        (increase && fin.up > 0 ? d(T.descIncrease, { up: chf(fin.up) }) : "")
    );
  } else if (isKauf && fin.kaufpreis > 0) {
    descParts.push(d(T.descKauf, { price: chf(fin.kaufpreis) }) + (ans.reno === "Ja" && fin.renoBetrag > 0 ? d(V.descReno, { reno: chf(fin.renoBetrag) }) : ""));
  }

  const kpiNeed: Kpi = { label: t(isAbl ? "s4.total" : "s4.need"), value: chf(calc.need), accent: true };
  const kpiLtv: Kpi = { label: t("s4.ltv"), value: pct(calc.ltv), accent: true };
  const kpiAff: Kpi = { label: t("s4.aff"), value: pct(calc.affordability), accent: true };

  const cover = {
    eyebrow: d(T.eyebrow, { antrag: increase ? d(T.withIncrease, { antrag: antragLabel }) : antragLabel }),
    // The object's address from the Grundbuchauszug when there is one (v5 reference dossier).
    title: [names.join(" & ") || "–", str(info.adresse) || place].filter(Boolean),
    description: descParts.length ? descParts.join(". ") + "." : "",
    kpis: [kpiNeed, kpiLtv, kpiAff],
    left: submitter,
    right: d(T.dateLine, { case: caseLabel, date: today }),
    ...(input.draft ? { draft: T.draft } : {}),
  };

  // ---- 01 Antrag
  const yesNo = (v: string | undefined) => (v === "Ja" ? t("common.yes") : v === "Nein" ? t("common.no") : "–");
  const knLine = isJur ? opt("kn", ans.kn) : d(T.natBorrowers, { kn: opt("kn", ans.kn), n: Math.max(names.length, 1) });
  const s1Left: KeyValue[] = present([
    kv(T.antrag, antragLabel, srcOf("ans.antrag")),
    kv(T.kreditnehmer, knLine, srcOf("ans.kn")),
    // Ablösung: what the Zinsabrechnung says (Handover 3.1) beside the amount asked.
    isAbl && kv(T.existingBank, bank || "–", bank ? fromDoc : undefined),
    isAbl && kv(T.existingMortgage, chf(fin.old) + (str(info.zins) ? ` · ${str(info.zins)}` : ""), srcOf("fin.old")),
    isAbl && factKv(V.redemptionDate, "abl"),
    // Kauf (Handover 2 Schritt 2): Kaufpreis, Kaufdatum, Renovationsbetrag, reserviert.
    isKauf && kv(T.price, fin.kaufpreis > 0 ? chf(fin.kaufpreis) : "–", srcOf("fin.kaufpreis")),
    isKauf && !!txt.kaufdatum.trim() && kv(V.purchaseDate, txt.kaufdatum.trim(), srcOf("txt.kaufdatum")),
    isKauf && ans.reno === "Ja" && kv(V.renovation, fin.renoBetrag > 0 ? chf(fin.renoBetrag) : yesNo("Ja"), srcOf("fin.renoBetrag")),
    isKauf && ans.reserviert === "Ja" && kv(V.reserved, yesNo("Ja")),
  ]);
  const s1Right: KeyValue[] = present([
    increase && kv(T.increase, chf(fin.up), srcOf("fin.up")),
    kv(T.total, chf(calc.need), undefined, true),
    kv(T.term, ans.laufzeit ? opt("laufzeit", ans.laufzeit) : "–", srcOf("ans.laufzeit")),
    kv(T.offers, ans.angebote === "Ja" ? yesNo("Ja") : T.offersNone, srcOf("ans.angebote")),
    kv(T.language, languageName(lang)),
    kv(V.signature, sigLabel),
  ]);
  const callouts: { label: string; text: string }[] = [];
  if (increase && txt.zweck.trim()) callouts.push({ label: T.purpose, text: txt.zweck.trim() });
  if (txt.kommentar.trim()) callouts.push({ label: T.comment, text: txt.kommentar.trim() });

  // ---- 02 Objekt (answers, then what the object documents say)
  const s2Left: KeyValue[] = present([
    kv(T.place, place || "–", srcOf("txt.plz", "txt.ort")),
    factKv(ML.address, "adresse"),
    kv(T.immo, opt("immo", ans.immo) || "–", srcOf("ans.immo")),
    // «Neubau» is the finished new build; the Neubau-Art only there (Handover 9).
    ans.immo === "Neubau" && kv(ML.neubauArt, ML.neubauBuilt),
    ans.immo === "Neubau" && kv(ML.nbDocs, yesNo(ans.nbDocs), srcOf("ans.nbDocs")),
    kv(T.lieg, opt("lieg", ans.lieg) || "–", srcOf("ans.lieg")),
    kv(T.nutz, opt("nutz", ans.nutz) || "–", srcOf("ans.nutz")),
    isRentedNutzung(ans.nutz) && fin.miete > 0 && kv(V.rent, chf(fin.miete), srcOf("fin.miete")),
  ]);
  const s2Right: KeyValue[] = present([
    // v5: read from the documents, no longer asked (a v3 inquiry's answer is in `info` too).
    kv(T.heating, str(info.heizung) || "–", str(info.heizung) ? fromDoc : undefined),
    kv(T.buildingRight, yesNo(ans.baurecht), srcOf("ans.baurecht")),
    kv(T.value, calc.value > 0 ? chf(calc.value) : "–", srcOf("fin.val")),
    factKv(ML.yearBuilt, "baujahr"),
    factKv(ML.rooms, "zimmer"),
    factKv(ML.livingArea, "wohnflaeche"),
    factKv(ML.insuredSum, "versSumme"),
    factKv(ML.cubature, "kubatur"),
    factKv(ML.valueQuota, "wertquote"),
    factKv(ML.liens, "grundpfand"),
    factKv(ML.renewalFund, "efSaldo"),
  ]);
  const shown = new Set([...s2Left, ...s2Right].map((x) => x.label.toLowerCase()));
  const objectFacts = factRows(status, byId, "objekt", 6).filter((x) => !shown.has(x.label.toLowerCase()));
  objectFacts.forEach((x, i) => (i % 2 ? s2Right : s2Left).push(x));

  // ---- 03 Kreditnehmer
  const s3Left: KeyValue[] = [];
  const s3Right: KeyValue[] = [];
  /** A chip's answer with what its documents say («Ja · Restschuld CHF 24'360»). */
  const withFacts = (answer: string, facts: [string, keyof DocInfo][]) => {
    const extra = facts.map(([label, key]) => (str(info[key]) ? `${label} ${str(info[key])}` : "")).filter(Boolean);
    return { value: [answer, ...extra].join(" · "), source: extra.length ? fromDoc : undefined };
  };
  if (isJur) {
    s3Left.push(
      ...present([
        kv(T.company, txt.firma.trim() || "–", srcOf("txt.firma")),
        factKv(ML.uid, "uid"),
        factKv(ML.seat, "sitz"),
        kv(T.signatory, txt.zeichner.trim() || "–", srcOf("txt.zeichner")),
        !!(txt.mail.trim() || txt.tel.trim()) && kv(`${t("s1.email")} / ${t("s1.phone")}`, [txt.mail.trim(), txt.tel.trim()].filter(Boolean).join(" · ")),
      ])
    );
  } else {
    borrowers.forEach((b, i) => {
      const name = names[i] || "–";
      const idFiles = status.requirements.filter((r) => r.instance.id === "id" && r.instance.borrowerId === b.id).flatMap(filesOf);
      // Kreditnehmer 1: what the prefill read from the ID (Handover 3.1); else the ID's fields.
      const born = (i === 0 ? str(info.geb) : "") || firstField(idFiles, ["Geburtsdatum", "Geburtsdatum / Nationalität"]);
      const nat = (i === 0 ? str(info.nat) : "") || firstField(idFiles, ["Nationalität", "Nationalitaet"]);
      s3Left.push(kv(d(T.borrower, { n: i + 1 }), [name, born, nat].filter(Boolean).join(" · "), born || nat ? fromDoc : srcOf(`borrower.${i}.vor` as FieldPath)));
      s3Left.push(kv(T.job, [opt("job", b.job) || "–", b.job === "Selbständig" ? `${T.pkSe}: ${yesNo(b.pkSe)}` : ""].filter(Boolean).join(" · "), srcOf(`borrower.${i}.job` as FieldPath)));
      if (i === 0) s3Left.push(...present([factKv(ML.civil, "zivil"), factKv(ML.employer, "ag")]));
      const income = i === 0 ? fin.inc : fin.inc2;
      if (borrowers.length > 1 && income > 0) s3Left.push(kv(V.borrowerIncome, chf(income), srcOf(i === 0 ? "fin.inc" : "fin.inc2")));
    });
    // v5: «ab 50» from the ID, children from the tax return (Handover 4.2, 3.1); stored v3 answers as they were.
    s3Left.push({ label: T.ab50, value: info.ab50 ? yesNo("Ja") : legacy.ab50 ? yesNo(legacy.ab50) : info.geb ? yesNo("Nein") : "–" });
    s3Right.push(kv(T.income, calc.income > 0 ? chf(calc.income) : "–", borrowers.length > 1 ? undefined : srcOf("fin.inc"), true));
    s3Right.push(kv(T.children, str(info.kinder) || (legacy.kinder ? yesNo(legacy.kinder) : "–"), str(info.kinder) ? fromDoc : undefined));
    const maint = withFacts(yesNo(ans.unterhalt), ans.unterhalt === "Ja" ? [[ML.amount, "unterhaltBetrag"]] : []);
    s3Right.push(kv(T.maintenance, maint.value, maint.source ?? srcOf("ans.unterhalt")));
  }
  const loans = withFacts(yesNo(ans.kredite), ans.kredite === "Ja" ? [[ML.residualDebt, "kreditRest"], [ML.instalment, "kreditRate"]] : []);
  const leases = withFacts(yesNo(ans.leasing), ans.leasing === "Ja" ? [[ML.instalment, "leasingRate"], [ML.residualValue, "leasingRest"]] : []);
  s3Right.push(kv(T.loans, loans.value, loans.source ?? srcOf("ans.kredite")));
  s3Right.push(kv(T.leasing, leases.value, leases.source ?? srcOf("ans.leasing")));
  s3Right.push(kv(T.guarantor, ans.buerge === "Ja" ? txt.buergeName.trim() || yesNo("Ja") : T.guarantorNone, srcOf("ans.buerge")));
  if (ans.steuer === "Ja") s3Right.push(kv(V.taxOpt, yesNo("Ja")));

  // ---- 04 Finanzierung und Tragbarkeit
  const need = calc.need;
  const interest = need * STRESS_RATE;
  const amort = Math.max(need - calc.basis * AMORTISATION_THRESHOLD, 0) / AMORTISATION_YEARS;
  const running = calc.basis * MAINTENANCE_RATE;
  const burden = interest + amort + running;
  const costRows: TableCell[][] = [
    [{ text: d(T.interest, { need: chf(need) }) }, { text: chf(interest) }],
    [{ text: amort > 0 ? T.amortisation : T.amortisationNone }, { text: chf(amort) }],
    [{ text: T.maintenanceCost }, { text: chf(running) }],
    [{ text: T.totalBurden, strong: true }, { text: chf(burden), strong: true }],
  ];
  if (!isJur) costRows.push([{ text: d(T.shareOfIncome, { inc: calc.income > 0 ? chf(calc.income) : "–" }), muted: true }, { text: `${pct(calc.affordability)} (max. ${AFFORDABILITY_LIMIT} %)` }]);
  const verdictKey = calc.verdict === "ok" ? "s4.verdict.ok" : calc.verdict === "review" ? "s4.verdict.check" : "s4.verdict.missing";
  // v5: the Eigenmittel table (Handover 2 «Betragstabelle»: entered rows, total, %, hard part);
  // an Ablösung's «Vorsorge». A stored v3 inquiry's yes/no answers stay a note.
  const em = state.em;
  const emRows = em && ans.antrag ? EM_ROWS[ans.antrag].filter((k) => em[k] > 0) : [];
  const subTables: { title: string; table: Table }[] = [];
  if (emRows.length) {
    const rows: TableCell[][] = emRows.map((k) => {
      const sub = [k === "pkVerp" ? V.pledgeNote : "", srcOf(`em.${k}` as FieldPath) ?? ""].filter(Boolean).join(" · ");
      return [{ text: t(`em.${k}`), ...(sub ? { sub } : {}) }, { text: chf(em![k]) }];
    });
    if (isKauf && calc.emTotal > 0) {
      rows.push([{ text: V.equityTotal, strong: true }, { text: `${chf(calc.emTotal)}${calc.emPct !== null ? ` · ${pct(calc.emPct)}` : ""}`, strong: true }]);
      rows.push([{ text: V.equityHard, muted: true }, { text: chf(calc.hard) }]);
      if (ans.reno === "Ja" && fin.renoBetrag > 0) rows.push([{ text: V.costTotal, muted: true }, { text: chf(calc.cost) }]);
    }
    subTables.push({ title: isAbl ? V.vorsorgeTable : V.equityTable, table: { head: [], widths: [3, 1.3], right: [1], rows } });
  }
  const eq = state.legacyEquity ?? {};
  const legacySources = [
    eq.s3a === "Ja" ? T.equity3a : "",
    eq.pk === "Ja" ? T.equityPk : "",
    eq.schenkung === "Ja" ? T.equityGift : "",
    eq.erbe === "Ja" ? T.equityInheritance : "",
    eq.darlehen === "Ja" ? T.equityLoan : "",
  ].filter(Boolean);
  const vorsorgeFacts = present([factKv(ML.pledge3a, "s3aPledge"), factKv(ML.pkAssets, "pk"), factKv(ML.pkWithdrawal, "pkVorbezug")]).map((x) => `${x.label}: ${x.value}`);
  const s4Notes = [
    `${T.verdict}: ${t(verdictKey)}`,
    ...(isJur ? [T.affNotApplicable] : []),
    ...(ans.unterhalt === "Ja" && !isJur ? [T.maintNote] : []),
    ...(isKauf && !calc.hardOk ? [V.hardTooLow] : []),
    ...(legacySources.length ? [d(T.equity, { sources: legacySources.join(", ") })] : emRows.length ? [] : [T.equityNone]),
    ...(vorsorgeFacts.length ? [`${vorsorgeFacts.join(" · ")} (${fromDoc})`] : []),
  ];

  // ---- 05 Verlauf
  const storedFiles = input.files.filter((f) => !f.removed);
  const history: TableCell[][] = [
    [{ text: today, muted: true }, { text: input.draft ? T.historyDraft : d(T.historySubmitted, { case: input.caseNumber ? ` · ${input.caseNumber}` : "" }) }],
    [{ text: today, muted: true }, { text: d(T.historyFiles, { n: storedFiles.length, ok: status.counts.fulfilled, total: status.counts.total }) }],
  ];
  if (sigView.override) history.push([{ text: today, muted: true }, { text: `${V.signature}: ${sigLabel}` }]);
  else if (sigView.status === "received") history.push([{ text: today, muted: true }, { text: V.historySigReceived }]);
  else if (sigView.status === "later") history.push([{ text: today, muted: true }, { text: V.historySigLater }]);
  if (hints.length) history.push([{ text: today, muted: true }, { text: d(T.historyHints, { n: hints.length }) }]);

  const sections: DossierSection[] = [
    { title: T.s1, columns: [s1Left, s1Right], callouts },
    { title: T.s2, columns: [s2Left, s2Right] },
    { title: T.s3, columns: [s3Left, s3Right] },
    {
      title: T.s4,
      band: [
        { label: T.objectValue, value: calc.value > 0 ? chf(calc.value) : "–" },
        { label: T.newMortgage, value: chf(need), accent: true },
        { label: t("s4.ltv"), value: pct(calc.ltv) },
        { label: t("s4.aff"), value: pct(calc.affordability) },
      ],
      table: { head: [T.costs, T.amount], widths: [3, 1.3], right: [1], rows: costRows },
      ...(subTables.length ? { subTables } : {}),
      notes: s4Notes,
    },
    { title: T.s5, table: { head: [], widths: [0.9, 5], rows: history } },
  ];

  // ---- Annex
  const reasonText = (reason: ReqReason): string => {
    if (reason.key === "why.amount") return t("why.amount", { field: t(`em.${reason.field}`) });
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
      // P0 (Handover 6): the signature's state is its key fact.
      const keyFacts = r.instance.id === SIGNATURE_REQUIREMENT_ID ? [`${V.signature}: ${sigLabel}`, facts(fs)].filter(Boolean).join(" · ") : facts(fs);
      return [
        { text: `${letters[g]}${i + 1}` },
        { text: label, sub: [reasonText(r.instance.reason), stateLine.text].filter(Boolean).join(" · "), warn: stateLine.warn },
        { text: fs.length ? fs.map((f) => f.name).join("\n") : T.noFile },
        { text: keyFacts },
      ];
    });
    const single = g === "person" && personNames.size === 1 ? ` · ${[...personNames][0]}` : "";
    groups.push({ title: `${letters[g]} · ${groupTitle[g]}${single}`, table: { head: reqHead, widths: [0.45, 2.1, 2.6, 2.5], rows } });
  }
  const extras = input.files.filter((f) => !f.instanceId || !status.requirements.some((r) => r.fileIds.includes(f.id)));
  if (extras.length) {
    const rows = extras.map((f, i): TableCell[] => {
      const kind = (f.instanceId ? "unknown" : f.extraKind ?? f.analysis?.extraKind ?? "unknown") as ExtraKind;
      const why = [t(`state.${kind}`), extraReasonText(f, kind, input.files, lang), f.removed ? (kind === "duplicate" ? T.duplicateOf : T.notStored) : T.kept].filter(Boolean).join(" – ");
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
    signature: sigView.status,
  };
}

/**
 * placeFile.ts writes its reason as a German sentence (`analysis.extraReason`, REASON_DE — the
 * Salesforce JSON wants German); the dossier is in the funnel language (D11), so the sentence
 * is mapped back to its `docs.x.*` key here. Keyed by the German text because placeFile does
 * not store the PlaceReason on the analysis.
 */
const REASON_KEY_FROM_TEXT: Record<string, string> = {
  "Identischer Inhalt wie eine andere Datei – wird nicht doppelt gespeichert.": "docs.x.duplicate",
  "Die Anforderung ist bereits vollständig – wird im Dossier mitgeführt, zählt nicht.": "docs.x.full",
  "Ausserhalb der verlangten Jahre – wird im Dossier mitgeführt, zählt nicht.": "docs.x.period",
  // placeFile.ts OLDER_SALARY_DE (Handover 4.2: older Lohnausweise without a bonus).
  "Älterer Lohnausweis – nur bei variablem Lohnanteil nötig. Wird im Dossier mitgeführt.": "docs.x.olderSalary",
  // The catalogue's «nicht benötigt» reasons of what v5 no longer asks (prototype NN).
  "Nur nötig bei einer Lohnerhöhung im laufenden Jahr – keine erkannt.": "nn.anstellung",
  "Eigenmittelnachweis ist nur bei einem Kauf nötig.": "nn.vermoegen",
  "Schuldbrief / Sicherungsvereinbarung wird nicht benötigt.": "nn.hyp_sicher",
  "Für die Ablösung brauchen wir die aktuelle Produktvereinbarung.": "nn.hyp_rahmen",
  "Für die Finanzierungsprüfung nicht erforderlich.": "docs.x.notneeded",
  "Passt zu keiner Anforderung der aktuellen Antworten.": "docs.x.offList",
  "Passt zu keiner Anforderung der aktuellen Antworten (Vorschlag abgelehnt).": "docs.x.dismissed",
  "Dokumenttyp nicht erkannt.": "docs.x.unknown",
  "Konnte nicht gelesen werden.": "docs.x.failed",
  "Person nicht eindeutig erkannt.": "docs.x.person",
};

/** When the reason is free German text (a catalogue label), the kind alone decides the translated line. */
const REASON_KEY_FROM_KIND: Partial<Record<ExtraKind, string>> = {
  duplicate: "docs.x.duplicate",
  notneeded: "docs.x.notneeded",
  unknown: "docs.x.unknown",
};

/**
 * The «why» of a file in annex E, in the dossier language. German text is printed as it is
 * only in a German dossier; elsewhere the reason is translated from its key, or left out when
 * it is free German text whose kind has no generic line (a surplus file: the state says it).
 */
function extraReasonText(f: DossierFile, kind: ExtraKind, all: DossierFile[], lang: Lang): string {
  const text = str(f.analysis?.extraReason);
  if (lang === "de") return text;
  const key = (text && REASON_KEY_FROM_TEXT[text]) || (text ? REASON_KEY_FROM_KIND[kind] : undefined);
  if (!key) return "";
  const hash = f.analysis?.contentHash;
  const twin = hash ? all.find((o) => o.id !== f.id && o.analysis?.contentHash === hash) : undefined;
  return translate(lang, key, { name: twin?.name || "–", years: "–" });
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
