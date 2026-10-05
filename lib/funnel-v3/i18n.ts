/**
 * Funnel v3 texts (docs/funnel-v3/HYPOTEQ_Funnel_i18n.json, copied per language into
 * messages/funnel-v3/). Pure — no React; the hook is in useFunnelT.ts.
 *
 * A key is `"<namespace>.<rest>"`. Only the first dot separates: `<rest>` is the literal key
 * inside the namespace and may itself contain dots and spaces — `opt.laufzeit.2 Jahre`,
 * `start.advisor.eyebrow`. Missing in the language → German → the key itself.
 */

import de from "@/messages/funnel-v3/de.json";
import en from "@/messages/funnel-v3/en.json";
import fr from "@/messages/funnel-v3/fr.json";
import it from "@/messages/funnel-v3/it.json";

export const LANGS = ["de", "en", "fr", "it"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "de";

type Messages = Record<string, Record<string, string>>;

export const MESSAGES: Record<Lang, Messages> = {
  de: de as Messages,
  en: en as Messages,
  fr: fr as Messages,
  it: it as Messages,
};

export type Params = Record<string, string | number>;

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

/** The language of a path such as `/fr/funnel`; German when it has none. */
export function langFromPath(pathname: string | null | undefined): Lang {
  const seg = (pathname || "").split("/")[1];
  return isLang(seg) ? seg : DEFAULT_LANG;
}

function lookup(lang: Lang, key: string): string | undefined {
  const i = key.indexOf(".");
  if (i <= 0) return undefined;
  const value = MESSAGES[lang]?.[key.slice(0, i)]?.[key.slice(i + 1)];
  return typeof value === "string" ? value : undefined;
}

/** Whether the key exists in that language (no fallback). */
export function hasKey(lang: Lang, key: string): boolean {
  return lookup(lang, key) !== undefined;
}

/** Replaces `{name}` with params.name. Placeholders without a value stay as they are. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m
  );
}

export function translate(lang: Lang | string, key: string, params?: Params): string {
  const l: Lang = isLang(lang) ? lang : DEFAULT_LANG;
  const text = lookup(l, key) ?? lookup(DEFAULT_LANG, key) ?? key;
  return interpolate(text, params);
}

/**
 * Display label of an option value (the value stays German, spec 7): `opt.<group>.<value>`.
 * Values without an `opt` entry: Ja / Nein / Unbekannt use `common.*`; anything else is shown
 * as the value itself.
 */
export function optionLabel(lang: Lang | string, group: string, value: string | null | undefined): string {
  if (!value) return "";
  const key = `opt.${group}.${value}`;
  const l: Lang = isLang(lang) ? lang : DEFAULT_LANG;
  if (hasKey(l, key) || hasKey(DEFAULT_LANG, key)) return translate(l, key);
  if (value === "Ja") return translate(l, "common.yes");
  if (value === "Nein") return translate(l, "common.no");
  if (value === "Unbekannt") return translate(l, "common.unknown");
  return value;
}
