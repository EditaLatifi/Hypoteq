/**
 * Where a finished funnel sends the customer, and who navigates them there.
 *
 * This lived in three places at once — the path map in DocumentsStep, the same map again
 * inside HypoteqLoadingPopup's TRANSLATIONS, and the routing decision spread across both
 * funnel pages. That is how a partner came to see two "Vielen Dank" screens for one
 * submission: the funnel page advanced to its own in-funnel screen AND the step redirected
 * to the thank-you page, with neither knowing about the other.
 *
 * One module, so the rule is stated once and can be tested without a browser.
 */

export type FunnelLocale = "de" | "fr" | "it" | "en";

/**
 * Localised thank-you routes. Each is a real folder under app/[locale]/ — they are separate
 * pages, not one page with translations, so a typo here is a 404 at the very end of a
 * completed funnel. FunnelThankYou.test.ts checks each one against the filesystem.
 */
export const THANK_YOU_PATHS: Record<FunnelLocale, string> = {
  de: "/de/danke",
  fr: "/fr/merci",
  it: "/it/grazie",
  en: "/en/thank-you",
};

export const DEFAULT_FUNNEL_LOCALE: FunnelLocale = "de";

/** The locale a URL path is running in. Anything unrecognised is German. */
export function localeFromPath(pathname: string | null | undefined): FunnelLocale {
  const segment = String(pathname || "").split("/")[1]?.toLowerCase();
  return segment === "fr" || segment === "it" || segment === "en" ? segment : DEFAULT_FUNNEL_LOCALE;
}

/** Thank-you route for a locale or a URL path ("fr" and "/fr/funnel" both work). */
export function thankYouPathFor(localeOrPath: string | null | undefined): string {
  const raw = String(localeOrPath || "").toLowerCase();
  const key = (raw.startsWith("/") ? localeFromPath(raw) : raw) as FunnelLocale;
  return THANK_YOU_PATHS[key] || THANK_YOU_PATHS[DEFAULT_FUNNEL_LOCALE];
}

/**
 * Whether the funnel itself shows a final screen (step 7) for this customer type.
 *
 * Direct customers: yes. They have no document step, so no upload popup exists to carry
 * them anywhere, and step 7 is the only ending they get.
 *
 * Partners: no. They finish in DocumentsStep, whose progress popup animates to 100% and
 * then navigates to the thank-you page. A funnel page that also advanced to step 7 would
 * put a second thank-you screen in front of the first.
 */
export function showsInFunnelThankYou(customerType: string | null | undefined): boolean {
  return customerType !== "partner";
}

/**
 * How long the upload popup needs, at the very least, to reach 100% and navigate.
 *
 * It is capped at 90% until the upload actually finishes, then climbs the last ten points
 * at 0.28 per 60ms tick and waits 600ms before navigating — so even an instant upload
 * cannot finish sooner than this.
 */
export const POPUP_MIN_RUN_MS = 8_000;

/**
 * When DocumentsStep gives up on the popup and navigates itself.
 *
 * Must comfortably outlast POPUP_MIN_RUN_MS. It used to be 1500ms, which beat the popup
 * every single time: the animation was cut off mid-way and the customer was thrown to the
 * thank-you page from underneath it. A fallback that fires during normal operation is not
 * a fallback.
 */
export const FALLBACK_NAVIGATION_MS = 20_000;
