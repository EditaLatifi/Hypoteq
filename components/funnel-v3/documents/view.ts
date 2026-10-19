/**
 * Pure view helpers of the documents step: state looks, confidence chips, groups, reason
 * lines, stored-name previews, cross-checks. No React — tested in tests/funnelV3/documentsView.
 */

import type { Amounts } from "@/lib/funnel-v3/types";
import type { ExtractedField, FileEntry } from "@/lib/funnel-v3/files";
import { hasKey, optionLabel, translate, type Lang } from "@/lib/funnel-v3/i18n";
import {
  GROUP_ORDER,
  QUESTION_SHORT_DE,
  getRequirement,
  type ReqGroup,
  type ReqReason,
  type ReqState,
  effectiveBorrowers,
  type RequirementInstance,
} from "@/lib/funnel-v3/requirements";
import type { RequirementState, RequirementStatus } from "@/lib/funnel-v3/requirementStatus";
import { OLDER_SALARY_DE, type Placement } from "@/lib/funnel-v3/placeFile";
import { extraStoredName, storedName } from "@/lib/funnel-v3/storedName";
import { v3DocType } from "@/components/documentIntelligence/v3/catalogue";

export type RowState = RequirementState | "surplus" | "duplicate" | "notneeded" | "unknown" | "uploading" | "failed";

export type Tone = "success" | "warning" | "danger" | "info" | "lime" | "neutral" | "muted";

/** Glyph and tag tone per state (prototype `ST`). */
export const STATE_LOOK: Record<RowState, { glyph: string; tone: Tone; labelKey: string }> = {
  missing: { glyph: "○", tone: "neutral", labelKey: "state.missing" },
  analysing: { glyph: "◌", tone: "lime", labelKey: "state.analysing" },
  uploading: { glyph: "◌", tone: "lime", labelKey: "docs.uploading" },
  partial: { glyph: "½", tone: "warning", labelKey: "state.partial" },
  ok: { glyph: "✓", tone: "success", labelKey: "state.ok" },
  outdated: { glyph: "⚠", tone: "warning", labelKey: "state.outdated" },
  skipped: { glyph: "–", tone: "muted", labelKey: "state.skipped" },
  duplicate: { glyph: "=", tone: "info", labelKey: "state.duplicate" },
  surplus: { glyph: "+", tone: "info", labelKey: "state.surplus" },
  notneeded: { glyph: "·", tone: "muted", labelKey: "state.notneeded" },
  unknown: { glyph: "?", tone: "danger", labelKey: "state.unknown" },
  failed: { glyph: "!", tone: "danger", labelKey: "docs.failedBadge" },
};

/** CSS state class of a row (`is-…`); upload states borrow the closest prototype look. */
export function rowClass(state: RowState): string {
  if (state === "uploading") return "is-analysing";
  if (state === "failed") return "is-unknown";
  return `is-${state}`;
}

// ---- Confidence -------------------------------------------------------------------------------

export type Band = "ok" | "check" | "unsure" | "none";

/** Spec 5: ≥ 0.9 «Erkannt», ≥ 0.7 «Prüfen», below «Unsicher». */
export function band(confidence: number | null | undefined): Band {
  if (confidence === null || confidence === undefined) return "none";
  if (confidence >= 0.9) return "ok";
  if (confidence >= 0.7) return "check";
  return "unsure";
}

/** Chip text and tone. Customers never see a percentage; the internal role does. */
export function chip(confidence: number | null | undefined, intern: boolean, t: (k: string) => string, edited = false): { label: string; tone: Tone } {
  if (edited) return { label: t("state.ok"), tone: "success" };
  const b = band(confidence);
  const pct = intern && b !== "none" ? ` · ${Math.round((confidence as number) * 100)} %` : "";
  if (b === "ok") return { label: t("state.ok") + pct, tone: "success" };
  if (b === "check") return { label: t("state.check") + pct, tone: "warning" };
  if (b === "unsure") return { label: t("docs.chipUnsure") + pct, tone: "danger" };
  return { label: t("state.unknown"), tone: "danger" };
}

// ---- Reason line -----------------------------------------------------------------------------

/** «Pflicht» / «weil: Baurecht = Ja», in the funnel language. */
export function reasonText(reason: ReqReason, lang: Lang): string {
  if (reason.key === "why.amount") return translate(lang, "why.amount", { field: translate(lang, `em.${reason.field}`) });
  if (reason.key !== "why.because") return translate(lang, reason.key);
  const parts = reason.conditions.map((c) => {
    // The short question names are `qs.*` once the UI texts are merged; German until then.
    const q = hasKey(lang, `qs.${c.question}`) ? translate(lang, `qs.${c.question}`) : QUESTION_SHORT_DE[c.question];
    return `${q} = ${optionLabel(lang, c.question, c.value)}`;
  });
  return translate(lang, "why.because", { reason: parts.join(" · ") });
}

// ---- Groups ----------------------------------------------------------------------------------

export interface RowGroup {
  key: string;
  group: ReqGroup;
  title: string;
  rows: RequirementStatus[];
}

/**
 * Zum Objekt · Bestehende Hypothek · Zur Person (one block per Kreditnehmer, «Zur Person ·
 * Name»; case-level person documents with the first) · Eigenmittel & Vorsorge.
 */
export function groupRows(rows: RequirementStatus[], state: ReqState, lang: Lang): RowGroup[] {
  const out: RowGroup[] = [];
  const jp = state.ans.kn === "Juristische Person";
  const borrowers = jp ? [] : effectiveBorrowers(state);
  for (const g of GROUP_ORDER) {
    const mine = rows.filter((r) => r.instance.group === g);
    if (!mine.length) continue;
    if (g !== "person") {
      out.push({ key: g, group: g, title: translate(lang, `grp.${g}`), rows: mine });
      continue;
    }
    if (jp) {
      const firma = (state.txt.firma || "").trim();
      out.push({ key: "person", group: g, title: translate(lang, "docs.groupCompany") + (firma ? ` · ${firma}` : ""), rows: mine });
      continue;
    }
    const firstId = borrowers[0]?.id;
    for (const b of borrowers) {
      const rs = mine.filter((r) => (r.instance.borrowerId ?? firstId) === b.id);
      if (!rs.length) continue;
      const name = [b.vor, b.nach].filter(Boolean).join(" ");
      out.push({
        key: `person:${b.id}`,
        group: g,
        title: name ? translate(lang, "docs.groupPerson", { name }) : translate(lang, "grp.person"),
        rows: rs,
      });
    }
  }
  return out;
}

// ---- Files outside the list (Handover 4.3) --------------------------------------------------

/** The kinds of «Weitere Dateien», in display order (Handover 4.3), and files still on their way. */
export type ExtraGroupKey = "surplus" | "duplicate" | "notneeded" | "unknown" | "pending";
export const EXTRA_GROUP_ORDER: readonly ExtraGroupKey[] = ["pending", "unknown", "surplus", "duplicate", "notneeded"];

/** Heading of an extras group: «Überzählig», «Duplikat», «Nicht benötigt», «Nicht erkannt», «Wird gelesen». */
export const EXTRA_GROUP_LABEL: Record<ExtraGroupKey, string> = {
  surplus: "state.surplus",
  duplicate: "state.duplicate",
  notneeded: "state.notneeded",
  unknown: "state.unknown",
  pending: "state.analysing",
};

/**
 * «Dateien ausserhalb der Liste: überzählig · Duplikat · nicht benötigt (mit Begründung) ·
 * nicht erkannt» (Handover 4.3): the extras grouped by kind, in upload order inside a group.
 * Files still uploading or being read, and failed uploads, come first («Wird gelesen»).
 */
export function groupExtras(files: FileEntry[], placements: Map<string, Placement>): { key: ExtraGroupKey; files: FileEntry[] }[] {
  const by = new Map<ExtraGroupKey, FileEntry[]>();
  for (const f of files) {
    const p = placements.get(f.id);
    const key: ExtraGroupKey =
      f.uploadState !== "uploaded" || !p || p.reason === "pending" ? "pending" : ((p.extraKind ?? "unknown") as ExtraGroupKey);
    by.set(key, [...(by.get(key) ?? []), f]);
  }
  return EXTRA_GROUP_ORDER.filter((k) => by.has(k)).map((key) => ({ key, files: by.get(key)! }));
}

/**
 * The i18n key of a «nicht benötigt» reason: the type's own sentence where the message file has
 * one (`nn.<id>`: «Eigenmittelnachweis ist nur bei einem Kauf nötig.», the Rahmenvertrag, the
 * Schuldbrief, the Anstellungsvertrag), the general one otherwise. An older Lohnausweis
 * without a recognised bonus has its own sentence (Handover 4.2 «überzählig»).
 */
export function extraReasonKey(p: Placement | undefined, docTypeId: string | null | undefined, has: (key: string) => boolean): string | null {
  if (!p) return null;
  if (p.reason === "notneeded") {
    for (const id of [p.requirementId, docTypeId]) if (id && has(`nn.${id}`)) return `nn.${id}`;
    return "docs.x.notneeded";
  }
  if (p.reason === "period" && p.extraReason === OLDER_SALARY_DE) return "docs.x.olderSalary";
  return null;
}

// ---- Fields ---------------------------------------------------------------------------------

export interface FieldView {
  key: string;
  value: string;
  confidence: number | null;
  edited: boolean;
  fileId: string | null;
}

/**
 * The recognised values of a requirement's files, in catalogue order; the most confident wins.
 * Keys an analysis holds beyond the catalogue (one stored before a catalogue change, e.g.
 * «Bruttolohn 2025» before v5) follow, so nothing read is hidden.
 */
export function mergedFields(files: FileEntry[]): FieldView[] {
  const typeId = files.find((f) => f.analysis?.docTypeId)?.analysis?.docTypeId;
  const known = v3DocType(typeId)?.fields.map((f) => f.key) ?? [];
  const extra = files.flatMap((f) => Object.keys(f.analysis?.fields ?? {})).filter((k) => !known.includes(k));
  const keys = [...known, ...Array.from(new Set(extra))];
  const out: FieldView[] = [];
  for (const key of keys) {
    let best: FieldView | null = null;
    for (const f of files) {
      const edited = f.humanEdits?.[key];
      if (edited !== undefined) {
        best = { key, value: edited, confidence: 1, edited: true, fileId: f.id };
        break;
      }
      const v: ExtractedField | undefined = f.analysis?.fields?.[key];
      if (v && v.value !== null && v.value !== "" && (!best || (best.confidence ?? 0) < v.confidence)) {
        best = { key, value: String(v.value), confidence: v.confidence, edited: false, fileId: f.id };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** The fields of one file for the detail view: every field of its type, read or not. */
export function fileFields(f: FileEntry, typeIdOverride?: string | null): FieldView[] {
  const typeId = typeIdOverride ?? f.analysis?.docTypeId;
  const keys = v3DocType(typeId)?.fields.map((x) => x.key) ?? Object.keys(f.analysis?.fields ?? {});
  return keys.map((key) => {
    const edited = f.humanEdits?.[key];
    const v = f.analysis?.fields?.[key];
    return {
      key,
      value: edited ?? (v && v.value !== null ? String(v.value) : ""),
      confidence: edited !== undefined ? 1 : v ? v.confidence : null,
      edited: edited !== undefined,
      fileId: f.id,
    };
  });
}

// ---- Stored names ---------------------------------------------------------------------------

/** Placeholder until the case number is assigned at completion (DECISIONS D1). */
export const CASE_PLACEHOLDER = "HQ-…";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "pdf" : name.slice(i + 1);
}

/** «Wird gespeichert als» for a file on a requirement (index 1-based among its files). */
export function storedNameFor(f: FileEntry, inst: RequirementInstance, index: number, total: number, caseNumber?: string | null): string {
  if (f.nameOverride) return f.nameOverride;
  return storedName({
    caseNumber: caseNumber || CASE_PLACEHOLDER,
    requirement: inst,
    bank: f.analysis?.bank ?? undefined,
    docDate: f.analysis?.docDate ?? null,
    index,
    total,
    ext: extOf(f.name),
  });
}

function printedPerson(name: string | null | undefined): { first: string; last: string } | undefined {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? { last: parts[0], first: parts.slice(1).join(" ") } : undefined;
}

/** Stored name of an extra (ZUSATZ / DUPLIKAT), or null when it is not filed under a requirement. */
export function storedNameForExtra(f: FileEntry, p: Placement | undefined): string | null {
  if (f.nameOverride) return f.nameOverride;
  if (!p?.extraKind) return null;
  const req = p.requirementId ? getRequirement(p.requirementId) : undefined;
  // A type that is no requirement (not needed, unknown) is kept under its own name (Handover 4.3).
  if (!req) return extraStoredName(CASE_PLACEHOLDER, f.name, p.extraKind);
  return storedName({
    caseNumber: CASE_PLACEHOLDER,
    requirement: req,
    // V3Analysis.personName is «Nachname Vorname» as printed.
    person: printedPerson(f.analysis?.personName),
    bank: f.analysis?.bank ?? undefined,
    docDate: f.analysis?.docDate ?? null,
    ext: extOf(f.name),
    extraKind: p.extraKind,
  });
}

// ---- Cross-checks (spec 5 «Abgleich mit Funnel-Angaben») -------------------------------------

/** A funnel answer against a document (amounts): Bruttoeinkommen, Bestehende Hypothek. */
export interface FunnelCheck {
  kind: "funnel";
  field: string;
  funnel: number;
  doc: number;
  ok: boolean;
  /** The latest Bruttolohn of every borrower's Lohnausweise summed (several borrowers). */
  household?: boolean;
}

/** Two documents against each other (Baujahr, Ablösedatum): the values as read, normalised. */
export interface DocumentsCheck {
  kind: "documents";
  field: string;
  left: { typeId: string; value: string };
  right: { typeId: string; value: string };
  ok: boolean;
}

export type CrossCheck = FunnelCheck | DocumentsCheck;

/** «CHF 110'310.00» → 110310. */
export function parseChf(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = String(v).replace(/[’'\s]/g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "1998", "Baujahr 1998", "1998 (Renovation 2015)" → "1998" — the first year read; none → null. */
export function parseYear(v: string | null | undefined): string | null {
  const m = v ? String(v).match(/\b(1[89]\d{2}|20\d{2})\b/) : null;
  return m ? m[1] : null;
}

/** "31.3.2027", "31.03.2027", "31/03/2027", "2027-03-31" → "31.03.2027"; nothing readable → null. */
export function normaliseDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const dmy = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, "0")}.${dmy[2].padStart(2, "0")}.${dmy[3]}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return null;
}

const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= Math.max(a, b) * tolerance;

/**
 * The Bruttolohn of a borrower's Lohnausweis (v5: the current one, field «Bruttolohn»);
 * analyses stored before v5 carry year-keyed fields («Bruttolohn 2025») — the latest wins.
 */
function latestGross(fields: FieldView[]): number | null {
  const get = (k: string) => parseChf(fields.find((f) => f.key === k)?.value);
  const keyed = fields
    .map((f) => f.key)
    .filter((k) => /^Bruttolohn \d{4}$/.test(k))
    .sort()
    .reverse();
  return get("Bruttolohn") ?? keyed.map(get).find((v) => v !== null) ?? null;
}

/**
 * Document pairs that state the same fact (spec 5 «Baujahr», «Ablösedatum»): which other
 * requirement to look at, which field on each side, and how to normalise the values.
 */
const DOC_PAIRS: Record<string, { other: string; field: string; mine: string; theirs: string; norm: (v: string | null | undefined) => string | null }> = {
  gvz: { other: "verkaufsdoku", field: "Baujahr", mine: "Erstellungsjahr", theirs: "Baujahr", norm: parseYear },
  verkaufsdoku: { other: "gvz", field: "Baujahr", mine: "Baujahr", theirs: "Erstellungsjahr", norm: parseYear },
  // v5: the Produktvereinbarung replaces the Rahmenvertrag (Handover 4.1 H1).
  hyp_zins: { other: "produkt", field: "Ablösedatum", mine: "Ablösedatum", theirs: "Ablösedatum", norm: normaliseDate },
  produkt: { other: "hyp_zins", field: "Ablösedatum", mine: "Ablösedatum", theirs: "Ablösedatum", norm: normaliseDate },
};

/**
 * Compares what the funnel was told with what the document says — only where the two mean the
 * same thing: the household income against the Lohnausweis with a single borrower (several
 * borrowers: `householdIncomeCheck`), the existing mortgage against H1/H3. With `allFiles`
 * (every placed file) a document is also held against its counterpart: GVZ «Erstellungsjahr»
 * against the Verkaufsdokumentation's «Baujahr», the Zinsabrechnung's «Ablösedatum» against the
 * Rahmenvertrag's. A check appears on both rows of a pair, each with its own document first.
 */
export function crossChecks(inst: RequirementInstance, files: FileEntry[], fin: Amounts, borrowerCount: number, allFiles: FileEntry[] = []): CrossCheck[] {
  const fields = mergedFields(files);
  const get = (k: string) => parseChf(fields.find((f) => f.key === k)?.value);
  const out: CrossCheck[] = [];
  if (inst.id === "lohnausweise" && borrowerCount === 1 && fin.inc > 0) {
    const doc = latestGross(fields);
    if (doc) out.push({ kind: "funnel", field: "Bruttoeinkommen", funnel: fin.inc, doc, ok: within(fin.inc, doc, 0.05) });
  }
  if ((inst.id === "hyp_zins" || inst.id === "produkt") && fin.old > 0) {
    const doc = get(inst.id === "hyp_zins" ? "Kapital" : "Betrag");
    if (doc) out.push({ kind: "funnel", field: "Bestehende Hypothek", funnel: fin.old, doc, ok: within(fin.old, doc, 0.01) });
  }
  const pair = DOC_PAIRS[inst.id];
  if (pair) {
    const others = allFiles.filter((f) => f.instanceId === pair.other && f.analysisState === "done");
    const mine = pair.norm(fields.find((f) => f.key === pair.mine)?.value);
    const theirs = others.length ? pair.norm(mergedFields(others).find((f) => f.key === pair.theirs)?.value) : null;
    if (mine && theirs) {
      out.push({ kind: "documents", field: pair.field, left: { typeId: inst.id, value: mine }, right: { typeId: pair.other, value: theirs }, ok: mine === theirs });
    }
  }
  return out;
}

/**
 * Spec 5 «Bruttoeinkommen» with several borrowers: the funnel's household income against the
 * SUM of the latest Bruttolohn over every borrower's Lohnausweise. Only when every natural
 * borrower has a Lohnausweise requirement and a recognised Bruttolohn — a selbständig or
 * pensioniert borrower has none, and a sum over part of the household would mislead. Shown on
 * the first borrower's Lohnausweise row.
 */
export function householdIncomeCheck(instances: RequirementInstance[], files: FileEntry[], fin: Amounts, borrowerCount: number): FunnelCheck | null {
  // v5: Kreditnehmer 1 and 2 each give their income (fin.inc, fin.inc2).
  const funnel = fin.inc + (fin.inc2 || 0);
  if (borrowerCount < 2 || funnel <= 0) return null;
  const rows = instances.filter((i) => i.id === "lohnausweise");
  if (rows.length !== borrowerCount) return null;
  let sum = 0;
  for (const inst of rows) {
    const v = latestGross(mergedFields(files.filter((f) => f.instanceId === inst.instanceId && f.analysisState === "done")));
    if (!v) return null;
    sum += v;
  }
  return { kind: "funnel", field: "Bruttoeinkommen", funnel, doc: sum, ok: within(funnel, sum, 0.05), household: true };
}

export function chf(n: number): string {
  return "CHF " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

/** The «Veraltet» explanation in the funnel language, from the catalogue rule. */
export function outdatedText(
  reason: { code: "maxAge"; months: number; date: string } | { code: "year"; year: number } | { code: "expired"; date: string } | null,
  lang: Lang
): string {
  if (!reason) return translate(lang, "docs.old.generic");
  const d = (iso: string) => iso.split("-").reverse().join(".");
  if (reason.code === "maxAge") return translate(lang, "docs.old.maxAge", { months: reason.months, date: d(reason.date) });
  if (reason.code === "year") return translate(lang, "docs.old.year", { year: reason.year });
  return translate(lang, "docs.old.expired", { date: d(reason.date) });
}
