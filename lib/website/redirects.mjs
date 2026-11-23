import { readFileSync } from "node:fs";

/**
 * The previous site's pages that the website (design 20.11.2026) replaces: their URLs lead to
 * the matching new page, so links elsewhere and search results keep working. Read by
 * next.config.mjs (plain JS, hence the slugs from content/website/keywords.json here, sanitised
 * as lib/website/site.ts slug() does).
 */
const OLD_PAGES = {
  hypotheken: "hypotheken",
  hypothekenrechner: "rechner",
  faq: "faq",
  impressum: "impressum",
  "partner-werden": "partner",
  "uber-uns": "ueber-uns",
  "kontaktieren-sie-uns": "kontakt",
  mezzanine: "mezzanine",
  vorteile: "ueber-uns",
  beratung: "advisory",
  homeevaluation: "bewertung",
  documents: "dokumente",
};
/** Pages that were also served without a language (German). */
const OLD_BARE = ["hypotheken", "faq", "impressum", "mezzanine", "homeevaluation", "documents"];
const LANGS = ["de", "fr", "it", "en"];

export function websiteRedirects() {
  const kw = JSON.parse(readFileSync(new URL("../../content/website/keywords.json", import.meta.url), "utf8")).pages;
  const slug = (pid, lang) =>
    String(kw[pid][lang].slug).replace(/^\/+|\/+$/g, "").split("/").pop().toLowerCase().replace(/[^a-z0-9-]/g, "") || pid;
  const out = [];
  for (const [old, pid] of Object.entries(OLD_PAGES)) {
    for (const lang of LANGS) {
      const target = slug(pid, lang);
      if (target !== old) out.push({ source: `/${lang}/${old}`, destination: `/${lang}/${target}`, permanent: true });
    }
  }
  for (const old of OLD_BARE) out.push({ source: `/${old}`, destination: `/de/${slug(OLD_PAGES[old], "de")}`, permanent: true });
  out.push({ source: "/agb", destination: "/de/agb", permanent: true });
  return out;
}
