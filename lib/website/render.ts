/**
 * Renders the website's pages as the design's generator does (quelle/build.py, «Sections» and
 * «Rahmen»): the same markup and classes, so styles/website.css and public/site/app.js apply
 * unchanged. Differences to the design's static files: links are paths on this site
 * (/de/hypotheken instead of hypotheken.html), assets come from /site, the funnel and the portal
 * are this site's own (/de/funnel, /portal/login).
 */
import { E, get, or, pyJson, rich, truthy } from "./py";
import {
  ADV, BASE, BEST, CALC_RATES, CAPITALS, CL, GOOGLE_RATING, HREFLANG, IMAGES, KW, LANGS, LINKS, MENU,
  NAV, PARENT, PHONE_INTL, RATES, SCR, SMS, SMS_TXT, UI, pageData, pathOf, urlOf,
} from "./site";

type Ctx = { lang: string; pid: string; meta: { title: string; description: string; h1: string }; _calc?: number; meta_line?: string };
type Section = Record<string, any>;

/** Python's round(): halves to the even neighbour. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/* ------------------------------------------------------------------ Helpers */
export function href(to: unknown, lang: string): string {
  if (!truthy(to)) return "#";
  const t = String(to);
  if (t.startsWith("page:")) {
    const pid = t.slice(5).split("#")[0];
    const anc = t.includes("#") ? "#" + t.split("#")[1] : "";
    if (!(pid in PARENT)) return "#";
    return pathOf(pid, lang) + anc;
  }
  if (t in LINKS) return LINKS[t].split("{lang}").join(lang);
  return t;
}

const ext = (to: unknown) => ["funnel", "portal", "academy", "bewertung"].includes(String(to));
const blank = (to: unknown) => (ext(to) ? ' target="_blank" rel="noopener"' : "");

function btn(c: any, lang: string, cls = ""): string {
  if (!truthy(c)) return "";
  const to = get(c, "to", "funnel");
  const style = or(get(c, "style"), cls);
  return `<a class="btn ${E(style)}" href="${E(href(to, lang))}"${blank(to)}>${E(get(c, "label", ""))}<span aria-hidden="true">↗</span></a>`;
}

function btns(cs: any, lang: string, first = "", second = "ghost"): string {
  if (!truthy(cs)) return "";
  return '<div class="actions">' + cs.map((c: any, i: number) => btn(c, lang, i === 0 ? first : second)).join("") + "</div>";
}

function img(name: unknown, alt: unknown = "", eager = false): string {
  let n = String(or(name, "house")).split(".jpg").join("");
  if (!IMAGES.has(n)) n = "house";
  return `<img src="/site/img/${n}.jpg" alt="${E(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async">`;
}

const tag = (s: unknown) => (truthy(s) ? `<span class="tag">${E(s)}</span>` : "");

function head(s: Section): string {
  return (
    tag(get(s, "eyebrow")) +
    (truthy(get(s, "title")) ? `<h2>${rich(s.title)}</h2>` : "") +
    (truthy(get(s, "lead")) ? `<p class="lead">${rich(s.lead)}</p>` : "")
  );
}

const rvd = (i: number) => `rv rv-d${(i % 3) + 1}`;

/* ------------------------------------------------------------------ Sections */
function s_hero(s: Section, ctx: Ctx): string {
  const lang = ctx.lang;
  const sub = ctx.pid !== "home";
  let crumbs = "";
  if (sub) {
    let chain: string[] = [];
    let p: string | null = ctx.pid;
    while (p) {
      chain.push(p);
      p = PARENT[p] ?? null;
    }
    chain = chain.reverse();
    const parts = chain.slice(0, -1).map((c) => `<a href="${pathOf(c, lang)}">${E(c === "home" ? UI[lang].home : NAV[lang][c][0])}</a>`);
    parts.push(`<span>${E(NAV[lang][chain[chain.length - 1]][0])}</span>`);
    crumbs = '<nav class="crumbs" aria-label="Breadcrumb">' + parts.map((x, i) => (i ? `<span>${x}</span>` : x)).join("") + "</nav>";
  }
  const badges = (get(s, "badges", []) || []).map((b: unknown) => `<span>${E(b)}</span>`).join("");
  const fl = or(get(s, "float"), {}) || {};
  const floatHtml = truthy(fl) ? `<div class="float"><b>${rich(get(fl, "title", ""))}</b><small>${E(get(fl, "text", ""))}</small></div>` : "";
  return (
    `<section class="hero${sub ? " sub" : ""}"><div class="hero-copy"><div class="split-text">${crumbs}${tag(get(s, "eyebrow"))}` +
    `<h1>${rich(or(get(s, "h1"), get(ctx.meta, "h1", "")))}</h1><p class="lead">${rich(get(s, "lead", ""))}</p>` +
    `${btns(get(s, "ctas"), lang)}${badges ? "<div class=badges>" + badges + "</div>" : ""}</div></div>` +
    (!sub
      ? `<div class="hero-media advisor"><img src="/site/img/advisor.jpg" alt="HYPOTEQ Beraterin (Symbolbild)" loading="eager"><div class="float2"><i></i>${E(UI[lang].online)} · <span class="city" data-cities="${E(pyJson(CAPITALS))}">Zürich</span></div>` +
        `<div class="float"><b>${rich(ADV[lang][0])}</b><small>${E(ADV[lang][1])}</small></div></div></section>`
      : `<div class="hero-media">${img(get(s, "image", "swiss-landscape"), get(s, "alt", ""), true)}${floatHtml}</div></section>`)
  );
}

function s_claim(s: Section): string {
  return `<section class="block claim rv"><p><span>${E(get(s, "a", ""))}</span> <em>${E(get(s, "b", ""))}<sup>®</sup></em></p></section>`;
}

function s_usp(s: Section): string {
  const items = or(get(s, "items"), []) || [];
  return '<section class="block usp rv">' + items.map((i: any) => `<div><b data-count="${E(i.value)}">${E(i.value)}</b><span>${E(i.label)}</span></div>`).join("") + "</section>";
}

function s_photo_cards(s: Section, ctx: Ctx): string {
  const out = (get(s, "items", []) || []).map((c: any, i: number) => {
    const cta = or(get(c, "cta"), {}) || {};
    return (
      `<article class="${rvd(i)}">${img(get(c, "image"), get(c, "alt", ""))}<div><small>${E(get(c, "kicker", ""))}</small>` +
      `<h3>${rich(get(c, "title", ""))}</h3>${truthy(get(c, "text")) ? "<p>" + rich(c.text) + "</p>" : ""}` +
      `<a class="text-link" href="${E(href(get(cta, "to"), ctx.lang))}"${blank(get(cta, "to", ""))}>${E(get(cta, "label", UI[ctx.lang].more))} ↗</a></div></article>`
    );
  });
  return '<section class="photo-cards">' + out.join("") + "</section>";
}

function s_features(s: Section, ctx: Ctx): string {
  const items = (get(s, "items", []) || []).map((f: any, i: number) => {
    const inner = `<span class="ico">${E(get(f, "icon", "↗"))}</span><h3>${rich(get(f, "title", ""))}</h3><p>${rich(get(f, "text", ""))}</p>`;
    if (truthy(get(f, "to"))) {
      return `<a class="${rvd(i)}" href="${E(href(f.to, ctx.lang))}"${blank(f.to)}>${inner}<span class="more">${E(UI[ctx.lang].more)} ↗</span></a>`;
    }
    return `<article class="${rvd(i)}">${inner}</article>`;
  });
  return `<section class="block dark pad features">${head(s)}<div class="feat-grid">${items.join("")}</div>${btns(get(s, "ctas"), ctx.lang, "lime", "ghost")}</section>`;
}

function scr(kind: string, lang: string, ctxNet: any = null): string {
  const L = UI[lang];
  const S = SCR[lang];
  if (kind === "funnel") {
    return `<div class="screen"><div class="screen-top"><b>HYPOTEQ · ${E(L.cta)}</b><small>Preview</small></div><div class="screen-body"><div class="upload">⇪ ${E(S.docs)}<div class="scan"><i></i></div></div><div class="screen-row"><span>${E(S.fields)}</span><span class="pill">KI/AI ✓</span></div><div class="screen-row"><span>${E(S.advisor)}</span><span class="pill dark">${E(S.today)}</span></div></div></div>`;
  }
  if (kind === "dossier") {
    const docs = S.d_docs.map((d: string, i: number) => `<div class="dz-doc" style="--i:${i}"><i></i><b>${E(d)}</b><span></span><span></span><span></span></div>`).join("");
    const fields = S.d_fields.map(([a, b]: [string, string], i: number) => `<div class="dz-field" style="--i:${i}"><small>${E(a)}</small><b>${E(b)}</b></div>`).join("");
    return (
      `<div class="screen dz" aria-hidden="true"><div class="screen-top"><b>HYPOTEQ · ${E(L.cta)}</b><small>Preview</small></div>` +
      `<div class="dz-stage"><div class="dz-stack">${docs}<div class="dz-beam"></div></div><div class="dz-fields">${fields}</div>` +
      `<div class="dz-type">${E(S.d_type)}</div><div class="dz-ready"><span>✓</span>${E(S.d_ready)}</div></div>` +
      `<div class="dz-swiss"><img src="/site/img/sms/SMS-Logo-1h-300dpi_RGB.png" alt="" width="120" height="17"><span>${E(S.d_swiss)}</span></div></div>`
    );
  }
  if (kind === "network") {
    const n: string[] = or(ctxNet, ["Partner", "HYPOTEQ", "40+", "A", "B", "C", "D", "E", "F"]);
    const L3: [number, number][] = [[58, 66], [58, 180], [58, 294]];
    const R3: [number, number][] = [[542, 66], [542, 180], [542, 294]];
    const lp = L3.map(([x, y]) => `M${x + 50} ${y} C 190 ${y}, 200 180, 240 180`);
    const rp = R3.map(([x, y]) => `M360 180 C 400 180, 410 ${y}, ${x - 50} ${y}`);
    const lines = [...lp, ...rp].map((d) => `<path class="nl" d="${d}"/>`).join("");
    let dots = lp.map((d, i) => `<circle class="np" r="3"><animateMotion dur="${(2.6 + i * 0.35).toFixed(2)}s" begin="${(i * 0.4).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`).join("");
    dots += rp.map((d, i) => `<circle class="np" r="3"><animateMotion dur="${(2.8 + i * 0.3).toFixed(2)}s" begin="${(0.6 + i * 0.4).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`).join("");
    const pts = [...L3, ...R3];
    const labels = n.slice(3, 9);
    const nodes = pts.slice(0, labels.length).map(([x, y], i) => `<g class="nn"><circle cx="${x}" cy="${y}" r="50"/><text x="${x}" y="${y + 4}">${E(labels[i])}</text></g>`).join("");
    return (
      `<div class="net" aria-hidden="true"><svg viewBox="0 0 600 370">${lines}${dots}${nodes}` +
      `<circle class="ring" cx="300" cy="180" r="62"/><circle class="ring r2" cx="300" cy="180" r="100"/>` +
      `<g class="nc"><rect x="240" y="150" width="120" height="60" rx="16"/><text x="300" y="187">HYPOTEQ</text></g>` +
      `<text class="lab" x="58" y="362">${E(n[0])}</text><text class="lab" x="300" y="362">${E(n[1])}</text><text class="lab" x="542" y="362">${E(n[2])}</text></svg></div>`
    );
  }
  if (kind === "portal") {
    return `<div class="screen"><div class="screen-top"><b>HYPOTEQ · Partnerportal</b><small>Preview</small></div><div class="screen-body"><div class="screen-row"><span>${E(S.case)} #2041 · ${E(S.p1)}</span><span class="pill">${E(S.offers)} 4</span></div><div class="screen-row"><span>${E(S.case)} #2038 · ${E(S.p2)}</span><span class="pill grey">${E(S.docs2)}</span></div><div class="screen-row"><span>${E(S.case)} #2035 · ${E(S.p3)}</span><span class="pill dark">${E(S.approved)}</span></div><div class="screen-row"><span>${E(S.comm)}</span><b>CHF ••••</b></div></div></div>`;
  }
  if (kind === "chat") {
    return `<div class="screen"><div class="screen-top"><b>HYPO · Assistant</b><small>Preview</small></div><div class="screen-body chat"><p class="me">${E(S.c1)}</p><p class="bot">${E(S.c2)}</p><p class="me">${E(S.c3)}</p><p class="bot"><span class="typing"><i></i><i></i><i></i></span></p></div></div>`;
  }
  if (kind === "academy") {
    return `<div class="screen"><div class="screen-top"><b>HYPOTEQ Academy · Learning Playground</b><small>Preview</small></div><div class="screen-body chat"><p class="me">${E(S.a1)}</p><p class="bot">${E(S.a2)}</p><div class="screen-row"><span>${E(S.lj)}</span><span class="pill">50 %</span></div></div></div>`;
  }
  if (kind === "valuation") {
    return `<div class="screen"><div class="screen-top"><b>HYPOTEQ × Wüest Partner</b><small>Preview</small></div><div class="screen-body"><div class="value-card"><small>${E(S.mv)}</small><b>CHF 1’184’000</b><div class="range"><i></i></div><small>${E(S.band)}</small></div><div class="screen-row"><span>${E(S.efh)}</span><span class="pill">CHF 300</span></div></div></div>`;
  }
  return "";
}
const SCREENS = new Set(["funnel", "portal", "chat", "academy", "valuation", "dossier", "network"]);

function s_split(s: Section, ctx: Ctx): string {
  const media = SCREENS.has(get(s, "screen"))
    ? scr(s.screen, ctx.lang, get(s, "net"))
    : `<div class="split-media">${img(get(s, "image"), get(s, "alt", ""))}</div>`;
  const paras = (get(s, "paragraphs", []) || []).map((p: unknown) => `<p>${rich(p)}</p>`).join("");
  const bullets = truthy(get(s, "bullets")) ? '<ul class="check">' + s.bullets.map((b: unknown) => `<li>${rich(b)}</li>`).join("") + "</ul>" : "";
  const tone = ({ dark: " dark", soft: " soft", lime: " lime" } as Record<string, string>)[get(s, "tone", "")] ?? "";
  const first = tone === " dark" ? "lime" : "";
  return (
    `<section class="block pad${tone}"><div class="split${truthy(get(s, "reverse")) ? " reverse" : ""}"><div class="rv">${head(s)}${paras}${bullets}` +
    `${btns(get(s, "ctas"), ctx.lang, first)}</div><div class="rv rv-d2">${media}</div></div></section>`
  );
}

function s_steps(s: Section, ctx: Ctx): string {
  const arts = (get(s, "items", []) || []).map((x: any, i: number) => `<article><span>${String(i + 1).padStart(2, "0")}</span><div><h3>${rich(x.title)}</h3><p>${rich(get(x, "text", ""))}</p></div></article>`).join("");
  return `<section class="block soft pad"><div class="steps"><div class="rv">${head(s)}${btns(get(s, "ctas"), ctx.lang)}</div><div class="step-list">${arts}</div></div></section>`;
}

function s_rates(s: Section, ctx: Ctx): string {
  const L = UI[ctx.lang];
  const labels: Record<string, string> = { saron: L.rates_saron, "5": L.rates_5, "10": L.rates_10 };
  const cards = RATES.map(
    ([k, r], i) =>
      `<article class="rate rv rv-d${i + 1}" style="--w:${Math.trunc((r / 2) * 100)}%"><small>${E(labels[k])}</small><b>${E(L.rates_from)} ${r.toFixed(2)}<sup>%</sup></b>` +
      `<div class="best"><span>${E(L.rates_best)}</span><b>${(BEST[k] ?? r).toFixed(2)} %</b></div><div class="bar"><i></i></div><a class="btn" href="${E(href("funnel", ctx.lang))}" target="_blank" rel="noopener">${E(L.rates_cta)}<span>↗</span></a></article>`,
  ).join("");
  return `<section class="block soft pad"><div class="rv">${head(s)}</div><div class="rates-grid">${cards}</div><p class="rates-note">${E(L.rates_note)}</p></section>`;
}

function s_calc(s: Section, ctx: Ctx): string {
  const lang = ctx.lang;
  const C = CL[lang];
  const field = (name: string, label: string, val: number, mx: number, cls = "") =>
    `<div class="hq-field${cls}" data-f="${name}"><label for="hq-${name}-{uid}">${E(label)}</label>` +
    `<div class="hq-input"><input id="hq-${name}-{uid}" name="${name}" inputmode="numeric" value="${val}" autocomplete="off"><span>CHF</span></div>` +
    `<input type="range" name="${name}_r" min="0" max="${mx}" step="5000" value="${val}" aria-label="${E(label)}"><small class="hq-min"></small></div>`;
  const opts = CALC_RATES.map(([k, r], i) => `<option value="${r}"${k === "5Y" ? " selected" : ""}>${E(C.rates[i])}</option>`).join("");
  let form =
    '<form class="hq-form" autocomplete="off">' +
    `<div class="seg mode"><button type="button" class="on" data-v="purchase">${E(C.purchase)}</button><button type="button" data-v="refinancing">${E(C.refinancing)}</button></div>` +
    `<div class="seg res"><button type="button" class="on" data-v="haupt">${E(C.main)}</button><button type="button" data-v="zweit">${E(C.second)}</button></div>` +
    field("price", C.price, 1000000, 5000000) +
    field("existing", C.existing, 500000, 5000000, " refi") +
    field("increase", C.increase, 0, 4000000, " refi") +
    field("own", C.own, 200000, 5000000, " buy") +
    field("income", C.income, 180000, 1000000) +
    `<div class="hq-field"><label>${E(C.select)}</label><select name="rate" aria-label="${E(C.select)}">${opts}</select></div></form>`;
  const tile = (k: string) => `<div class="hq-tile" data-t="${k}"><span></span><small></small><b>–</b></div>`;
  const small = (k: string) => `<div class="hq-small" data-s="${k}"><span></span><b>–</b></div>`;
  const out =
    `<div class="calc-out hq-out"><div class="hq-head"><p class="hq-title">–</p><output data-o="main">–</output></div>` +
    `<div class="hq-tiles">${tile("a")}${tile("b")}</div><div class="hq-smalls">${small("1")}${small("2")}${small("3")}${small("4")}</div>` +
    `<p class="fine">${E(C.fine)}</p>${btn({ label: C.cta, to: "funnel" }, lang, "lime")}</div>`;
  const uid = (ctx._calc ?? 0) + 1;
  ctx._calc = uid;
  form = form.split("{uid}").join(String(uid));
  const t = Object.fromEntries(["okP", "okR", "no", "aff", "ltv", "prev", "total", "interest", "maint", "amort", "side", "icost", "monthly", "own", "min"].map((k) => [k, C[k]]));
  return (
    `<section class="block lime pad" id="rechner"><div class="rv">${head(s)}</div>` +
    `<div class="calc hq-calc" data-calc="hq" data-t="${E(pyJson(t))}">${form}${out}</div></section>`
  );
}

function s_cards(s: Section, ctx: Ctx): string {
  const list = get(s, "items", []) || [];
  const n = list.length;
  const cols = or(get(s, "cols"), [2, 4].includes(n) && n === 2 ? 2 : [4, 8].includes(n) ? 4 : 3);
  const cls = ({ 2: " two", 4: " four" } as Record<number, string>)[cols] ?? "";
  const items = list.map((c0: any, i: number) => {
    let c = c0;
    if (!truthy(get(c, "title")) && String(get(c, "to", "")).startsWith("page:")) {
      const t = c.to.slice(5).split("#")[0];
      if (t in NAV[ctx.lang]) c = { ...c, title: NAV[ctx.lang][t][0], text: or(get(c, "text"), NAV[ctx.lang][t][1]) };
    }
    const inner = `${truthy(get(c, "kicker")) ? "<small>" + E(c.kicker) + "</small>" : ""}<h3>${rich(get(c, "title", ""))}</h3><p>${rich(get(c, "text", ""))}</p>`;
    if (truthy(get(c, "to"))) {
      return `<a class="card ${rvd(i)}" href="${E(href(c.to, ctx.lang))}"${blank(c.to)}>${inner}<span class="go">${E(or(get(c, "cta"), UI[ctx.lang].more))} ↗</span></a>`;
    }
    return `<article class="card ${rvd(i)}">${inner}</article>`;
  });
  const tone = ({ dark: " dark", soft: " soft" } as Record<string, string>)[get(s, "tone", "")] ?? "";
  return `<section class="block pad${tone}"><div class="rv">${head(s)}</div><div class="cards${cls}">${items.join("")}</div>${btns(get(s, "ctas"), ctx.lang, tone === " dark" ? "lime" : "")}</section>`;
}

function table(t: any): string {
  const hd0: string[] = (get(t, "head", []) || []).map((h: unknown) => String(h ?? "None"));
  const hq = new Set(hd0.map((h, i) => (h.toUpperCase().includes("HYPOTEQ") && i > 0 ? i : -1)).filter((i) => i >= 0));
  const hd = hd0.map((h, i) => `<th${hq.has(i) ? " class=hq" : ""}>${rich(h)}</th>`).join("");
  const rows = (get(t, "rows", []) || []).map((r: any[]) => {
    const hl = r && r.length && String(r[0]).toUpperCase().startsWith("HYPOTEQ") ? " class=hl" : "";
    const cells = r.map((c, i) => {
      const lab = i < hd0.length ? hd0[i].replace(/[*\n]/g, " ").trim() : "";
      const cls = hq.has(i) ? "hq" : "";
      return `<td data-label="${E(lab)}"${cls ? " class=" + cls : ""}>${rich(c)}</td>`;
    });
    return `<tr${hl}>` + cells.join("") + "</tr>";
  });
  const cmp = hd0.length === 3 ? " cmp2" : "";
  return `<div class="table-wrap${cmp}"><table><thead><tr>${hd}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function s_compare(s: Section, ctx: Ctx): string {
  return `<section class="block pad"><div class="rv">${head(s)}</div><div class="rv">${table(s)}</div>${truthy(get(s, "note")) ? "<p class=note>" + rich(s.note) + "</p>" : ""}${btns(get(s, "ctas"), ctx.lang)}</section>`;
}

function s_quote(s: Section): string {
  return `<section class="block dark pad quote rv"><div class="stars">★★★★★</div><blockquote>«${rich(get(s, "text", ""))}»</blockquote><cite>${E(get(s, "author", ""))}</cite></section>`;
}

function starsHtml(r: number = GOOGLE_RATING): string {
  const out = [0, 1, 2, 3, 4].map((i) => `<i style="--f:${((pyRound(Math.max(0, Math.min(1, r - i)) * 4) / 4) * 100).toFixed(0)}%"></i>`).join("");
  return `<span class="gstars" role="img" aria-label="${r.toFixed(1)} / 5">${out}</span>`;
}

function s_testimonials(s: Section, ctx: Ctx): string {
  const arts = (get(s, "items", []) || []).map((t: any, i: number) => `<article class="${rvd(i)}"><div class="stars" style="color:var(--green)">★★★★★</div><p>«${rich(t.text)}»</p><b>${E(get(t, "author", ""))}</b></article>`).join("");
  const g = truthy(get(s, "google"))
    ? `<a class="g-card rv" href="${E(LINKS.google)}" target="_blank" rel="noopener">${starsHtml()}<b>${GOOGLE_RATING.toFixed(1)}</b><span>${E(or(get(s, "google"), UI[ctx.lang].g_rev))}</span></a>`
    : "";
  return `<section class="block soft pad"><div class="testi-head"><div class="rv">${head(s)}</div>${g}</div><div class="testi">${arts}</div></section>`;
}

function s_trust(s: Section): string {
  const row = (get(s, "items", []) || []).map((x: unknown) => `<span>${E(x)}</span>`).join("");
  return `<div class="marquee" aria-hidden="true"><div>${row}${row}</div></div>`;
}

function s_pricing(s: Section, ctx: Ctx): string {
  const out = (get(s, "items", []) || []).map((p: any) => {
    const feat = truthy(get(p, "featured")) ? " feat" : "";
    const old = truthy(get(p, "old")) ? `<del>${E(p.old)}</del>` : "";
    const badge = truthy(get(p, "badge")) ? `<span class="pill badge${!feat ? " dark" : ""}">${E(p.badge)}</span>` : "";
    const lis = (get(p, "features", []) || []).map((x: unknown) => `<li>${rich(x)}</li>`).join("");
    return (
      `<article class="price rv${feat}">${badge}<small class="tag">${E(get(p, "name", ""))}</small><div class="amount">${E(get(p, "price", ""))}${old}</div>` +
      `<p>${rich(get(p, "text", ""))}</p><ul>${lis}</ul>${btn(get(p, "cta"), ctx.lang, feat ? "lime" : "")}</article>`
    );
  });
  return `<section class="block soft pad"><div class="rv">${head(s)}</div><div class="pricing">${out.join("")}</div></section>`;
}

function s_faq(s: Section, ctx: Ctx): string {
  const items = (get(s, "items", []) || []).map((q: any) => `<details><summary>${E(q.q)}<i aria-hidden="true">+</i></summary><div class="ans">${rich(q.a)}</div></details>`).join("");
  return `<section class="block pad"><div class="faq"><div class="rv">${head(s)}${btns(get(s, "ctas"), ctx.lang)}</div><div class="qa rv rv-d2">${items}</div></div></section>`;
}

function s_cta(s: Section, ctx: Ctx): string {
  const tone = ({ lime: " lime", soft: " soft" } as Record<string, string>)[get(s, "tone", "")] ?? " dark";
  return (
    `<section class="block pad cta-band${tone} rv"><div>${tag(get(s, "eyebrow"))}<h2>${rich(get(s, "title", ""))}</h2>` +
    `${truthy(get(s, "text")) ? "<p class=lead style=margin-top:20px>" + rich(s.text) + "</p>" : ""}</div>` +
    `${btns(get(s, "ctas"), ctx.lang, tone === " dark" ? "lime" : "")}</section>`
  );
}

function s_form(s: Section, ctx: Ctx): string {
  const L = UI[ctx.lang];
  const kind = get(s, "kind", "contact");
  const opts = L.form_types.map((o: string) => `<option>${E(o)}</option>`).join("");
  const extra = kind === "partner" ? `<div><label>${E(L.form_company)}</label><input></div><div><label>${E(L.form_type)}</label><select>${opts}</select></div>` : "";
  const form =
    `<form class="form-grid" data-demo><div><label>${E(L.form_name)}</label><input required></div><div><label>${E(L.form_mail)}</label><input type="email" required></div>` +
    `<div><label>${E(L.form_phone)}</label><input type="tel"></div>${extra}<div class="full"><label>${E(L.form_msg)}</label><textarea></textarea></div>` +
    `<div class="full"><button class="btn" type="submit">${E(L.form_send)}<span>↗</span></button><p class="form-ok">${E(L.form_ok)}</p></div></form>`;
  const paras = (get(s, "paragraphs", []) || []).map((p: unknown) => `<p>${rich(p)}</p>`).join("");
  return `<section class="block soft pad" id="formular"><div class="split"><div class="rv">${head(s)}${paras}${btns(get(s, "ctas"), ctx.lang)}</div><div class="rv rv-d2">${form}</div></div></section>`;
}

const words = (s: unknown) => String(s).split(/\s+/).filter(Boolean).length;

function s_article(s: Section, ctx: Ctx): string {
  const L = UI[ctx.lang];
  const toc: string[] = [];
  const body: string[] = [];
  let n = 0;
  let w = 0;
  for (const b of get(s, "blocks", []) || []) {
    if ("h2" in b) {
      n += 1;
      const aid = `a${n}`;
      toc.push(`<a href="#${aid}">${E(b.h2)}</a>`);
      body.push(`<h2 id="${aid}">${E(b.h2)}</h2>`);
    } else if ("h3" in b) body.push(`<h3>${E(b.h3)}</h3>`);
    else if ("p" in b) {
      body.push(`<p>${rich(b.p)}</p>`);
      w += words(b.p);
    } else if ("ul" in b) {
      body.push("<ul>" + b.ul.map((x: unknown) => `<li>${rich(x)}</li>`).join("") + "</ul>");
      w += b.ul.reduce((a: number, x: unknown) => a + words(x), 0);
    } else if ("ol" in b) body.push("<ol>" + b.ol.map((x: unknown) => `<li>${rich(x)}</li>`).join("") + "</ol>");
    else if ("tip" in b) body.push(`<div class="tip"><b>${E(get(b, "title", "Tipp"))}</b>${rich(b.tip)}</div>`);
    else if ("table" in b) body.push(table(b.table));
    else if ("cta" in b) {
      const c = b.cta;
      body.push(`<div class="inline-cta"><div><b>${rich(get(c, "title", ""))}</b><p>${rich(get(c, "text", ""))}</p></div>${btn(c, ctx.lang, "lime")}</div>`);
    }
  }
  const mins = Math.max(2, pyRound(w / 220));
  ctx.meta_line = `${L.read}: ${mins} ${L.min} · ${L.updated}`;
  return (
    `<section class="block pad"><div class="article-wrap"><aside class="toc"><b>${E(L.toc)}</b>${toc.join("")}</aside>` +
    `<article class="prose">${body.join("")}</article></div></section>`
  );
}

function s_sms(_s: Section, ctx: Ctx): string {
  const t = SMS_TXT[ctx.lang];
  return (
    `<section class="block soft pad sms-block rv"><div class="sms-card"><img src="/site/img/sms/sms-logo-RGB.svg" alt="swiss made software" width="170" height="132" loading="lazy"></div>` +
    `<div><span class="tag">Swiss Made Software</span><h2>${E(t[0])}.</h2><p class="lead">${E(t[1])}</p></div></section>`
  );
}

function s_tiles(s: Section, ctx: Ctx): string {
  const out = (get(s, "items", []) || []).map(
    (c: any, i: number) =>
      `<a class="tile ${rvd(i)}" href="${E(href(get(c, "to"), ctx.lang))}">${img(get(c, "image"), get(c, "title", ""))}<div>${truthy(get(c, "kicker")) ? "<small>" + E(c.kicker) + "</small>" : ""}<h3>${E(get(c, "title", ""))}</h3>${truthy(get(c, "text")) ? "<p>" + E(c.text) + "</p>" : ""}</div></a>`,
  );
  return `<section class="block pad">${head(s)}<div class="tiles">${out.join("")}</div></section>`;
}

const RENDER: Record<string, (s: Section, ctx: Ctx) => string> = {
  claim: s_claim, tiles: s_tiles, sms: s_sms, hero: s_hero, usp: s_usp, photo_cards: s_photo_cards, features: s_features, split: s_split, steps: s_steps,
  rates: s_rates, calc: s_calc, cards: s_cards, compare: s_compare, quote: s_quote, testimonials: s_testimonials,
  trust: s_trust, pricing: s_pricing, faq: s_faq, cta: s_cta, form: s_form, article: s_article,
};

/* ------------------------------------------------------------------ Frame */
function navHtml(lang: string, pid: string): string {
  const L = UI[lang];
  const N = NAV[lang];
  const items: string[] = [];
  for (const [g, ids0, promo] of MENU) {
    if (ids0 === null) {
      items.push(`<div class="item"><a href="${pathOf("zinsen", lang)}"${pid === "zinsen" ? " class=active" : ""}>${E(N.zinsen[0])}</a></div>`);
      continue;
    }
    const ids = ids0.filter((i) => i in PARENT);
    let links = ids.map((i) => `<a href="${pathOf(i, lang)}"><b>${E(N[i][0])}</b><small>${E(N[i][1])}</small></a>`).join("");
    if (promo) links += `<a class="promo" href="${E(href(promo, lang))}"${blank(promo)}><span>${E(L["promo_" + promo])}</span><span>↗</span></a>`;
    const single = ids.length <= 4 ? " single" : "";
    items.push(`<div class="item"><button aria-expanded="false">${E(L["g_" + g])}</button><div class="mega${single}">${links}</div></div>`);
  }
  items.push(
    `<div class="item mobile-only"><a href="${E(LINKS.portal)}" target="_blank" rel="noopener">${E(L.login)} ↗</a></div>` +
      `<div class="item mobile-only"><a href="tel:+41445029252">☎ 044 502 92 52</a></div>`,
  );
  const langs = LANGS.map((l) => `<a href="${pathOf(pid, l)}" hreflang="${HREFLANG[l]}" lang="${l}"${l === lang ? " class=on" : ""}>${l.toUpperCase()}</a>`).join("");
  return (
    `<div class="topbar"><div class="usps">${L.usp.map((u: string) => `<span>${u}</span>`).join("")}</div><div class="right">` +
    `<a href="tel:+41445029252">044 502 92 52</a><a href="${E(LINKS.portal)}" target="_blank" rel="noopener">${E(L.login)} ↗</a></div></div>` +
    `<header class="site-nav"><a class="logo" href="${pathOf("home", lang)}" aria-label="HYPOTEQ Home"><img src="/site/img/brand/hypoteq-logo-white.png" alt="HYPOTEQ" width="150" height="38"></a>` +
    `<nav class="main-nav" aria-label="Main">${items.join("")}</nav><div class="nav-right"><div class="lang">${langs}</div>` +
    `${btn({ label: L.cta, to: "funnel" }, lang)}<button class="menu-btn" aria-label="Menu" aria-expanded="false">☰</button></div></header>`
  );
}

function footerHtml(lang: string): string {
  const L = UI[lang];
  const N = NAV[lang];
  const col = (title: string, ids: string[]) => `<div><b>${E(title)}</b>` + ids.map((i) => `<a href="${pathOf(i, lang)}">${E(N[i][0])}</a>`).join("") + "</div>";
  return (
    `<footer class="site-footer"><div class="footer-head"><h2>${L.footer_h}</h2>${btn({ label: L.cta, to: "funnel" }, lang, "lime")}</div>` +
    `<div class="footer-cols"><div><span class="logo light"><img src="/site/img/brand/hypoteq-logo-white.png" alt="HYPOTEQ AG" width="150" height="38"></span><address>HYPOTEQ AG<br>Löwenstrasse 29<br>8001 Zürich<br>` +
    `<a href="tel:+41445029252">${PHONE_INTL}</a><a href="mailto:info@hypoteq.ch">info@hypoteq.ch</a></address>` +
    `<a class="li" href="${E(LINKS.linkedin)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-.9 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9z"/></svg>${E(L.follow)}</a>` +
    `<p class="f-claim">${E(L.footer_claim)}®</p></div>` +
    col(L.g_hyp, ["kauf", "abloesung", "neubau", "saron", "fest", "selbstaendige", "mezzanine", "themen", "kantone"].filter((i) => i in PARENT)) +
    col(L.g_tools, ["zinsen", "rechner", "tragbarkeit", "bewertung", "ratgeber"]) +
    col(L.g_b2b, ["partner", "partner-makler", "partner-treuhand", "partner-versicherung", "academy"]) +
    col(L.g_company, ["ueber-uns", "faq", "kontakt", "dokumente", "impressum", "datenschutz"]) +
    `</div><div class="footer-extra"><form class="nl" data-demo><b>${E(L.nl_t)}</b><p>${E(L.nl_x)}</p><div><input type="email" required placeholder="${E(L.nl_ph)}" aria-label="${E(L.nl_ph)}"><button class="btn lime" type="submit">${E(L.nl_b)}<span>↗</span></button></div><p class="form-ok">${E(L.nl_ok)}</p></form>` +
    `<a class="g-card dark" href="${E(LINKS.google)}" target="_blank" rel="noopener">${starsHtml()}<b>${GOOGLE_RATING.toFixed(1)}</b><span>${E(L.g_rev)}</span></a></div>` +
    `<div class="footer-trust"><a class="sms-badge" href="https://www.swissmadesoftware.org" target="_blank" rel="noopener" aria-label="Swiss Made Software"><img src="/site/img/sms/SMS-Logo-1h-300dpi_RGB.png" alt="swiss made software" width="190" height="27" loading="lazy"></a><span>${E(SMS[lang][1])}</span>` +
    `<button class="to-top" type="button" onclick="window.scrollTo({top:0,behavior:'smooth'})">${E(SMS[lang][2])} <span aria-hidden="true">↑</span></button></div>` +
    `<div class="footer-note"><span>${E(L.rights)}</span><span>${E(L.preview)}</span></div></footer>`
  );
}

function jsonld(pid: string, lang: string, meta: Ctx["meta"], sections: Section[]): string {
  const org = {
    "@context": "https://schema.org", "@type": "FinancialService", name: "HYPOTEQ AG", url: BASE + "/" + lang + "/",
    logo: BASE + "/images/HYPOTEQ_layout_logo.png", telephone: "+41 44 502 92 52", email: "info@hypoteq.ch",
    address: { "@type": "PostalAddress", streetAddress: "Löwenstrasse 29", postalCode: "8001", addressLocality: "Zürich", addressCountry: "CH" },
    areaServed: "CH", priceRange: "CHF 0", slogan: "Hypotheken sind dank HYPOTEQ vergleichbar geworden. Ihr Berater ist hingegen einzigartig.", sameAs: ["https://www.linkedin.com/company/hypoteq-ag"],
  };
  const out: any[] = pid === "home" ? [org] : [];
  let chain: string[] = [];
  let p: string | null = pid;
  while (p) {
    chain.push(p);
    p = PARENT[p] ?? null;
  }
  chain = chain.reverse();
  if (chain.length > 1) {
    out.push({
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: chain.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c === "home" ? UI[lang].home : NAV[lang][c][0], item: urlOf(c, lang) })),
    });
  }
  const faqs = sections.filter((s) => get(s, "type") === "faq").flatMap((s) => get(s, "items", []) || []);
  if (faqs.length) {
    out.push({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faqs.map((q: any) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: String(q.a).replace(/\*/g, "") } })),
    });
  }
  if (pid === "academy") {
    out.push({
      "@context": "https://schema.org", "@type": "Course", name: "HYPOTEQ Foundation Course", description: get(meta, "description", ""),
      provider: { "@type": "Organization", name: "HYPOTEQ AG" }, inLanguage: HREFLANG[lang as keyof typeof HREFLANG],
      offers: { "@type": "Offer", price: "290", priceCurrency: "CHF", category: "Paid" },
    });
  }
  if (pid === "bewertung") {
    out.push({
      "@context": "https://schema.org", "@type": "Service", name: get(meta, "h1", "Immobilienbewertung"), provider: { "@type": "Organization", name: "HYPOTEQ AG" },
      areaServed: "CH", offers: { "@type": "Offer", price: "300", priceCurrency: "CHF" },
    });
  }
  if (pid.startsWith("rg-")) {
    out.push({
      "@context": "https://schema.org", "@type": "Article", headline: get(meta, "h1", ""), inLanguage: HREFLANG[lang as keyof typeof HREFLANG],
      author: { "@type": "Organization", name: "HYPOTEQ AG" }, dateModified: "2026-11-04",
    });
  }
  return out.map((o) => `<script type="application/ld+json">${pyJson(o).replace(/<\//g, "<\\/")}</script>`).join("");
}

export type RenderedPage = {
  pid: string;
  lang: string;
  meta: Ctx["meta"];
  noindex: boolean;
  /** JSON-LD script tags. */
  jsonld: string;
  /** Everything the design puts into <body>, without its script tag. */
  body: string;
};

const cache = new Map<string, RenderedPage>();

export function renderPage(pid: string, lang: string): RenderedPage {
  const key = `${lang}/${pid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const data = pageData(pid, lang);
  const kw = or(get(or(get(KW, pid, {}), {}) || {}, lang, {}), {}) || {};
  const meta = {
    title: or(or(get(data, "title"), get(kw, "title")), `${NAV[lang][pid][0]} | HYPOTEQ`),
    description: or(or(get(data, "description"), get(kw, "description")), ""),
    h1: or(or(get(data, "h1"), get(kw, "h1")), NAV[lang][pid][0]),
  };
  const sections: Section[] = [...(or(get(data, "sections"), [{ type: "hero", h1: meta.h1, lead: meta.description }]) as Section[])];
  if (["home", "ueber-uns", "partner"].includes(pid) && sections.length > 2) sections.splice(sections.length - 1, 0, { type: "sms" });
  const ctx: Ctx = { lang, pid, meta };
  const body: string[] = [];
  for (const s of sections) {
    const f = RENDER[get(s, "type")];
    if (!f) {
      console.warn(`website: unknown section type ${get(s, "type")} in ${pid}/${lang}`);
      continue;
    }
    try {
      body.push(f(s, ctx));
    } catch (e) {
      console.warn(`website: error in ${pid}/${lang}/${get(s, "type")}:`, e);
    }
  }
  if (ctx.meta_line && body.length && get(sections[0], "type") === "hero" && body[0].includes('<div class="actions">')) {
    body[0] = body[0].replace('</p><div class="actions">', `</p><p class="meta-line">${E(ctx.meta_line)}</p><div class="actions">`);
  }
  const L = UI[lang];
  const sticky = `<div class="sticky-cta">${btn({ label: L.cta, to: "funnel" }, lang)}<a class="btn lime" href="tel:+41445029252" aria-label="${E(L.call)}">☎</a></div>`;
  const page: RenderedPage = {
    pid,
    lang,
    meta,
    noindex: pid === "impressum" || pid === "datenschutz",
    jsonld: jsonld(pid, lang, meta, sections),
    body:
      `<a class="skip" href="#main">${E(L.skip)}</a><div class="progress"></div><div class="preview-bar">${E(L.preview)}</div>\n` +
      `${navHtml(lang, pid)}<main id="main">${body.join("")}</main>${footerHtml(lang)}${sticky}`,
  };
  cache.set(key, page);
  return page;
}
