import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The funnel without a language prefix (DECISIONS D14) → `/{sprache}/funnel`. The language is
 * the one the middleware last saw (NEXT_LOCALE), German otherwise. `?customer=partner|direct`
 * (and the old `customerType`) is passed on: the funnel starts with the Berater or the Kunde
 * entry selected.
 */
const LOCALES = ["de", "en", "fr", "it"];

export default function LegacyFunnelRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const saved = cookies().get("NEXT_LOCALE")?.value;
  const locale = saved && LOCALES.includes(saved) ? saved : "de";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  const qs = query.toString();
  redirect(`/${locale}/funnel${qs ? `?${qs}` : ""}`);
}
