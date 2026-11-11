/**
 * Several Lohnausweise of one person for one year (HYPOTEQ Komplett-Test 06.11.2026 B02,
 * DECISIONS V111): a Nebenjob, or a change of job within the year. Each employer issues its own,
 * and together they are the year's income. Before, the requirement «Aktueller Lohnausweis» (P2,
 * one file) took one of them and sent the other to «überzählig» — with a Nebenjob of CHF 616 beside
 * a Hauptjob of CHF 117'000 the small one could win, and the funnel showed a false conflict.
 *
 * Two Lohnausweise of the same year are from different employers when both name one and the names
 * do not match (legal form, address, case and accents aside). Without a readable employer on both
 * they count as one: adding up a second scan of the same certificate would double the income.
 *
 * No dependencies on the rest of the funnel (placeFile.ts and facts.ts both use it).
 */

import type { V3Analysis } from "./files";
import { docYear } from "@/components/documentIntelligence/v3/catalogue";

const text = (a: V3Analysis, key: string): string => {
  const v = a.fields?.[key]?.value;
  return v === null || v === undefined ? "" : String(v).trim();
};

/** The year a Lohnausweis covers: field «Jahr», else its document date. */
export function salaryYear(a: V3Analysis): number | null {
  const y = Number(text(a, "Jahr").match(/\b(19|20)\d{2}\b/)?.[0]);
  return Number.isFinite(y) && y > 0 ? y : docYear(a.docDate);
}

const LEGAL_FORMS = new Set(["ag", "sa", "gmbh", "sarl", "sagl", "ltd", "inc", "kg", "co", "cie", "und", "et", "the"]);

/** «Muster Treuhand AG, Bahnhofstrasse 1, 8001 Zürich» → ["muster", "treuhand"]. */
function employerWords(a: V3Analysis): string[] {
  const name = text(a, "Arbeitgeber").split(/[,;\n]/)[0];
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !LEGAL_FORMS.has(w));
}

/** Both Lohnausweise name an employer, and not the same one. */
export function otherEmployer(a: V3Analysis, b: V3Analysis): boolean {
  const x = employerWords(a);
  const y = employerWords(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.filter((w) => long.includes(w)).length / short.length < 0.5;
}

/** Both name an employer, and it is the same one (a payslip and its Lohnausweis). */
export function sameEmployer(a: V3Analysis, b: V3Analysis): boolean {
  return employerWords(a).length > 0 && employerWords(b).length > 0 && !otherEmployer(a, b);
}

/**
 * A further Lohnausweis that belongs beside the ones already on a person's requirement: the year
 * of one of them, an employer none of them has.
 */
export function sideJob(a: V3Analysis, placed: readonly V3Analysis[]): boolean {
  if (!placed.length) return false;
  const year = salaryYear(a);
  return placed.some((p) => salaryYear(p) === year) && placed.every((p) => otherEmployer(p, a));
}

/**
 * The current Lohnausweise of one person, by employer: those of the newest year among them (one
 * without a readable year counts as current, as in the placement), grouped so that each group is
 * one employer's — usually one file each. One Bruttolohn per group adds up to the year's income.
 */
export function employerGroups<T>(list: readonly T[], analysisOf: (t: T) => V3Analysis): T[][] {
  const rows = list.map((t) => ({ t, a: analysisOf(t) })).map((r) => ({ ...r, y: salaryYear(r.a) }));
  const years = rows.map((r) => r.y).filter((y): y is number => y !== null);
  const latest = years.length ? Math.max(...years) : null;
  const groups: (typeof rows)[] = [];
  for (const r of rows.filter((x) => x.y === latest || x.y === null)) {
    const own = groups.find((g) => g.some((o) => !otherEmployer(o.a, r.a)));
    if (own) own.push(r);
    else groups.push([r]);
  }
  return groups.map((g) => g.map((r) => r.t));
}
