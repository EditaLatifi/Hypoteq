// SEO and content audit of the website on a running server:
//   node scripts/website/audit.mjs http://localhost:3005 out.json
// Crawls every page listed in the sitemap and checks status, <html lang>, one <h1>, title and
// description (length, duplicates), canonical, hreflang (complete, reciprocal), robots, Open
// Graph, JSON-LD, image alts, internal links and anchors, assets, external links, leftover
// placeholders, phone numbers and e-mail addresses.
import { writeFileSync } from "node:fs";
const [, , base, outFile] = process.argv;
const CANON = "https://www.hypoteq.ch";
const LANG_OF = { de: "de-CH", fr: "fr-CH", it: "it-CH", en: "en-CH" };
const NOINDEX = /\/(impressum|datenschutz|mentions-legales|protection-des-donnees|note-legali|protezione-dei-dati|legal-notice|privacy|privacy-policy)$/;
const PLACEHOLDER = /\[(Datum|insérer|inserire|insert)[^\]]*\]|\bLorem\b|\bTODO\b|\bXXX\b|Platzhalter|DESIGNVORSCHAU|APERÇU DESIGN|ANTEPRIMA DESIGN|DESIGN PREVIEW|In der Vorschau|dans l'aperçu|nell'anteprima|preview sends/i;
const local = (u) => u.replace(CANON, base);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

const sitemap = await (await fetch(base + "/sitemap.xml")).text();
const robots = await (await fetch(base + "/robots.txt")).text();
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !/\/(betterhomes|remax)$/.test(u));
// impressum/datenschutz are not in the sitemap (noindex): add them via the footer links later
const pages = new Map(); // url -> data
const issues = [];
const add = (url, kind, detail) => issues.push({ url, kind, detail });
const internal = new Map(); // path -> set of pages linking
const anchorsWanted = []; // [fromUrl, path, id]
const assets = new Set();
const external = new Set();

async function crawl(url) {
  if (pages.has(url)) return;
  pages.set(url, null);
  const r = await fetch(local(url), { redirect: "manual" });
  if (r.status !== 200) { add(url, "status", r.status); return; }
  const html = await r.text();
  const path = url.replace(CANON, "") || "/";
  const lang = path.split("/")[1];
  const head = html.split("</head>")[0];
  const body = html.slice(html.indexOf("<body"));
  const d = {
    lang: (html.match(/<html[^>]*lang="([^"]*)"/) || [])[1],
    title: decode((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""),
    desc: decode((head.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ""),
    robots: (head.match(/<meta name="robots" content="([^"]*)"/) || [])[1],
    canonical: (head.match(/<link rel="canonical" href="([^"]*)"/) || [])[1],
    alternates: Object.fromEntries([...head.matchAll(/<link rel="alternate" hrefLang="([^"]*)" href="([^"]*)"/g)].map((m) => [m[1], m[2]])),
    og: Object.fromEntries([...head.matchAll(/<meta property="og:([a-z_:]+)" content="([^"]*)"/g)].map((m) => [m[1], m[2]])),
    h1: (body.match(/<h1[\s>]/g) || []).length,
    ids: new Set([...body.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])),
  };
  pages.set(url, d);
  if (d.lang !== LANG_OF[lang]) add(url, "lang", d.lang);
  if (d.h1 !== 1) add(url, "h1 count", d.h1);
  if (!d.title) add(url, "title missing", "");
  else if (d.title.length > 65) add(url, "title long", `${d.title.length}: ${d.title}`);
  if (!d.desc) add(url, "description missing", "");
  else if (d.desc.length > 160 || d.desc.length < 70) add(url, "description length", `${d.desc.length}: ${d.desc}`);
  if (d.canonical !== url) add(url, "canonical", d.canonical);
  const wantNoindex = NOINDEX.test(path);
  if (wantNoindex !== /noindex/.test(d.robots || "")) add(url, "robots", d.robots);
  for (const k of ["de-CH", "fr-CH", "it-CH", "en-CH", "x-default"]) if (!d.alternates[k]) add(url, "hreflang missing", k);
  if (d.alternates[LANG_OF[lang]] !== url) add(url, "hreflang self", d.alternates[LANG_OF[lang]]);
  for (const k of ["title", "description", "url", "image", "locale", "type"]) if (!d.og[k]) add(url, "og missing", k);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { add(url, "json-ld invalid", e.message); }
  }
  if (/<details>/.test(body) && !/"FAQPage"/.test(html)) add(url, "faq without FAQPage", "");
  for (const m of body.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(m[0])) add(url, "img without alt", m[0].slice(0, 120));
    const src = (m[0].match(/src="([^"]+)"/) || [])[1];
    if (src && src.startsWith("/")) assets.add(src);
  }
  for (const m of body.matchAll(/href="([^"]+)"/g)) {
    const h = decode(m[1]);
    if (h.startsWith("#")) { if (h.length > 1 && !d.ids.has(h.slice(1))) add(url, "anchor missing", h); }
    else if (h.startsWith("/")) {
      const [p, anc] = h.split("#");
      if (!internal.has(p)) internal.set(p, new Set());
      internal.get(p).add(path);
      if (anc) anchorsWanted.push([url, p, anc]);
    } else if (/^https?:/.test(h)) external.add(h);
    else if (!/^(tel|mailto):/.test(h)) add(url, "odd link", h);
  }
  const text = textOf(body);
  const ph = text.match(PLACEHOLDER);
  if (ph) add(url, "placeholder text", text.slice(Math.max(0, ph.index - 60), ph.index + 80));
  for (const m of text.matchAll(/(?:\+41|0)\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/g)) if (!/^(?:\+41 44|044) 502 92 52$/.test(m[0])) add(url, "phone", m[0]);
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) if (m[0] !== "info@hypoteq.ch") add(url, "email", m[0]);
  if (/hypoteq\.com/.test(text)) add(url, "hypoteq.com in text", "");
}

for (let i = 0; i < locs.length; i += 8) await Promise.all(locs.slice(i, i + 8).map(crawl));
// pages reachable by links but not in the sitemap (impressum, datenschutz)
const extra = [...internal.keys()].filter((p) => /^\/(de|fr|it|en)(\/[a-z0-9-]+)?$/.test(p) && !pages.has(CANON + p) && !/\/funnel$/.test(p));
for (const p of extra) {
  const r = await fetch(base + p, { redirect: "manual" });
  if (r.status === 200 && !/\/(agb|betterhomes|remax)$/.test(p)) await crawl(CANON + p);
}
// hreflang reciprocity
for (const [url, d] of pages) if (d) for (const [k, alt] of Object.entries(d.alternates)) {
  if (k === "x-default") continue;
  const o = pages.get(alt);
  if (!o) add(url, "hreflang target not crawled", alt);
  else { const myLang = LANG_OF[url.replace(CANON, "").split("/")[1]]; if (o.alternates[myLang] !== url) add(url, "hreflang not reciprocal", `${k} -> ${alt}`); }
}
// duplicates
const dup = (key) => { const m = new Map(); for (const [u, d] of pages) if (d) { const v = d[key]; if (!m.has(v)) m.set(v, []); m.get(v).push(u); } for (const [v, us] of m) if (us.length > 1) add(us.join(" , "), `duplicate ${key}`, v); };
dup("title"); dup("desc");
// internal link targets
const linkStatus = {};
for (const p of internal.keys()) {
  const r = await fetch(base + p, { redirect: "manual" });
  linkStatus[p] = r.status;
  if (r.status !== 200) add(p, "internal link target", `${r.status} ${r.headers.get("location") || ""} (from ${[...internal.get(p)].slice(0, 3).join(", ")})`);
}
for (const [from, p, anc] of anchorsWanted) { const d = pages.get(CANON + p); if (d && !d.ids.has(anc)) add(from, "anchor missing on target", `${p}#${anc}`); }
for (const a of assets) { const r = await fetch(base + a, { method: "HEAD" }); if (r.status !== 200) add(a, "asset", r.status); }
const externalStatus = {};
for (const u of external) {
  try { const r = await fetch(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (link check)" } }); externalStatus[u] = r.status; }
  catch (e) { externalStatus[u] = String(e.cause?.code || e.message); }
}
const inSitemap = new Set(locs);
for (const [u, d] of pages) if (d && !/noindex/.test(d.robots || "") && !inSitemap.has(u)) add(u, "indexable but not in sitemap", "");
for (const u of locs) { const d = pages.get(u); if (d && /noindex/.test(d.robots || "")) add(u, "noindex in sitemap", ""); }

const summary = {};
for (const i of issues) summary[i.kind] = (summary[i.kind] || 0) + 1;
writeFileSync(outFile, JSON.stringify({ pages: pages.size, internalLinks: internal.size, assets: assets.size, summary, externalStatus, robots, issues }, null, 1));
console.log(`pages crawled: ${pages.size}, internal link targets: ${internal.size}, assets: ${assets.size}, external links: ${external.size}`);
console.log("issues by kind:", summary);
console.log("external:", externalStatus);
