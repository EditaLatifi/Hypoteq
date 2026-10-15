/**
 * Applicant search (handoff «Partnerportal (Shell)»: «Antragsteller suchen – Vor- oder
 * Nachname»), shared by the header search and the Case list. Pure.
 *
 * A Case matches when the query is the start of a word of the customer name (first or last
 * name, either borrower), a part of the name, or a part of the case number. Word starts rank
 * first, then other name matches, then case numbers; within a rank the list keeps its own
 * order (newest first). Accents and case are ignored, so «muller» finds «Müller».
 */

export type Searchable = { kunde: string; nr: string };

export const HEADER_SEARCH_MAX = 6;

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Case numbers are compared without separators: «2606156», «hq-26-06» and «HQ 26 06» all hit.
function compact(s: string): string {
  return fold(s).replace(/[^a-z0-9]/g, "");
}

/** 0 = word start of the name, 1 = elsewhere in the name, 2 = case number; null = no match. */
export function matchRank(c: Searchable, query: string): number | null {
  const q = fold(query).replace(/\s+/g, " ");
  if (!q) return null;
  const name = fold(c.kunde);
  const words = name.split(/[\s&,.()/+–-]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q)) || name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  const qc = compact(q);
  if (qc && compact(c.nr).includes(qc)) return 2;
  return null;
}

/** The Cases a query finds, best first; `max` caps the list (the header shows 6). */
export function searchCases<T extends Searchable>(cases: T[], query: string, max = Infinity): T[] {
  return cases
    .map((c, i) => ({ c, i, r: matchRank(c, query) }))
    .filter((x): x is { c: T; i: number; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c);
}
