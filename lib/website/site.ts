/**
 * The website's structure: pages, parents, slugs, navigation labels and the page contents.
 *
 * A port of the design's generator (HYPOTEQ_Website_Entwicklung_2026-11-20, quelle/build.py and
 * _src/extend.py). The texts live in content/website: one JSON per page (pages/<id>.json), the
 * SEO mapping (keywords.json), the lead landing pages (keywords-leads.json), the cantons
 * (cantons.json) and the generator's fixed texts (strings.json, dumped from build.py).
 */
import STR from "@/content/website/strings.json";
import KW_FILE from "@/content/website/keywords.json";
import LEADS_FILE from "@/content/website/keywords-leads.json";
import CANTONS_FILE from "@/content/website/cantons.json";
import { PAGE_FILES } from "@/content/website/pages";
import { SITE_CONFIG } from "@/lib/seo";
import { get, or, truthy } from "./py";

export const LANGS = ["de", "fr", "it", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
export const HREFLANG: Record<Lang, string> = { de: "de-CH", fr: "fr-CH", it: "it-CH", en: "en-CH" };

/** Production domain for canonical, hreflang and JSON-LD (the design's BASE; .com/.ch still open). */
export const BASE: string = SITE_CONFIG.url;

const S: any = STR;
/** Funnel and portal on this site, whatever the domain; the rest as in the design. */
export const LINKS: Record<string, string> = { ...S.LINKS, funnel: "/{lang}/funnel", portal: "/portal/login" };
export const PHONE: string = S.PHONE;
export const PHONE_INTL: string = S.PHONE_INTL;
export const GOOGLE_RATING: number = S.GOOGLE_RATING;
export const RATES: [string, number][] = S.RATES;
export const BEST: Record<string, number> = S.BEST;
export const CALC_RATES: [string, number][] = S.CALC_RATES;
export const MENU: [string, string[] | null, string | null][] = S.MENU;
export const UI: Record<string, any> = S.UI;
export const ADV: Record<string, [string, string]> = S.ADV;
export const CAPITALS: string[] = S.CAPITALS;
export const SMS: Record<string, [string, string, string]> = S.SMS;
export const SMS_TXT: Record<string, [string, string]> = S.SMS_TXT;
export const IMAGES: Set<string> = new Set(S.IMAGES);
export const SCR: Record<string, any> = S.SCR;
export const CL: Record<string, any> = S.CL;
const HUB_SLUGS: Record<string, Record<string, string>> = S.HUB_SLUGS;
const HUB_NAV: Record<string, Record<string, [string, string]>> = S.HUB_NAV;
const CT: Record<string, any> = S.CT;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Navigation texts: [label, short description] per language and page. */
export const NAV: Record<string, Record<string, [string, string]>> = clone(S.NAV);
export const KW: Record<string, any> = clone((KW_FILE as any).pages || {});
export const PAGES: [string, string | null, string][] = clone(S.BASE_PAGES);
export const CONTENT_PAGES: Record<string, any> = {};
for (const [pid] of PAGES) CONTENT_PAGES[pid] = PAGE_FILES[pid] ?? null;

/** str.format(**kw) for the canton templates. */
function fmt(s: string, kw: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in kw ? kw[k] : m));
}

/* ------------------------------------------------------------------ Lead landing pages & cantons */
const KW_LEADS: Record<string, any> = get(LEADS_FILE as any, "pages", {}) || {};
const CANTONS: any[] = [...(get(CANTONS_FILE as any, "cantons", []) || [])].sort((a, b) =>
  a.names.de < b.names.de ? -1 : a.names.de > b.names.de ? 1 : 0,
);

function cantonPage(c: any, lang: string) {
  const T = CT[lang];
  const nm = c.names[lang];
  const f = (s: string) =>
    fmt(s, {
      name: nm,
      regions: or(get(c.regions || {}, lang), "") || "",
      capital: or(get(c.capital || {}, lang), "") || "",
      notary: or(c.notary, "") || "",
      rate: "",
    });
  const seo = get(c.seo || {}, lang) || {};
  const tt = c.transfer_tax || {};
  // cantons.json writes every rate as a float (1.0, 3.3): str() of a float keeps the «.0».
  const rateStr = (r: number) => (Number.isInteger(r) ? r.toFixed(1) : String(r));
  const rate =
    tt.rate !== null && tt.rate !== undefined && tt.rate !== ""
      ? ` (${rateStr(tt.rate).replace(".", ["de", "fr", "it"].includes(lang) ? "," : ".")} %)`
      : "";
  let tax = fmt(tt.exists === false ? T.tax_no : truthy(tt.exists) ? T.tax_yes : T.tax_unk, { name: nm, rate });
  const paras: string[] = [];
  const mk = c[`market_${lang}`];
  if (truthy(mk)) paras.push(mk);
  if (truthy(get(c.regions || {}, lang))) paras.push(f(T.p_reg));
  if (truthy(get(c.capital || {}, lang))) paras.push(f(T.p_cap));
  if ((c.code === "BL" || c.code === "SO") && truthy(tt.exists)) {
    tax += ({
      de: " Für dauernd selbstgenutztes Wohneigentum gibt es eine Befreiung bzw. Erleichterung.",
      fr: " Une exonération ou un allègement existe pour le logement occupé durablement par son propriétaire.",
      it: " Per l'abitazione occupata stabilmente dal proprietario esiste un'esenzione o un'agevolazione.",
      en: " An exemption or relief applies to permanently owner-occupied homes.",
    } as Record<string, string>)[lang];
  }
  paras.push(tax);
  const ans2 =
    tax +
    ({
      de: " Stand 2026, ohne Gewähr; Gemeinden können Zuschläge erheben.",
      fr: " État 2026, sans garantie; des suppléments communaux sont possibles.",
      it: " Stato 2026, senza garanzia; i comuni possono applicare supplementi.",
      en: " As of 2026, without guarantee; municipalities may add surcharges.",
    } as Record<string, string>)[lang];
  const code = c.code.toLowerCase();
  return {
    title: get(seo, "title"),
    description: get(seo, "description"),
    h1: get(seo, "h1"),
    sections: [
      { type: "hero", eyebrow: f(T.eyebrow), h1: or(get(seo, "h1"), f(T.eyebrow)), lead: f(T.lead), ctas: [{ label: T.c1, to: "funnel" }, { label: T.c2, to: "page:tragbarkeit" }], badges: T.b.map(f), image: `kt-${code}`, alt: nm },
      { type: "split", eyebrow: f(T.s_e), title: f(T.s_t), paragraphs: paras, bullets: T.bul, screen: "valuation", ctas: [{ label: T.c1, to: "funnel" }] },
      { type: "rates", eyebrow: T.r_e, title: f(T.r_t), lead: T.r_l },
      { type: "steps", eyebrow: T.st_e, title: T.st_t, items: T.st.map(([a, b]: [string, string]) => ({ title: a, text: b })), ctas: [{ label: T.c1, to: "funnel" }] },
      { type: "calc", eyebrow: T.k_e, title: T.k_t },
      { type: "cards", eyebrow: T.l_e, title: T.l_t, tone: "soft", items: [{ title: "", text: "", to: "page:kauf" }, { title: "", text: "", to: "page:abloesung" }, { title: "", text: "", to: "page:bewertung" }, { title: "", text: "", to: "page:kantone" }] },
      { type: "faq", eyebrow: "FAQ", title: f(T.faq_t), items: [{ q: f(T.q1), a: f(T.a1) }, { q: f(T.q2), a: ans2 }, { q: T.q3, a: T.a3 }, { q: T.q4, a: T.a4 }] },
      { type: "cta", title: f(T.cta_t), text: T.cta_x, ctas: [{ label: T.c1, to: "funnel" }, { label: "044 502 92 52", to: "tel" }] },
    ],
  };
}

function cantonHub(cantons: any[], lang: string) {
  const T = CT[lang];
  return {
    title: T.hub_title,
    description: T.hub_desc,
    h1: T.hub_t.split("*").join("").split("\n").join(" "),
    sections: [
      { type: "hero", eyebrow: T.hub_e, h1: T.hub_t.split("*").join(""), lead: T.hub_l, ctas: [{ label: T.c1, to: "funnel" }, { label: T.c2, to: "page:tragbarkeit" }], image: "swiss-landscape", alt: "Schweiz" },
      { type: "tiles", items: cantons.map((c) => ({ title: c.names[lang], text: or(get(c.capital || {}, lang), "") || "", image: "kt-" + c.code.toLowerCase(), to: "page:kt-" + c.code.toLowerCase(), kicker: c.code })) },
      { type: "cta", title: T.cta_x, ctas: [{ label: T.c1, to: "funnel" }, { label: "044 502 92 52", to: "tel" }] },
    ],
  };
}

const EXTRA: [string, string, string][] = [];
if (truthy(KW_LEADS)) {
  EXTRA.push(["themen", "hypotheken", HUB_SLUGS.themen.de]);
  for (const [lid, v] of Object.entries(KW_LEADS)) {
    KW[lid] = Object.fromEntries(LANGS.filter((l) => l in v).map((l) => [l, v[l]]));
    EXTRA.push([lid, "themen", v.de.slug]);
  }
}
if (CANTONS.length) {
  EXTRA.push(["kantone", "hypotheken", HUB_SLUGS.kantone.de]);
  for (const c of CANTONS) {
    const kid = "kt-" + c.code.toLowerCase();
    KW[kid] = Object.fromEntries(LANGS.map((l) => [l, { ...(get(c.seo || {}, l) || {}), slug: c.slugs[l] }]));
    EXTRA.push([kid, "kantone", c.slugs.de]);
  }
}
for (const hub of ["themen", "kantone"]) {
  if (!(hub in KW)) KW[hub] = Object.fromEntries(LANGS.map((l) => [l, { slug: HUB_SLUGS[hub][l] }]));
}
PAGES.push(...EXTRA);
export const PARENT: Record<string, string | null> = Object.fromEntries(PAGES.map(([p, par]) => [p, par]));
export const IDS: string[] = PAGES.map(([p]) => p);
for (const [pid] of EXTRA) CONTENT_PAGES[pid] = PAGE_FILES[pid] ?? null;
for (const c of CANTONS) {
  const kid = "kt-" + c.code.toLowerCase();
  CONTENT_PAGES[kid] = Object.fromEntries(LANGS.map((l) => [l, cantonPage(c, l)]));
  for (const l of LANGS) NAV[l][kid] = [c.names[l], or(get(c.capital || {}, l), "") || ""];
}
if (CANTONS.length) CONTENT_PAGES.kantone = Object.fromEntries(LANGS.map((l) => [l, cantonHub(CANTONS, l)]));
for (const l of LANGS) {
  for (const hub of ["themen", "kantone"]) NAV[l][hub] = HUB_NAV[l][hub];
  for (const lid of Object.keys(KW_LEADS)) {
    const nav = get(get(CONTENT_PAGES[lid] || {}, l) || {}, "nav");
    NAV[l][lid] = or(nav, [get(get(KW_LEADS[lid], l) || {}, "h1", lid), ""]);
  }
}
if (truthy(KW_LEADS)) {
  const CP: Record<string, any> = CONTENT_PAGES.themen || {};
  for (const l of LANGS) {
    if (truthy(get(CP, l))) continue;
    const items = Object.keys(KW_LEADS).map((lid) => {
      const d = get(CONTENT_PAGES[lid] || {}, l) || {};
      const hero = (d.sections || []).find((x: any) => x.type === "hero") || {};
      return {
        title: NAV[l][lid][0],
        text: or(NAV[l][lid][1], String(get(get(KW_LEADS[lid], l) || {}, "description", "")).slice(0, 110)),
        image: get(hero, "image", "house"),
        to: "page:" + lid,
      };
    });
    const T = CT[l];
    CP[l] = {
      title: ({ de: "Hypothek für jede Lebenslage | HYPOTEQ", fr: "Hypothèque pour chaque situation | HYPOTEQ", it: "Ipoteca per ogni situazione | HYPOTEQ", en: "A mortgage for every situation | HYPOTEQ" } as Record<string, string>)[l],
      description: ({ de: "Erstkauf, Scheidung, Erbschaft, Bankabsage oder Ferienwohnung: Finde die passende Hypothek für deine Situation. Kostenlos vergleichen.", fr: "Premier achat, divorce, héritage, refus bancaire ou résidence secondaire: trouvez l'hypothèque adaptée. Comparaison gratuite.", it: "Primo acquisto, divorzio, eredità, rifiuto della banca o casa di vacanza: trova l'ipoteca giusta. Confronto gratuito.", en: "First purchase, divorce, inheritance, bank rejection or holiday home: find the right mortgage for your situation. Compare for free." } as Record<string, string>)[l],
      h1: HUB_NAV[l].themen[0],
      sections: [
        { type: "hero", eyebrow: HUB_NAV[l].themen[1], h1: HUB_NAV[l].themen[0], lead: ({ de: "Jede Finanzierung ist anders. Wähle deine Situation und erfahre, wie HYPOTEQ dir zur passenden Hypothek verhilft.", fr: "Chaque financement est différent. Choisissez votre situation et découvrez comment HYPOTEQ vous aide.", it: "Ogni finanziamento è diverso. Scegli la tua situazione e scopri come ti aiuta HYPOTEQ.", en: "Every financing is different. Pick your situation and see how HYPOTEQ helps you find the right mortgage." } as Record<string, string>)[l], ctas: [{ label: T.c1, to: "funnel" }, { label: T.c2, to: "page:tragbarkeit" }], image: "family-home", alt: "" },
        { type: "tiles", items },
        { type: "cta", title: T.cta_x, ctas: [{ label: T.c1, to: "funnel" }, { label: "044 502 92 52", to: "tel" }] },
      ],
    };
  }
  CONTENT_PAGES.themen = CP;
}

/* ------------------------------------------------------------------ Slugs & URLs */
const DEFAULT_SLUG: Record<string, string> = Object.fromEntries(PAGES.map(([p, , d]) => [p, d]));

export function slug(pid: string, lang: string): string {
  let s = get(or(get(get(KW, pid, {}) || {}, lang, {}), {}) || {}, "slug");
  if (pid === "home") return "";
  if (!truthy(s)) s = or(get(get(CONTENT_PAGES[pid] || {}, lang, {}) || {}, "slug"), DEFAULT_SLUG[pid]);
  const last = String(s).replace(/^\/+|\/+$/g, "").split("/").pop() || "";
  return last.toLowerCase().replace(/[^a-z0-9-]/g, "") || pid;
}

/** The page's path on this site: /de, /de/hypotheken … */
export function pathOf(pid: string, lang: string): string {
  return pid === "home" ? `/${lang}` : `/${lang}/${slug(pid, lang)}`;
}

/** Absolute URL for canonical, hreflang and JSON-LD (the design writes /de/ for the home page). */
export function urlOf(pid: string, lang: string): string {
  return `${BASE}/${lang}/` + (pid === "home" ? "" : slug(pid, lang));
}

const BY_SLUG: Record<string, Record<string, string>> = Object.fromEntries(
  LANGS.map((l) => [l, Object.fromEntries(IDS.filter((p) => p !== "home").map((p) => [slug(p, l), p]))]),
);

/** Page id for /{lang}/{slug}, or null. */
export function pidOf(lang: string, s: string): string | null {
  return BY_SLUG[lang]?.[s] ?? null;
}

/** The page's contents in one language ({} when the design has none). */
export function pageData(pid: string, lang: string): any {
  return get(CONTENT_PAGES[pid] || {}, lang) || {};
}
