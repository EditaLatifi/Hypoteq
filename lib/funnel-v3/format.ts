/**
 * Number and date display for Funnel v3 (spec chapter 7): Swiss format in every language —
 * `CHF 449'000`, `44.8 %`, `05.10.2026`. Deliberately no Intl: `toLocaleString('de-CH')`
 * uses U+2019 as the group separator in current ICU data, and the browser and Node disagree
 * on it, so the output would differ between server render, client and tests.
 */

const DASH = "–";

/** Groups the integer digits with an ASCII apostrophe: 1450000 → "1'450'000". */
function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

/** `CHF 449'000`. Rounded to whole francs. Not a finite number → "–". */
export function chf(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return `CHF ${sign}${group(String(Math.abs(rounded)))}`;
}

/** `44.8 %` for 44.827…. The argument is already a percentage, not a ratio. */
export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return `${x.toFixed(digits)} %`;
}

/**
 * The amount typed into a CHF field: "449'000", "CHF 1’450’000", "449 000", "125000.50",
 * "449'000.–". Returns 0 for empty or unreadable input (amounts default to 0, types.ts).
 *
 * A "." or "," followed by one or two digits at the end is a decimal part; every other
 * separator is a thousands separator. Negative input is read as its absolute value.
 */
export function parseAmount(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? Math.abs(input) : 0;
  if (!input) return 0;
  let s = String(input).replace(/\.[–-]$/, ""); // "449'000.–"
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return 0;
  const dec = s.match(/[.,](\d{1,2})$/);
  let intPart = s;
  let fraction = "";
  if (dec) {
    intPart = s.slice(0, dec.index);
    fraction = dec[1];
  }
  intPart = intPart.replace(/[.,]/g, "");
  const n = Number(`${intPart || "0"}${fraction ? "." + fraction : ""}`);
  return Number.isFinite(n) ? n : 0;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * `TT.MM.JJJJ`. Accepts a Date, a timestamp, or a string. A plain `YYYY-MM-DD` string is
 * read as a calendar date (not as UTC midnight, which shifts a day west of Greenwich).
 * Invalid input → "".
 */
export function date(d: Date | string | number | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  }
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}
