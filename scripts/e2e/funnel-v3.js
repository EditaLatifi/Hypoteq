/**
 * Local end-to-end run of Funnel v3 in a real browser, with the backend simulated.
 *
 *   npx next build && npx next start -p 3005
 *   cd scripts/e2e && npm i playwright && node funnel-v3.js
 *   (PW_EXE=<path to a chrome.exe> uses an existing Chromium instead of downloading one)
 *
 * Every /api/* call (upload, AI analysis, submit, partner lookup, Nachreichung) is answered in
 * the browser, so nothing reaches the database, Salesforce, SharePoint or a mailbox — the
 * only safe way to run the whole flow locally while .env.local points at production. The
 * server side of those calls is covered by the jest suites (tests/funnelV3).
 */
// Full local end-to-end run of Funnel v3 against the production build on :3005, with every
// backend endpoint simulated in the browser (SharePoint upload, AI analysis, submit, partner
// lookup, Nachreichung). Nothing reaches the real database, Salesforce, SharePoint or a
// mailbox. Checks: uploads + recognition states, «Veraltet», answer-correction suggestion,
// not-needed extras, cross-checks, step 6, submit → done state with Fallnummer, Berater
// recognition (known / degraded), Nachreich page of a complete dossier, phone width.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:3005";
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const PDF = fs.readFileSync(require("path").join(__dirname, "..", "..", "test-documents", "dokument_1.pdf"));
const CASE = "HQ-26-10-123456";

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log((cond ? "  ok   " : "  FAIL ") + msg); };

/** Simulated AI answer per uploaded file name. */
function analysisFor(name) {
  const base = (docTypeId, over = {}) => ({ status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.96, requirementId: docTypeId, fields: {}, ...over });
  if (/Grundbuch/i.test(name)) return base("grundbuch", { docDate: "2026-01-15", outdated: true, outdatedReason: "älter als 6 Monate", fields: { Eigentümer: { value: "Gary Samuel Gerber", confidence: 0.97 }, Ausstellungsdatum: { value: "15.01.2026", confidence: 0.98 } } });
  if (/Lohnausweis/i.test(name)) return base("lohnausweise", { docDate: "2025", personName: "Gerber Gary", fields: { Arbeitgeber: { value: "Etzel Liegenschaften AG", confidence: 0.95 }, "Bruttolohn 2025": { value: "CHF 125'385", confidence: 0.95 } } });
  if (/Leasing/i.test(name)) return base("leasing", { docDate: "2025-03-01", note: "Leasing CHF 420/Monat bis 2028", fields: { Leasinggeber: { value: "Cembra", confidence: 0.9 } } });
  if (/Steuerrechnung/i.test(name)) return base("nn_steuerrechnung", { requirementId: null, extraKind: "notneeded", extraReason: "Steuerrechnung", docDate: "2025-11-02" });
  if (/Gebaeudeversicherung|GVZ/i.test(name)) return base("gvz", { docDate: "2026-01-01", fields: { Erstellungsjahr: { value: "1921", confidence: 0.9 }, Volumen: { value: "1497 m³", confidence: 0.9 } } });
  if (/Verkaufsdok/i.test(name)) return base("verkaufsdoku", { docDate: "2024", fields: { Baujahr: { value: "1921", confidence: 0.92 } } });
  return { status: "failed", docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, extraKind: "unknown", fields: {} };
}

async function mockBackend(page, opts = {}) {
  let n = 0;
  const docs = new Map(); // documentId → file name
  const nachreichView = (missing) => ({ valid: true, v3: true, lang: "de", caseNumber: CASE, missing, expiresAt: new Date(Date.now() + 86400000).toISOString(), email: "gary.gerber@example.invalid", folderId: "FOLDER", submissionId: "inq-e2e" });
  await page.route("**/__mock-upload/**", (route) => {
    const id = route.request().url().split("/__mock-upload/")[1];
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: `drive-${id}`, name: `f${id}.pdf`, webUrl: `https://sharepoint.invalid/f${id}.pdf` }) });
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const body = req.postDataJSON ? (() => { try { return req.postDataJSON(); } catch { return null; } })() : null;
    const json = (obj, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(obj) });
    if (p === "/api/upload-doc/start") {
      n += 1;
      return json({ uploadUrl: `${BASE}/__mock-upload/${n}`, folderId: "FOLDER" });
    }
    if (p === "/api/upload-doc/finalize") {
      const id = `doc-${body.driveItemId}`;
      docs.set(id, body.originalFileName);
      return json({ success: true, documentId: id, webUrl: `https://sharepoint.invalid/${body.originalFileName}`, contentHash: "sha-" + body.originalFileName });
    }
    if (p.startsWith("/api/upload-doc/") && req.method() === "DELETE") return json({ success: true });
    if (p === "/api/document-intelligence/analyse") {
      await new Promise((r) => setTimeout(r, 300));
      return json({ success: true, analysis: analysisFor(docs.get(body.documentId) || "") });
    }
    if (p === "/api/partner/recognize") {
      if (opts.partnerDown) return json({ error: "boom" }, 500);
      if (/anna@vzch\.ch/i.test(body?.email || "")) return json({ status: "partner", name: "Anna Muster", company: "VZ VermögensZentrum", initials: "AM" });
      return json({ status: "unknown" });
    }
    if (p === "/api/inquiry") return json({ success: true, inquiryId: "inq-e2e", caseNumber: CASE, salesforceSynced: true });
    if (p === "/api/dossier/preview" || p.startsWith("/api/dossier/")) return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
    if (p.startsWith("/api/nachreichen/")) {
      if (req.method() === "GET") return json(nachreichView(opts.nachreichMissing || []));
      return json({ ok: true, v3: true, complete: true, remaining: [] });
    }
    return json({ error: `unmocked ${p}` }, 500);
  });
}

async function newPage(browser, viewport, opts) {
  const ctx = await browser.newContext({ viewport, locale: "de-CH" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  await mockBackend(page, opts);
  return { page, errors, ctx };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });
const radio = (page, re) => page.getByRole("radio", { name: re, exact: false }).first().click();
const fill = async (page, re, v) => { const el = page.getByLabel(re).first(); await el.fill(""); await el.type(String(v), { delay: 5 }); };
const next = async (page) => { await page.locator("footer.v3-footer .v3-btn--primary").click(); await page.waitForTimeout(400); };
const uploadInput = (page) => page.locator("input.v3-docs-hidden-input:not([webkitdirectory])").first();
const files = (names) => names.map((name) => ({ name, mimeType: "application/pdf", buffer: PDF }));

async function kundeFlow(browser, vpName, viewport) {
  console.log(`\n== Kunde selbst · ${vpName} ==`);
  const { page, errors, ctx } = await newPage(browser, viewport);
  await page.goto(`${BASE}/de/funnel`, { waitUntil: "networkidle" });
  await page.locator(".v3-start-card").nth(1).click();
  await page.waitForTimeout(300);
  // Step 1 (validation first)
  await next(page);
  check(await page.getByText("Bitte eine Option wählen.").count() > 0, "step 1: validation messages appear on «Weiter»");
  await radio(page, /^Ablösung/);
  await radio(page, /^Herr$/);
  await fill(page, /^Vorname/, "Gary");
  await fill(page, /^Nachname/, "Gerber");
  await fill(page, /^E-Mail/, "gary.gerber@example.invalid");
  await fill(page, /^Telefon/, "+41 79 123 45 67");
  await next(page);
  // Step 2
  await fill(page, /^PLZ/, "8820");
  await fill(page, /^Ort/, "Wädenswil");
  await radio(page, /^Bestehende Immobilie/);
  await radio(page, /^Stockwerkeigentum/);
  await radio(page, /^Selbstbewohnt/);
  await radio(page, /^Gas$/);
  await fill(page, /^Bestehende Hypothek/, "720000");
  await page.getByRole("radiogroup", { name: /erhöht werden/ }).getByRole("radio", { name: /^Ja/ }).click();
  await page.waitForTimeout(300);
  const up = page.getByRole("textbox", { name: /Erhöhung/ }).first();
  await up.fill(""); await up.type("80000", { delay: 5 });
  await next(page);
  // Step 3
  await fill(page, /^Bruttoeinkommen/, "125000");
  await radio(page, /^Angestellt/);
  const kinder = page.getByRole("radiogroup", { name: /Kinder/ });
  await kinder.getByRole("radio", { name: /^Ja/ }).click();
  await page.getByRole("radiogroup", { name: /Unterhalt/ }).getByRole("radio", { name: /^Ja/ }).click();
  await page.getByRole("radiogroup", { name: /Privatkredite/ }).getByRole("radio", { name: /^Ja/ }).click();
  await next(page);
  // Step 4
  await fill(page, /^Geschätzter Objektwert/, "1100000");
  await radio(page, /^10 Jahre/);
  await page.getByRole("radiogroup", { name: /Säule 3a/ }).getByRole("radio", { name: /^Ja/ }).click();
  const needText = await page.locator(".v3-calc-need").innerText();
  check(needText.includes("800'000"), `step 4: Gesamtfinanzierung 720'000 + 80'000 shown (${needText})`);
  await next(page);
  // Step 5
  const total = Number(await page.locator(".v3-side-count-n, .v3-railbar-n").first().innerText());
  check(total === 22, `step 5: 22 requirements (Gerber with Leasings still on Nein; got ${total})`);
  await uploadInput(page).setInputFiles(files([
    "03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf",
    "01_Lohnausweis_Gary_Gerber_2025.pdf",
    "01_Leasingvertrag_Cembra_Gary_Gerber.pdf",
    "Steuerrechnung_2025_Gemeinde.pdf",
    "03_Gebaeudeversicherung_GVZ_2026.pdf",
    "03_Verkaufsdokumentation_Etzelstrasse_52.pdf",
  ]));
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => !document.querySelector(".v3-busy") && !document.querySelector(".v3-docrow.is-analysing") && !/Wird gelesen/.test(document.body.innerText), null, { timeout: 40000 });
  await page.waitForTimeout(600);
  const body = await page.locator("body").innerText();
  check(/Veraltet/i.test(body), "step 5: Grundbuchauszug shows «Veraltet»");
  check(/Teilweise · 1\/3/i.test(body), "step 5: Lohnausweise shows «Teilweise · 1/3»");
  check(/Leasingvertrag erkannt/.test(body) && /Antwort auf «Ja» setzen/.test(body), "step 5: answer-correction suggestion for the Leasingvertrag (Leasings = Nein)");
  check(/Weitere Dateien/i.test(body), "step 5: «Weitere Dateien» section (not-needed Steuerrechnung)");
  await shot(page, `${vpName}-05-after-upload`);
  // Accept the suggestion → Leasings = Ja → 24 requirements
  await page.getByRole("button", { name: /Antwort auf «Ja» setzen/ }).first().click();
  await page.waitForTimeout(500);
  const total2 = Number(await page.locator(".v3-side-count-n, .v3-railbar-n").first().innerText());
  check(total2 === 23, `step 5: suggestion accepted → Leasings = Ja → 23 requirements (got ${total2})`);
  // Outdated Grundbuch → open the row, «Trotzdem verwenden»
  const gbRow = page.locator(".v3-docrow", { hasText: "Grundbuchauszug" }).first();
  await gbRow.locator(".v3-docrow-head").click();
  await page.waitForTimeout(300);
  await gbRow.getByRole("button", { name: /Trotzdem verwenden/ }).first().click();
  await page.waitForTimeout(400);
  check(/Erkannt/i.test(await gbRow.innerText()) && !/Veraltet/i.test(await gbRow.locator(".v3-docrow-head .v3-tag").innerText()), "step 5: «Trotzdem verwenden» turns the Grundbuch row to «Erkannt»");
  await page.waitForTimeout(400);
  // Open the GVZ row details → cross-check Baujahr against Verkaufsdoku
  const gvzRow = page.locator(".v3-docrow", { hasText: "Gebäudeversicherungspolice" }).first();
  await gvzRow.locator(".v3-docrow-head").click();
  await page.waitForTimeout(300);
  const gvzText = await gvzRow.innerText();
  check(/Baujahr/.test(gvzText) && /1921/.test(gvzText) && /stimmt überein|übereinstimm|✓/i.test(gvzText), "step 5: Baujahr cross-check GVZ ↔ Verkaufsdoku shown as matching");
  // Lohnausweis row → income cross-check 125'000 vs 125'385
  const lohnRow = page.locator(".v3-docrow", { hasText: "Lohnausweise" }).first();
  await lohnRow.locator(".v3-docrow-head").click();
  await page.waitForTimeout(300);
  const lohnText = await lohnRow.innerText();
  check(/Bruttoeinkommen/.test(lohnText) && /125'385/.test(lohnText), "step 5: income cross-check funnel vs Lohnausweis shown");
  await shot(page, `${vpName}-05-details`);
  const fulfilled = await page.locator(".v3-status-title, .v3-status h2, [class*=status]").first().innerText().catch(() => "");
  console.log("  status line:", fulfilled.replace(/\s+/g, " ").slice(0, 80));
  await next(page);
  // Step 6
  const s6 = await page.locator("body").innerText();
  check(/CHF 800'000/.test(s6), "step 6: Gesamtfinanzierung KPI");
  check(/Hinweise an die Bank/i.test(s6) && /Leasing/i.test(s6), "step 6: bank hints include the leasing");
  check(/\/ 23/.test(s6), "step 6: Unterlagen x / 23");
  await shot(page, `${vpName}-06-before-submit`);
  // Draft dossier (mocked) must not error
  await page.getByRole("button", { name: /Fall-Dossier als PDF/ }).click();
  await page.waitForTimeout(800);
  // Submit
  await page.getByRole("button", { name: /^Finanzierungsanfrage abschliessen$/ }).click();
  await page.waitForSelector(".v3-done", { timeout: 20000 });
  const done = await page.locator(".v3-done").innerText();
  check(done.includes(CASE), `step 6: done state names the Fallnummer ${CASE}`);
  check(/gary.gerber@example.invalid/.test(done), "step 6: done state names the confirmation address");
  await shot(page, `${vpName}-06-done`);
  // Reload keeps the done state
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  check((await page.locator(".v3-done").count()) === 1, "step 6: done state survives a reload");
  // New request → start screen, empty
  await page.getByRole("button", { name: /Neuen Antrag stellen/ }).click();
  await page.waitForTimeout(400);
  check((await page.locator(".v3-start-card").count()) === 2, "«Neuen Antrag stellen» returns to the start screen");
  check(errors.length === 0, `no console / page errors (${errors.length})`);
  if (errors.length) console.log(errors.join("\n"));
  await ctx.close();
}

async function beraterFlow(browser) {
  console.log("\n== Berater · partner recognition ==");
  {
    const { page, errors, ctx } = await newPage(browser, { width: 1440, height: 960 });
    await page.goto(`${BASE}/de/funnel`, { waitUntil: "networkidle" });
    await page.locator(".v3-start-card").nth(0).click();
    await page.waitForTimeout(300);
    await page.locator("input[type=email]").first().type("anna@vzch.ch", { delay: 10 });
    await page.waitForTimeout(1200);
    const t = await page.locator("body").innerText();
    check(/Anna Muster/.test(t) && /Erkannt/i.test(t), "known partner → card «Erkannt» with name");
    check(/Erfasst von Anna Muster/.test(t), "sidebar «Erfasst von Anna Muster»");
    await shot(page, "berater-known");
    await page.locator("input[type=email]").first().fill("");
    await page.locator("input[type=email]").first().type("neu@makler.ch", { delay: 10 });
    await page.waitForTimeout(1200);
    const t2 = await page.locator("body").innerText();
    check(/Noch kein Partner\?/.test(t2), "unknown address → «Noch kein Partner?»");
    await page.getByRole("button", { name: /Als Partner erfassen/ }).click();
    await page.waitForTimeout(300);
    check((await page.getByLabel(/Telefon für Rückfragen/).count()) === 1, "«Als Partner erfassen» opens the form");
    check(errors.length === 0, `no errors (${errors.length})`);
    await ctx.close();
  }
  {
    const { page, errors, ctx } = await newPage(browser, { width: 1440, height: 960 }, { partnerDown: true });
    await page.goto(`${BASE}/de/funnel`, { waitUntil: "networkidle" });
    await page.locator(".v3-start-card").nth(0).click();
    await page.waitForTimeout(300);
    await page.locator("input[type=email]").first().type("anna@vzch.ch", { delay: 10 });
    await page.waitForTimeout(1200);
    const t = await page.locator("body").innerText();
    check(/Prüfung gerade nicht möglich/.test(t), "Salesforce down → «Prüfung gerade nicht möglich» instead of «kennen wir nicht»");
    await shot(page, "berater-degraded");
    const real = errors.filter((e) => !/Failed to load resource|500/.test(e));
    check(real.length === 0, `no errors apart from the simulated 500 (${real.length})`);
    if (real.length) console.log(real.join(" | "));
    await ctx.close();
  }
}

async function nachreichFlow(browser) {
  console.log("\n== Nachreichung · complete dossier takes extras ==");
  const { page, errors, ctx } = await newPage(browser, { width: 1440, height: 960 });
  await page.goto(`${BASE}/de/nachreichen/tok-e2e`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const t = await page.locator("body").innerText();
  check(/bereits vollständig/.test(t) && /weitere Unterlagen hinzufügen/.test(t), "complete dossier: status text + invitation to add documents");
  check(t.includes(CASE), "complete dossier: Fallnummer shown");
  check((await page.locator(".v3-drop").count()) === 1, "complete dossier: drop zone present");
  await uploadInput(page).setInputFiles(files(["01_Lohnausweis_Gary_Gerber_2022.pdf"]));
  await page.waitForTimeout(1500);
  check(/Weitere Dateien/i.test(await page.locator("body").innerText()), "added file listed under «Weitere Dateien»");
  await shot(page, "nachreich-complete");
  await page.getByRole("button", { name: /Unterlagen senden/ }).click();
  await page.waitForTimeout(800);
  check(/zusätzlichen Unterlagen erhalten/.test(await page.locator("body").innerText()), "done: «zusätzliche Unterlagen erhalten»");
  await shot(page, "nachreich-done");
  check(errors.length === 0, `no errors (${errors.length})`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    await kundeFlow(browser, "desktop", { width: 1440, height: 960 });
    await kundeFlow(browser, "phone", { width: 390, height: 844 });
    await beraterFlow(browser);
    await nachreichFlow(browser);
  } catch (e) {
    failures.push("script error: " + e.message);
    console.error(e);
  }
  await browser.close();
  console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : failures.length + " FAILURE(S)"}`);
  for (const f of failures) console.log(" - " + f);
  process.exit(failures.length ? 1 : 0);
})();
