import { MetadataRoute } from "next";
import { BASE, HREFLANG, IDS, LANGS, urlOf } from "@/lib/website/site";

/** Partner landing pages of the previous site that stay. */
const partnerRoutes = ["/betterhomes", "/remax"];

/**
 * The website's pages (design 20.11.2026) in the four languages, with hreflang alternates, as the
 * design's sitemap.xml lists them (Impressum and Datenschutz stay out, they are noindex), plus the
 * partner landing pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const pid of IDS) {
    if (pid === "impressum" || pid === "datenschutz") continue;
    const languages = Object.fromEntries(LANGS.map((l) => [HREFLANG[l], urlOf(pid, l)]));
    for (const lang of LANGS) {
      entries.push({
        url: urlOf(pid, lang),
        lastModified: new Date("2026-11-04"),
        changeFrequency: pid === "home" ? "daily" : "weekly",
        priority: pid === "home" ? 1.0 : 0.8,
        alternates: { languages },
      });
    }
  }
  for (const route of partnerRoutes) {
    for (const lang of LANGS) {
      entries.push({
        url: `${BASE}/${lang}${route}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages: Object.fromEntries(LANGS.map((l) => [l, `${BASE}/${l}${route}`])) },
      });
    }
  }
  return entries;
}
