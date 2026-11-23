/**
 * The few Python behaviours the design's generator (build.py) relies on, so the port writes the
 * same markup: html.escape, str(), json.dumps(ensure_ascii=False) and the **bold** / *accent*
 * shorthand of rich().
 */

/** str(value) as Python prints it for the values the content files hold. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}

/** html.escape(str(s), quote=True) */
export function E(s: unknown): string {
  return pyStr(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Allows **bold**, *accent* and line breaks (\n). */
export function rich(s: unknown): string {
  let out = E(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return out.split("\n").join("<br>");
}

/** json.dumps(v, ensure_ascii=False): ", " and ": " as separators. */
export function pyJson(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(pyJson).join(", ") + "]";
  return "{" + Object.entries(v as Record<string, unknown>).map(([k, x]) => JSON.stringify(k) + ": " + pyJson(x)).join(", ") + "}";
}

/** Python truthiness for `x or y`. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** `a or b` */
export function or<T>(a: T, b: T): T {
  return truthy(a) ? a : b;
}

/** dict.get(key, default): the default only when the key is missing. */
export function get(o: any, key: string, dflt: any = null): any {
  if (o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
  return dflt;
}
