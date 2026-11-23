// Needs playwright (not a dependency of the site): npm i playwright in a scratch folder, then
// node scripts/website/og-images.cjs <repo>. Writes public/site/og/og-<lang>.png.
// Renders the website's Open Graph images (1200x630, one per language) in the look of the
// design package's LinkedIn banner, with the design's own texts (footer claim, USPs).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), url = require("url");
const [, , repo] = process.argv;
const S = JSON.parse(fs.readFileSync(path.join(repo, "content/website/strings.json"), "utf8"));
const f = (p) => url.pathToFileURL(path.join(repo, "public/site", p)).href;
(async () => {
  const b = await chromium.launch({ executablePath: "C:/Users/edita/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
  for (const lang of ["de", "fr", "it", "en"]) {
    const L = S.UI[lang];
    const usps = L.usp.map((u) => u.replace(/<\/?b>/g, "")).join(" · ").split("100 %").join("100&nbsp;%");
    const html = (`<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Geist;font-weight:400;src:url(${f("fonts/geist-400.woff2")})}
@font-face{font-family:Geist;font-weight:600;src:url(${f("fonts/geist-600.woff2")})}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#132219;color:#fff;font-family:Geist,sans-serif}
.wedge{position:absolute;top:0;right:0;width:380px;height:100%;background:#CAF476;clip-path:polygon(55% 0,100% 0,100% 100%,0 100%)}
.logo{position:absolute;left:80px;top:72px;width:210px}
.txt{position:absolute;left:80px;top:220px;right:330px}
.rule{width:64px;height:4px;background:#CAF476;margin-bottom:28px}
h1{font-weight:600;font-size:74px;line-height:1.02;letter-spacing:-.045em;text-transform:uppercase}
h1 em{font-style:normal;color:#CAF476}
p{margin-top:30px;font-size:22px;color:#DDEACF}
</style><div class="wedge"></div><img class="logo" src="${f("img/brand/hypoteq-logo-white.png")}">
<div class="txt"><div class="rule"></div><h1>${L.footer_h}</h1><p>${usps}</p></div>`);
    const tmp = path.join(__dirname, `og-${lang}.html`); fs.writeFileSync(tmp, html); await pg.goto(url.pathToFileURL(tmp).href);
    await pg.evaluate(() => document.fonts.ready);
    await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(repo, "public/site/og", `og-${lang}.png`) });
    console.log("og", lang);
  }
  await b.close();
})();
