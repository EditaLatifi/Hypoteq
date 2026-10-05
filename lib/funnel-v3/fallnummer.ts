/**
 * Fallnummer `HQ-JJ-MM-NNNNNN` (Spezifikation 5.1, DECISIONS D1). Pure: picking a unique
 * serial against the database happens elsewhere.
 */

const PATTERN = /^HQ-(\d{2})-(\d{2})-(\d{6})$/;

export const CASE_NUMBER_MAX_SERIAL = 999_999;

/** Year and month as the Swiss calendar shows them (not the server's time zone). */
function zurichYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month") };
}

/** `formatCaseNumber(new Date("2026-06-10"), 156283)` → `HQ-26-06-156283`. */
export function formatCaseNumber(date: Date, n: number): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) throw new Error("formatCaseNumber: invalid date");
  if (!Number.isInteger(n) || n < 0 || n > CASE_NUMBER_MAX_SERIAL) throw new Error(`formatCaseNumber: serial out of range: ${n}`);
  const { year, month } = zurichYearMonth(date);
  return `HQ-${String(year % 100).padStart(2, "0")}-${String(month).padStart(2, "0")}-${String(n).padStart(6, "0")}`;
}

export interface ParsedCaseNumber {
  /** Four-digit year (20JJ). */
  year: number;
  month: number;
  serial: number;
}

/** Parses `HQ-JJ-MM-NNNNNN` (surrounding whitespace allowed, case-sensitive prefix); null when invalid. */
export function parseCaseNumber(s: string | null | undefined): ParsedCaseNumber | null {
  const m = (s || "").trim().match(PATTERN);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: 2000 + Number(m[1]), month, serial: Number(m[3]) };
}

export function isCaseNumber(s: string | null | undefined): boolean {
  return parseCaseNumber(s) !== null;
}
