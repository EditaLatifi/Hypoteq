import type { DocStatus } from "@/lib/portal/status";

/**
 * Small, pure view rules of the dashboard and the Case page, kept here so they can be
 * tested without rendering anything.
 */

/** «Aktion erforderlich» row: at most `max` document chips, the rest as «+ N weitere». */
export function docChips(names: string[], max = 2): { chips: string[]; more: number } {
  const unique = names.filter((n, i) => names.indexOf(n) === i);
  return { chips: unique.slice(0, max), more: Math.max(0, unique.length - max) };
}

/**
 * «x von y vorhanden»: of the documents on the Case's list, those on file (Vorhanden, In
 * Prüfung, Hochgeladen). Uploads outside the list (`extra`) do not count either way.
 */
export function docProgress(docs: { status: DocStatus; extra?: boolean }[]): { ok: number; total: number; pct: number } {
  const listed = docs.filter((d) => !d.extra);
  const ok = listed.filter((d) => d.status === "vorhanden" || d.status === "pruefung" || d.status === "hochgeladen").length;
  return { ok, total: listed.length, pct: listed.length ? Math.round((ok / listed.length) * 100) : 0 };
}

type FileLike = { id: string; name: string };

/**
 * The «Case Zusammenfassung» PDF of a Case, when it has one: the Fall-Dossier the funnel's
 * closing stores in the case folder (`{Fallnummer}_00_Fall-Dossier.pdf`,
 * lib/funnel-v3/dossier), else a released file HYPOTEQ named «Case Zusammenfassung».
 * DECISIONS P23.
 */
export function summaryFile<T extends FileLike>(files: T[], released: T[]): T | null {
  const dossier = files.find((f) => /(^|_)00_Fall-Dossier\.pdf$/i.test(f.name));
  if (dossier) return dossier;
  return released.find((f) => /zusammenfassung/i.test(f.name) && /\.pdf$/i.test(f.name)) || null;
}
