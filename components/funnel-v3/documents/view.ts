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
import type { Placement } from "@/lib/funnel-v3/placeFile";
import { storedName } from "@/lib/funnel-v3/storedName";
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

// ---- Fields ---------------------------------------------------------------------------------

export interface FieldView {
  key: string;
  value: string;
  confidence: number | null;
  edited: boolean;
  fileId: string | null;
}

/** The recognised values of a requirement's files, in catalogue order; the most confident wins. */
export function mergedFields(files: FileEntry[]): FieldView[] {
  const typeId = files.find((f) => f.analysis?.docTypeId)?.analysis?.docTypeId;
  const keys = v3DocType(typeId)?.fields.map((f) => f.key) ?? [];
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
export function storedNameFor(f: FileEntry, inst: RequirementInstance, index: number, total: number): string {
  if (f.nameOverride) return f.nameOverride;
  return storedName({
    caseNumber: CASE_PLACEHOLDER,
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
  const req = p?.requirementId ? getRequirement(p.requirementId) : undefined;
  if (!req || !p?.extraKind) return null;
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

export interface CrossCheck {
  field: string;
  funnel: number;
  doc: number;
  ok: boolean;
}

/** «CHF 125'385.00» → 125385. */
export function parseChf(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = String(v).replace(/[’'\s]/g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= Math.max(a, b) * tolerance;

/**
 * Compares what the funnel was told with what the document says. Only where the two mean the
 * same thing: the household income against the Lohnausweis only with a single borrower.
 */
export function crossChecks(inst: RequirementInstance, files: FileEntry[], fin: Amounts, borrowerCount: number): CrossCheck[] {
  const fields = mergedFields(files);
  const get = (k: string) => parseChf(fields.find((f) => f.key === k)?.value);
  const out: CrossCheck[] = [];
  if (inst.id === "lohnausweise" && borrowerCount === 1 && fin.inc > 0) {
    const doc = get("Bruttolohn 2025") ?? get("Bruttolohn 2024") ?? get("Bruttolohn 2023");
    if (doc) out.push({ field: "Bruttoeinkommen", funnel: fin.inc, doc, ok: within(fin.inc, doc, 0.05) });
  }
  if ((inst.id === "hyp_zins" || inst.id === "hyp_rahmen") && fin.old > 0) {
    const doc = get(inst.id === "hyp_zins" ? "Kapital" : "Rahmenkredit");
    if (doc) out.push({ field: "Bestehende Hypothek", funnel: fin.old, doc, ok: within(fin.old, doc, 0.01) });
  }
  return out;
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
