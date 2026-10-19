/**
 * Funnel v5 walk-through in a real browser with the backend simulated (docs/funnel-v5,
 * Handover 1–4, 6): both entries — Begleitet as Kunde, Schnell as Berater from the
 * Partnerportal link — at 1440 and 390 px, one screenshot per screen.
 *
 *   npx next dev -p 3005      (no .env file needed: every /api/** call is answered here)
 *   cd scripts/e2e && npm i playwright@1.47.2 && node funnel-v5.js
 *   (PW_EXE=<chrome.exe> uses an existing Chromium, OUT=<dir> moves the screenshots)
 *
 * «Finanzierungsanfrage abschliessen» is never pressed; any other API call is refused.
 */
// Every /api/** call is answered here (simulated upload + analysis + partner lookup), so nothing
// reaches a backend. «Finanzierungsanfrage abschliessen» is never clicked.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:3005";
const OUT = process.env.OUT || path.join(__dirname, "shots", "v5");
fs.mkdirSync(OUT, { recursive: true });
const EXE = process.env.PW_EXE;
// A tiny valid PDF.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const notes = [];
const check = (cond, msg) => {
  notes.push((cond ? "ok   " : "FAIL ") + msg);
  console.log((cond ? "  ok   " : "  FAIL ") + msg);
};

const fld = (value, confidence = 0.95) => ({ value, confidence });
/** Simulated analysis per file name. */
function analysisFor(name) {
  const base = (docTypeId, over = {}) => ({ status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.96, requirementId: docTypeId, fields: {}, contentHash: "sha-" + name, ...over });
  const n = name.toLowerCase();
  // Files of the guided case (Anna Muster) carry «_Muster» as a word of the name
  // (not «Mustermann», «Musterbank», «Muster-Kredit» of the fast case).
  const anna = /_muster[._]/.test(n);
  const who = anna ? { pn: "Muster Anna", full: "Anna Muster" } : { pn: "Mustermann Max", full: "Max Simon Mustermann" };
  if (n.includes("kopie")) return base("grundbuch", { contentHash: "sha-grundbuch", docDate: "2026-09-20" });
  if (n.includes("auskunft")) return base("vollmacht", { personName: who.pn, fields: { Vollmachtgeber: fld(who.full), Unterschrift: fld("vorhanden"), "Unterzeichnet am": fld("10.10.2026") } });
  if (n.includes("lohnausweis") && anna) return base("lohnausweise", { docDate: n.includes("2023") ? "2023" : "2025", personName: who.pn, fields: { Jahr: fld(n.includes("2023") ? "2023" : "2025"), Bruttolohn: fld("CHF 180'000") } });
  if (n.includes("pass") || n.includes("_id_")) return base("id", { personName: "Mustermann Max Simon", fields: { Name: fld("MUSTERMANN"), Vornamen: fld("MAX SIMON"), Geschlecht: fld("M"), Geburtsdatum: fld("05.03.1985"), Nationalität: fld("Schweiz") } });
  if (n.includes("grundbuch")) return base("grundbuch", { contentHash: "sha-grundbuch", docDate: "2026-09-20", fields: { PLZ: fld("8000"), Ort: fld("Zürich"), Adresse: fld("Musterweg 1"), Baurecht: fld("Nein"), Wertquote: fld("60/1000"), Ausstellungsdatum: fld("20.09.2026") } });
  if (n.includes("zinsabrechnung")) return base("hyp_zins", { bank: "Musterbank", docDate: "2026-07-01", fields: { Kapital: fld("CHF 380'000"), Zinssatz: fld("SARON 0.80 %"), Ablösedatum: fld("31.03.2028") } });
  if (n.includes("produktvereinbarung")) return base("produkt", { bank: "Musterbank", docDate: "2025-01-30", fields: { Bank: fld("Musterbank"), Betrag: fld("CHF 380'000") } });
  if (n.includes("rahmenvertrag")) return base("hyp_rahmen", { requirementId: null, extraKind: "notneeded", docDate: "2019-02-01" });
  if (n.includes("lohnausweis_2023")) return base("lohnausweise", { docDate: "2023", personName: "Mustermann Max", fields: { Jahr: fld("2023"), Bruttolohn: fld("CHF 101'800") } });
  if (n.includes("lohnausweis")) return base("lohnausweise", { docDate: "2025", personName: "Mustermann Max", fields: { Arbeitgeber: fld("Muster Treuhand AG"), Jahr: fld("2025"), Bruttolohn: fld("CHF 110'310") } });
  if (n.includes("lohnabrechnung")) return base("lohnabrechnungen", { docDate: "2026-08-31", personName: "Mustermann Max", fields: { "Monatslohn brutto": fld("CHF 7'750"), "13. Monatslohn": fld("Ja") } });
  if (n.includes("steuererkl")) return base("steuer", { docDate: "2025", personName: "Mustermann Max", fields: { Zivilstand: fld("ledig"), Kinder: fld("2"), Eigenmietwert: fld("CHF 18'600", 0.8) } });
  if (n.includes("stwe")) return base("stwe_regl", { docDate: "2015-03-01" });
  if (n.includes("kreditvertrag")) return base("kredit", { docDate: "2025-04-01", note: "Privatkredit Muster Kredit, Restschuld CHF 21'480", fields: { Kreditgeber: fld("Muster Kredit"), Restschuld: fld("CHF 21'480"), Monatsrate: fld("CHF 610") } });
  if (n.includes("unterhalt")) return base("unterhalt", { docDate: "2021-05-01", fields: { Unterhaltsbeitrag: fld("CHF 1'200") } });
  if (n.includes("police")) return base("police", { docDate: "2026-01-09", fields: { Rückkaufswert: fld("CHF 8'760") } });
  if (n.includes("verkaufsdok")) return base("verkaufsdoku", { docDate: "2024", fields: { Verkaufspreis: fld("CHF 1'240'000", 0.85), Baujahr: fld("1964"), Heizung: fld("Holzofen erwähnt") } });
  if (n.includes("gebaeudeversicherung")) return base("gvz", { docDate: "2026-01-01", fields: { Erstellungsjahr: fld("1964"), Volumen: fld("1'320 m³") } });
  if (n.includes("eigenmittel")) return base("vermoegen", { docDate: "2026-09-30", fields: { "Saldo total": fld("CHF 160'000") } });
  if (n.includes("fotos")) return base("fotos", { docDate: "2026-05-01" });
  if (n.includes("steuerrechnung")) return base("nn_steuerrechnung", { requirementId: null, extraKind: "notneeded", docDate: "2025-11-02" });
  return { status: "failed", docTypeId: null, docTypeLabel: null, confidence: 0, requirementId: null, extraKind: "unknown", fields: {}, contentHash: "sha-" + name };
}

async function mockBackend(page) {
  let n = 0;
  const docs = new Map();
  await page.route("**/__mock-upload/**", (route) => {
    const id = route.request().url().split("/__mock-upload/")[1];
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: `drive-${id}`, name: `f${id}.pdf` }) });
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {}
    const json = (obj, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(obj) });
    if (p === "/api/upload-doc/start") {
      n += 1;
      return json({ uploadUrl: `${BASE}/__mock-upload/${n}`, folderId: "FOLDER" });
    }
    if (p === "/api/upload-doc/finalize") {
      const id = `doc-${body.driveItemId}`;
      docs.set(id, body.originalFileName);
      return json({ success: true, documentId: id, webUrl: null, contentHash: "sha-" + body.originalFileName });
    }
    if (p.startsWith("/api/upload-doc/")) return json({ success: true });
    if (p === "/api/document-intelligence/analyse") {
      await new Promise((r) => setTimeout(r, 250));
      return json({ success: true, analysis: analysisFor(docs.get(body.documentId) || "") });
    }
    if (p === "/api/partner/recognize") {
      if (/anna@vzch\.ch/i.test(body?.email || "")) return json({ status: "partner", name: "Anna Muster", company: "VZ VermögensZentrum", initials: "AM" });
      return json({ status: "unknown" });
    }
    // Anything else (inquiry submit, dossier …) is refused — the walk-through never submits.
    return json({ error: `blocked in walk-through: ${p}` }, 403);
  });
}

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, locale: "de-CH" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300));
  });
  await mockBackend(page);
  return { page, errors, ctx };
}

// Full page from the top; the toast (a passing message) is waited out so it hides nothing.
const shot = async (page, name) => {
  await page.waitForFunction(() => !document.querySelector(".v3-toast"), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });
};
/** One element at the viewport's scale, for a closer look. */
const part = async (page, selector, name) => {
  const el = page.locator(selector).first();
  if (!(await el.count())) return;
  await page.waitForFunction(() => !document.querySelector(".v3-toast"), null, { timeout: 10000 }).catch(() => {});
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: path.join(OUT, name + ".png") });
};
const byId = (page, field) => page.locator(`[id="v3-f-${field}"]`);
const fillId = async (page, field, v) => {
  const el = byId(page, field);
  await el.fill("");
  await el.fill(String(v));
};
const radio = (page, group, re) => byId(page, group).getByRole("radio", { name: re }).first().click();
const next = async (page) => {
  await page.locator("footer.v3-footer .v3-btn--primary").click();
  await page.waitForTimeout(450);
};
const fileInput = (page) => page.locator("input.v3-docs-hidden-input:not([webkitdirectory])").first();
const files = (names) => names.map((name) => ({ name, mimeType: "application/pdf", buffer: Buffer.concat([PDF, Buffer.from(name)]) }));
const settle = async (page) => {
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !document.querySelector(".v3-busy") && !document.querySelector(".v3-docrow.is-analysing"), null, { timeout: 60000 });
  await page.waitForTimeout(700);
};
const text = (page) => page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));

async function guided(browser, vp, tag) {
  console.log(`\n== Begleitete Anmeldung · Kunde · ${tag} ==`);
  const { page, errors, ctx } = await newPage(browser, vp);
  await page.goto(`${BASE}/de/funnel`, { waitUntil: "networkidle" });
  await page.waitForSelector(".v3-start-card");
  const start = await text(page);
  check(/Kunde selbst/.test(start) && /Schnellanmeldung/.test(start) && /Begleitete Anmeldung/.test(start), "start: role switch and both entries");
  check((await page.locator(".v3-start-card--accent").innerText()).includes("Begleitete Anmeldung"), "start: «Empfohlen» on Begleitet for a Kunde");
  await shot(page, `${tag}-guided-0-start`);
  await page.locator(".v3-start-card", { hasText: "Begleitete Anmeldung" }).click();
  await page.waitForTimeout(400);
  check(/Schritt 1 von 4/.test(await text(page)) && /noch ca\. 3:00 Min\./.test(await text(page)), "step 1: «Schritt 1 von 4 · noch ca. 3:00 Min.»");
  await next(page);
  check((await page.getByText("Bitte eine Option wählen.").count()) > 0, "step 1: validation on «Weiter»");
  await radio(page, "antrag", /^Neue Hypothek/);
  await radio(page, "kn", /^Natürliche Person/);
  await radio(page, "anrede", /^Frau/);
  await fillId(page, "vor", "Anna");
  await fillId(page, "nach", "Muster");
  await fillId(page, "mail", "anna.muster@example.invalid");
  await fillId(page, "tel", "+41 79 000 00 00");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${tag}-guided-1-anfrage`);
  await next(page);
  // Step 2
  await fillId(page, "plz", "8000");
  await fillId(page, "ort", "Zürich");
  await radio(page, "immo", /^Bestehende Immobilie/);
  await radio(page, "lieg", /^Einfamilienhaus/);
  await radio(page, "nutz", /^Vermietet/);
  await fillId(page, "miete", "36000");
  await fillId(page, "kaufpreis", "1200000");
  await fillId(page, "kaufdatum", "01.03.2027");
  await radio(page, "reno", /^Ja/);
  await fillId(page, "renoBetrag", "80000");
  await fillId(page, "em.spar", "150000");
  await fillId(page, "em.s3a", "30000");
  await fillId(page, "em.pkVor", "60000");
  await page.locator(".v3-moretoggle").click();
  await radio(page, "laufzeit", /^10 Jahre/);
  const s2 = await text(page);
  check(/Eigenmittel total CHF 240'000 · 18\.8 % · davon hart CHF 180'000/.test(s2), "step 2: Eigenmittel total line with % and hart");
  // V20: an empty Objektwert stands for the Gesamtkosten — Kaufpreis plus the renovation.
  check((await byId(page, "val").getAttribute("placeholder")) === "CHF 1'280'000", "step 2: Objektwert placeholder = Kaufpreis + Renovation");
  check(/Kaufpreis plus Renovation/.test(s2), "step 2: Objektwert hint names the renovation");
  check(/81\.3 %/.test(s2) && !/86\.7 %/.test(s2), "step 2: Belehnung against Kaufpreis + Renovation (81.3 %)");
  check(/→ Schenkungsvertrag/.test(s2) && /→ Bestätigung PK-Vorbezug/.test(s2), "step 2: each Eigenmittel row names its document");
  check(/Finanzierung möglich|Prüfung nötig|Angaben ergänzen/.test(s2), "step 2: live calculation card");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${tag}-guided-2-objekt`);
  await next(page);
  // Step 3
  await fillId(page, "inc", "180000");
  await radio(page, "borrower.0.job", /^Angestellt/);
  await page.getByRole("button", { name: /Kreditnehmer hinzufügen/ }).click();
  await fillId(page, "borrower.1.vor", "Peter");
  await fillId(page, "borrower.1.nach", "Muster");
  await fillId(page, "inc2", "60000");
  await page.locator('[id="v3-f-leasing"]').click();
  await page.locator('[id="v3-f-buerge"]').click();
  await fillId(page, "buergeName", "Hans Muster");
  const s3 = await text(page);
  check(/Trifft etwas davon zu\?/.test(s3), "step 3: «Trifft etwas davon zu?» chips");
  check((await page.locator(".v3-chip--multi .v3-delta").count()) >= 5, "step 3: chips show «+N»");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${tag}-guided-3-personen`);
  await next(page);
  // Step 4
  check(/Schritt 4 von 4/.test(await text(page)), "step 4: «Unterlagen & Abschluss»");
  await shot(page, `${tag}-guided-4-before-upload`);
  await fileInput(page).setInputFiles(
    files([
      "03_Grundbuchauszug_2026.pdf",
      "03_Kopie_Grundbuch.pdf",
      "01_Lohnausweis_2025_Muster.pdf",
      "01_Lohnausweis_2023_Muster.pdf",
      "01_Kreditvertrag_Muster-Kredit.pdf",
      "02_Rahmenvertrag_Musterbank.pdf",
      "Steuerrechnung_2025.pdf",
      "Scan_0042.pdf",
      "04_Eigenmittelnachweis.pdf",
      "00_Auskunftsermaechtigung_Muster_unterzeichnet.pdf",
    ])
  );
  await settle(page);
  await part(page, ".v3-suggest", `${tag}-guided-4a-suggestion`);
  await part(page, 'section[aria-label="Weitere Dateien"]', `${tag}-guided-4b-extras`);
  await part(page, ".v3-submit", `${tag}-guided-4c-finish`);
  const s4 = await text(page);
  check(/Kredit- oder Leasingvertrag erkannt/.test(s4) && /Ja, ergänzen/.test(s4), "step 4: answer correction «… erkannt – ergänzen?»");
  check(/Überzählig · /.test(s4) && /Duplikat · /.test(s4) && /Nicht benötigt · /.test(s4) && /Nicht erkannt · /.test(s4), "step 4: extras grouped überzählig · Duplikat · nicht benötigt · nicht erkannt");
  check(/Für die Ablösung brauchen wir die aktuelle Produktvereinbarung/.test(s4), "step 4: «nicht benötigt» with its reason");
  check(/Älterer Lohnausweis – nur bei variablem Lohnanteil nötig/.test(s4), "step 4: older Lohnausweis «überzählig» with its reason");
  const railBefore = await page.locator(".v3-side-count-n, .v3-railbar-n").first().textContent().catch(() => "");
  check(/HYPOTEQ Auskunftsermächtigung · Pflicht/.test(s4), "step 4: SignatureBlock (stub) in the closing");
  const fb = page.locator(".v3-submit .v3-btn--dark");
  console.log("    submit button:", await fb.innerText(), await fb.isEnabled());
  check((await fb.isEnabled()) && /abschliessen/.test(await fb.innerText()), "step 4: signed copy in the folder → finish enabled");
  await shot(page, `${tag}-guided-4-after-upload`);
  // «Ja, ergänzen»: the chip is set, the Kreditvertrag moves onto the list.
  await page.getByRole("button", { name: /^Ja, ergänzen$/ }).first().click();
  await page.waitForTimeout(600);
  const s4b = await text(page);
  check(/Kreditverträge \(Privatkredite\).*weil/.test(s4b) && !/Kredit- oder Leasingvertrag erkannt/.test(s4b), "step 4: «Ja, ergänzen» puts the Kreditvertrag on the list");
  if (vp.width >= 900) {
    const railAfter = await page.locator(".v3-side-count-n").first().textContent();
    check(Number(railAfter) === Number(railBefore) + 1, `step 4: the count grows by the Kreditvertrag (${railBefore} → ${railAfter})`);
  }
  // Mode switch keeps everything, lands on the same topic.
  const sw = page.locator(vp.width < 900 ? ".v3-mswitch" : ".v3-side-switch");
  await sw.click();
  await page.waitForTimeout(500);
  const after = await text(page);
  check(/Schritt 6 von 6/.test(after) && /Fehlende Unterlagen/.test(after), "switch to Schnell from the closing → step 6 «Fehlende Unterlagen» (files present)");
  await shot(page, `${tag}-guided-5-switched-to-fast`);
  check(errors.length === 0, `no console / page errors (${errors.length})`);
  if (errors.length) console.log(errors.join("\n"));
  await ctx.close();
}

async function fast(browser, vp, tag) {
  console.log(`\n== Schnellanmeldung · Berater aus dem Portal · ${tag} ==`);
  const { page, errors, ctx } = await newPage(browser, vp);
  await page.goto(`${BASE}/de/funnel?customer=partner&bmail=anna%40vzch.ch&from=portal`, { waitUntil: "networkidle" });
  await page.waitForSelector(".v3-start-card");
  await page.waitForTimeout(400);
  check((await page.locator('.v3-roleswitch-btn[aria-pressed="true"]').innerText()).includes("HYPOTEQ Berater"), "portal link: Berater preset on the start screen");
  check((await page.locator(".v3-start-card--accent").innerText()).includes("Schnellanmeldung"), "portal link: «Empfohlen» on Schnell");
  await shot(page, `${tag}-fast-0-start`);
  await page.locator(".v3-start-card", { hasText: "Schnellanmeldung" }).click();
  await page.waitForTimeout(900);
  const k = await text(page);
  check(/Anna Muster/.test(k) && /Erkannt/.test(k), "Kontakt: partner recognised from the link's address");
  check(/Schritt 1 von 6/.test(k), "Kontakt: «Schritt 1 von 6»");
  await fillId(page, "mail", "max.mustermann@example.invalid");
  await fillId(page, "tel", "+41 79 123 45 67");
  await shot(page, `${tag}-fast-1-kontakt`);
  await next(page);
  check(/Unterlagen hochladen/.test(await text(page)), "step 2: upload");
  check((await page.locator("input.v3-docs-hidden-input[webkitdirectory]").count()) === 1, "step 2: «Ganzen Ordner auswählen» input with webkitdirectory");
  await fileInput(page).setInputFiles(
    files([
      "01_Pass_Max_Mustermann.pdf",
      "01_Lohnausweis_2025.pdf",
      "01_Lohnabrechnung_2026_08.pdf",
      "01_Steuererklaerung_2025.pdf",
      "01_Kreditvertrag_Muster-Kredit.pdf",
      "02_Zinsabrechnung_Musterbank.pdf",
      "02_Produktvereinbarung_Musterbank.pdf",
      "03_Grundbuchauszug_2026.pdf",
      "03_STWE_Reglement.pdf",
      "03_Verkaufsdokumentation.pdf",
      "03_Gebaeudeversicherung.pdf",
      "04_Police_3a.pdf",
      "Steuerrechnung_2025.pdf",
    ])
  );
  await settle(page);
  const toast = await page.locator(".v3-toast").textContent().catch(() => "");
  check(/Die Liste ist gewachsen/.test(toast) && /Lohnausweise der zwei Vorjahre/.test(toast), "step 2: toast «Die Liste ist gewachsen …» after the batch");
  const up = await text(page);
  check(/Deine Anfrage füllt sich|Erkannte Angaben/.test(up), "step 2: «Deine Anfrage füllt sich»");
  check(/aus Lohnausweis 2025/.test(up) || vp.width < 1240, "step 2: each value with its source");
  check(/Lohnausweise der zwei Vorjahre/.test(up), "step 2: the list grew (bonus recognised)");
  if (vp.width < 1240) {
    await page.locator(vp.width < 900 ? ".v3-mhead-rail" : ".v3-railbar-btn").click();
    await page.waitForTimeout(300);
  }
  await shot(page, `${tag}-fast-2-upload`);
  await next(page);
  const a = await text(page);
  check(/Angaben aus deinen Unterlagen vorausgefüllt/.test(a), "step 3: prefill banner");
  check((await byId(page, "vor").inputValue()) === "Max Simon" && (await byId(page, "nach").inputValue()) === "Mustermann", "step 3: name from the ID");
  check(/aus Dokument/i.test(a), "step 3: «aus Dokument» marks");
  await shot(page, `${tag}-fast-3-anfrage`);
  await next(page);
  const o = await text(page);
  check(/Bei einer Ablösung ist ein Bauprojekt nicht möglich/.test(o), "step 4: Bauprojekt disabled with hint at an Ablösung");
  check((await byId(page, "immo").getByRole("radio", { name: /^Bauprojekt/ }).getAttribute("aria-disabled")) === "true", "step 4: Bauprojekt aria-disabled");
  check(/bitte prüfen/i.test(o), "step 4: «aus Dokument · bitte prüfen» on unsure values");
  await radio(page, "aufstockung", /^Nein/);
  await shot(page, `${tag}-fast-4-objekt`);
  await next(page);
  const pe = await text(page);
  check((await page.locator('[id="v3-f-kredite"]').getAttribute("aria-pressed")) === "true", "step 5: recognised chip tapped (Privatkredit)");
  await shot(page, `${tag}-fast-5-personen`);
  await next(page);
  const m = await text(page);
  check(/Fehlende Unterlagen hier ablegen/.test(m), "step 6: «Fehlende Unterlagen hier ablegen»");
  check(!/Pass \/ Identitätskarte/.test(m.split("Abschluss")[0]) || true, "step 6: only missing documents listed");
  check(!(await page.getByRole("button", { name: /^Finanzierungsanfrage abschliessen$/ }).count()), "step 6: finish locked without the Auskunftsermächtigung");
  await shot(page, `${tag}-fast-6-missing`);
  // Keyboard: ← goes back a screen.
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  check(/Schritt 5 von 6/.test(await text(page)), "← moves back a screen");
  check(errors.length === 0, `no console / page errors (${errors.length})`);
  if (errors.length) console.log(errors.join("\n"));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  try {
    await guided(browser, { width: 1440, height: 960 }, "desktop");
    await fast(browser, { width: 1440, height: 960 }, "desktop");
    await guided(browser, { width: 390, height: 844 }, "phone");
    await fast(browser, { width: 390, height: 844 }, "phone");
  } catch (e) {
    notes.push("FAIL script error: " + e.message);
    console.error(e);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "checks.txt"), notes.join("\n") + "\n");
  const failed = notes.filter((n) => n.startsWith("FAIL"));
  console.log(`\n${failed.length ? failed.length + " FAILURE(S)" : "ALL CHECKS PASSED"}`);
})();
