import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { pickLocale } from "@/lib/locale";

/**
 * The funnel without a language prefix (DECISIONS D14) → `/{sprache}/funnel`. The language is
 * the one the middleware last saw (NEXT_LOCALE), else the browser language (Accept-Language,
 * spec 7), German otherwise. `?customer=partner|direct` (and the old `customerType`) is passed
 * on: the funnel starts with the Berater or the Kunde entry selected.
 */

export default function LegacyFunnelRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = pickLocale(cookies().get("NEXT_LOCALE")?.value, headers().get("accept-language"));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  const qs = query.toString();
  redirect(`/${locale}/funnel${qs ? `?${qs}` : ""}`);
}
