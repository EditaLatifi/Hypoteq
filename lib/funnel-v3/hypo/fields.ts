/**
 * HYPO (docs/funnel-v5/HYPOTEQ_Konzept_HYPO_ChatFunnel.md): the field keys the chat may write —
 * the whitelist of Kap. 9 «Ausgaben gegen die Feldschlüssel-Whitelist validiert (das LLM kann nur
 * definierte Felder schreiben)». Pure.
 *
 * The keys are the funnel's own field paths (types.ts FieldPath), so a value from the chat lands
 * in the same store field as a click in the form, plus a few `hypo.*` keys the funnel has no field
 * for: they become a line in «Weitere Angaben» (txt.kommentar) or steer the conversation.
 *
 * Every value — from the model or from a typed answer — goes through `coerce`: an option that is
 * not one of the funnel's values, an amount out of range or an address that is not one is dropped,
 * never stored.
 */

import { CHIPS, NUTZUNG_OPTIONS, type FieldPath } from "../types";
import { EMAIL_RE } from "../validate";

/** Chat-only keys (`chat.*`): no funnel field. */
export const HYPO_ONLY_KEYS = ["chat.emTotal", "chat.bank", "chat.ablauf", "chat.adresse", "chat.kn2"] as const;
export type HypoOnlyKey = (typeof HYPO_ONLY_KEYS)[number];

export type HypoKey = FieldPath | HypoOnlyKey;

export type FieldKind = "enum" | "yesno" | "amount" | "text" | "name" | "email" | "phone" | "plz" | "date" | "month";

export interface HypoFieldDef {
  key: HypoKey;
  kind: FieldKind;
  /** The funnel values (German, spec 7) of an `enum`. */
  options?: readonly string[];
  /** Upper bound of an amount (CHF). */
  max?: number;
}

const YN = ["Ja", "Nein"] as const;
const BIG = 200_000_000;
const INCOME = 20_000_000;

/** Whitelist, in the order the model is told about them. */
export const HYPO_FIELDS: readonly HypoFieldDef[] = [
  { key: "ans.antrag", kind: "enum", options: ["Neue Hypothek", "Ablösung"] },
  { key: "ans.kn", kind: "enum", options: ["Natürliche Person", "Juristische Person"] },
  { key: "ans.anrede", kind: "enum", options: ["Herr", "Frau"] },
  { key: "txt.vor", kind: "name" },
  { key: "txt.nach", kind: "name" },
  { key: "txt.firma", kind: "text" },
  { key: "txt.zeichner", kind: "name" },
  { key: "txt.mail", kind: "email" },
  { key: "txt.tel", kind: "phone" },
  { key: "txt.plz", kind: "plz" },
  { key: "txt.ort", kind: "text" },
  { key: "ans.immo", kind: "enum", options: ["Bestehende Immobilie", "Neubau", "Bauprojekt"] },
  { key: "ans.nbDocs", kind: "yesno", options: YN },
  { key: "ans.lieg", kind: "enum", options: ["Einfamilienhaus", "Stockwerkeigentum", "Mehrfamilienhaus"] },
  { key: "ans.nutz", kind: "enum", options: [...new Set([...NUTZUNG_OPTIONS["Natürliche Person"], ...NUTZUNG_OPTIONS["Juristische Person"]])] },
  { key: "fin.miete", kind: "amount", max: INCOME },
  { key: "fin.old", kind: "amount", max: BIG },
  { key: "ans.aufstockung", kind: "yesno", options: YN },
  { key: "fin.up", kind: "amount", max: BIG },
  { key: "txt.zweck", kind: "text" },
  { key: "fin.kaufpreis", kind: "amount", max: BIG },
  { key: "txt.kaufdatum", kind: "date" },
  { key: "ans.reno", kind: "yesno", options: YN },
  { key: "fin.renoBetrag", kind: "amount", max: BIG },
  { key: "ans.reserviert", kind: "yesno", options: YN },
  { key: "fin.val", kind: "amount", max: BIG },
  { key: "em.spar", kind: "amount", max: BIG },
  { key: "em.s3a", kind: "amount", max: BIG },
  { key: "em.pkVor", kind: "amount", max: BIG },
  { key: "em.pkVerp", kind: "amount", max: BIG },
  { key: "em.schenk", kind: "amount", max: BIG },
  { key: "em.erbe", kind: "amount", max: BIG },
  { key: "em.darl", kind: "amount", max: BIG },
  { key: "ans.laufzeit", kind: "enum", options: ["SARON", "2 Jahre", "3 Jahre", "5 Jahre", "10 Jahre", "Mix"] },
  { key: "fin.inc", kind: "amount", max: INCOME },
  { key: "borrower.0.job", kind: "enum", options: ["Angestellt", "Selbständig", "Pensioniert"] },
  { key: "borrower.0.pkSe", kind: "yesno", options: YN },
  { key: "borrower.1.vor", kind: "name" },
  { key: "borrower.1.nach", kind: "name" },
  { key: "fin.inc2", kind: "amount", max: INCOME },
  ...CHIPS.map((c): HypoFieldDef => ({ key: `ans.${c}`, kind: "yesno", options: YN })),
  { key: "txt.buergeName", kind: "name" },
  // The partner (Kap. 4): the funnel's Berater block.
  { key: "txt.bmail", kind: "email" },
  { key: "txt.pvor", kind: "name" },
  { key: "txt.pnach", kind: "name" },
  { key: "txt.pfirma", kind: "text" },
  { key: "txt.ptel", kind: "phone" },
  // Chat only.
  { key: "chat.emTotal", kind: "amount", max: BIG },
  { key: "chat.bank", kind: "text" },
  { key: "chat.ablauf", kind: "month" },
  { key: "chat.adresse", kind: "text" },
  { key: "chat.kn2", kind: "yesno", options: YN },
];

const BY_KEY = new Map<string, HypoFieldDef>(HYPO_FIELDS.map((f) => [f.key, f]));

export const HYPO_KEYS: readonly HypoKey[] = HYPO_FIELDS.map((f) => f.key);

export function fieldDef(key: string): HypoFieldDef | undefined {
  return BY_KEY.get(key);
}

export function isHypoKey(key: unknown): key is HypoKey {
  return typeof key === "string" && BY_KEY.has(key);
}

export type HypoValue = string | number;

const MAX_TEXT = 160;
const CONTROL = /[\u0000-\u001f\u007f]/g;

const pad2 = (n: number) => String(n).padStart(2, "0");

function validDate(d: number, m: number, y: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `TT.MM.JJJJ` from «31.3.2027», «2027-03-31»; "" when it is no calendar date. */
export function normaliseDate(raw: string): string {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const [d, mo] = [Number(m[1]), Number(m[2])];
    return validDate(d, mo, y) ? `${pad2(d)}.${pad2(mo)}.${y}` : "";
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(d, mo, y) ? `${pad2(d)}.${pad2(mo)}.${y}` : "";
  }
  return "";
}

/** A date or a month: `TT.MM.JJJJ` or `MM.JJJJ` (an expiry is often known only to the month). */
export function normaliseMonth(raw: string): string {
  const full = normaliseDate(raw);
  if (full) return full;
  const m = raw.trim().match(/^(\d{1,2})[./-](\d{4})$/) || raw.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const [mo, y] = m[1].length === 4 ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
  return mo >= 1 && mo <= 12 && y >= 1900 && y <= 2100 ? `${pad2(mo)}.${y}` : "";
}

/**
 * The value as the store takes it, or null when it is not a valid value of that field. Amounts
 * are whole francs ≥ 1; Ja/Nein and options must be the funnel's values exactly.
 */
export function coerce(key: string, raw: unknown): HypoValue | null {
  const def = BY_KEY.get(key);
  if (!def || raw === null || raw === undefined) return null;
  const str = typeof raw === "string" ? raw.replace(CONTROL, " ").replace(/\s+/g, " ").trim() : typeof raw === "number" ? String(raw) : "";
  switch (def.kind) {
    case "enum":
    case "yesno":
      return def.options?.includes(str) ? str : null;
    case "amount": {
      const n = typeof raw === "number" ? raw : Number(str.replace(/['’\s]/g, ""));
      if (!Number.isFinite(n)) return null;
      const r = Math.round(n);
      return r >= 1 && r <= (def.max ?? BIG) ? r : null;
    }
    case "email":
      return str.length <= 254 && EMAIL_RE.test(str) ? str.toLowerCase() : null;
    case "phone": {
      const digits = str.replace(/\D/g, "");
      return /^[+\d][\d\s/().-]*$/.test(str) && digits.length >= 9 && digits.length <= 15 ? str : null;
    }
    case "plz":
      return /^[1-9]\d{3}$/.test(str) ? str : null;
    case "date":
      return normaliseDate(str) || null;
    case "month":
      return normaliseMonth(str) || null;
    case "name":
      // Letters, spaces, hyphens, apostrophes and dots — a name, not a sentence.
      return str && str.length <= 80 && /^[\p{L}][\p{L}\p{M}' .’-]*$/u.test(str) ? str : null;
    case "text":
      return str && str.length <= MAX_TEXT ? str : null;
  }
}

/** True for the keys that live in the funnel store (not `hypo.*`). */
export function isStoreKey(key: HypoKey): key is FieldPath {
  return !key.startsWith("chat.");
}

/** Amount fields: shown as CHF on the cards. */
export function isAmountKey(key: HypoKey): boolean {
  return BY_KEY.get(key)?.kind === "amount";
}
