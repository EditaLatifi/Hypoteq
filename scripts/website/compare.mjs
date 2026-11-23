// Compares every page Next.js serves with the design's delivered HTML (website/<lang>/<file>.html).
// The design's relative links and asset paths are mapped to this site's before comparing.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const [, , base, siteDir, outFile, onlyLang] = process.argv;
const LANGS = (onlyLang ? [onlyLang] : ["de", "fr", "it", "en"]);
const DESIGN_BASE = "https://hypoteq.com", OUR_BASE = "https://hypoteq.com";
// The design's home URLs end in a slash (/de/); this site serves /de.
const ours = (s) => s.replaceAll(DESIGN_BASE, OUR_BASE).replace(/(https:\/\/hypoteq\.com\/(?:de|fr|it|en))\/(?=["<])/g, "$1");
// Pages that deviate on purpose (lib/website/overrides.ts): live Impressum and Datenschutz texts,
// downloadable PDFs on Dokumente. Checked by the audit instead.
const OVERRIDDEN = new Set(["de/impressum", "fr/mentions-legales", "it/note-legali", "en/legal-notice",
  "de/datenschutz", "fr/protection-des-donnees", "it/protezione-dei-dati", "en/privacy-policy",
  "de/dokumente", "fr/documents", "it/documenti", "en/documents"]);

function bodyOf(html) {
  const a = html.indexOf('<a class="skip"');
  const s = html.indexOf('<div class="sticky-cta">', a);
  const e = html.indexOf("</div>", s) + 6;
  return a < 0 || s < 0 ? null : html.slice(a, e);
}
// Intended differences to the package: no preview bar and preview note, forms that send
// (their markup is checked by the form tests, so both sides compare without forms).
const noForms = (s) => s.replace(/<form[\s\S]*?<\/form>/g, "<form/>");
function normDesign(body, lang) {
  return noForms(body)
    .replace(/<div class="preview-bar">[^<]*<\/div>/, "")
    .replace(/(<div class="footer-note"><span>[^<]*<\/span>)<span>[^<]*<\/span>/, "$1")
    .replaceAll("../assets/img/", "/site/img/")
    .replaceAll(`${DESIGN_BASE}/portal/login`, "/portal/login")
    .replace(new RegExp(`${DESIGN_BASE}/(de|fr|it|en)/funnel`, "g"), "/$1/funnel")
    .replace(/href="\.\.\/(de|fr|it|en)\/index\.html"/g, 'href="/$1"')
    .replace(/href="\.\.\/(de|fr|it|en)\/([a-z0-9-]+)\.html"/g, 'href="/$1/$2"')
    .replace(/href="index\.html(#[^"]*)?"/g, (m, anc) => `href="/${lang}${anc || ""}"`)
    .replace(/href="([a-z0-9-]+)\.html(#[^"]*)?"/g, (m, s, anc) => `href="/${lang}/${s}${anc || ""}"`);
}
const pick = (re, s) => (s.match(re) || [, null])[1];
const ld = (html, end) => [...html.slice(0, end).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
function headOf(html) {
  return {
    title: pick(/<title>([\s\S]*?)<\/title>/, html),
    description: pick(/<meta name="description" content="([^"]*)"/, html),
    robots: pick(/<meta name="robots" content="([^"]*)"/, html),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/, html),
    alternates: [...html.matchAll(/<link rel="alternate" (?:hreflang|hrefLang)="([^"]*)" href="([^"]*)"/g)].map((m) => m[1] + "=" + m[2]).sort().join(" "),
  };
}
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return { at: i, design: a.slice(Math.max(0, i - 120), i + 200), next: b.slice(Math.max(0, i - 120), i + 200) };
}
const results = { ok: 0, failed: [] };
const jobs = [];
for (const lang of LANGS) for (const f of readdirSync(`${siteDir}/${lang}`)) if (!OVERRIDDEN.has(`${lang}/${f.replace(/\.html$/, "")}`)) jobs.push([lang, f]);
async function run([lang, f]) {
  const design = readFileSync(`${siteDir}/${lang}/${f}`, "utf8");
  const path = f === "index.html" ? `/${lang}` : `/${lang}/${f.replace(/\.html$/, "")}`;
  const r = await fetch(base + path);
  const html = await r.text();
  const problems = [];
  if (r.status !== 200) problems.push(`status ${r.status}`);
  const db = bodyOf(design), nb0 = bodyOf(html), nb = nb0 && noForms(nb0);
  const dn = db && normDesign(db, lang);
  if (!nb) problems.push("no body in Next page");
  else if (dn !== nb) problems.push({ body: firstDiff(dn, nb) });
  const dl = ld(design, design.indexOf("</head>")).map((x) => ours(x).replace(/<\//g, "<\\/"));
  const nl = ld(html, html.indexOf('<a class="skip"'));
  if (JSON.stringify(dl) !== JSON.stringify(nl)) problems.push({ jsonld: firstDiff(dl.join("\n"), nl.join("\n")) });
  const dh = headOf(ours(design).replaceAll("&#x27;", "'")), nh = headOf(html.replaceAll("&#x27;", "'"));
  for (const k of Object.keys(dh)) if (dh[k] !== nh[k]) problems.push({ [k]: { design: dh[k], next: nh[k] } });
  if (problems.length) results.failed.push({ path, problems }); else results.ok++;
}
for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(run));
writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log(`identical: ${results.ok} / ${jobs.length}; differing: ${results.failed.length}`);
for (const f of results.failed.slice(0, 5)) console.log(f.path, JSON.stringify(f.problems).slice(0, 700));
