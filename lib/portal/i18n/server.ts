import { cookies, headers } from "next/headers";
import { DICTS, isLocale, type Dict, type Locale } from "@/lib/portal/i18n/dict";
import { readSession } from "@/lib/portal/session";

export const LOCALE_COOKIE = "hq_portal_lang";

/**
 * Language of the current request: the portal's own choice (cookie) first, then the
 * partner's saved language, then the website's language cookie, then the browser.
 */
export async function getLocale(): Promise<Locale> {
  const c = cookies();
  const own = c.get(LOCALE_COOKIE)?.value;
  if (isLocale(own)) return own;

  const s = await readSession();
  if (s.state === "ok" && isLocale(s.user.locale)) return s.user.locale;

  const site = c.get("NEXT_LOCALE")?.value;
  if (isLocale(site)) return site;

  const accept = (headers().get("accept-language") || "").toLowerCase();
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2);
    if (isLocale(code)) return code;
  }
  return "de";
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: DICTS[locale] };
}

export function dictFor(locale: string | null | undefined): Dict {
  return DICTS[isLocale(locale) ? locale : "de"];
}

export function dateLocale(locale: Locale): string {
  return `${locale}-CH`;
}
