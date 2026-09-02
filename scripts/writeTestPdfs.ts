/**
 * Writes the test fixtures out as real PDF files, for uploading through the funnel by hand.
 *
 *   npx tsx scripts/writeTestPdfs.ts
 *
 * Calls nothing and costs nothing: it only writes files. The documents are invented, so they
 * can be uploaded to a preview deployment without putting a real person's paperwork through
 * an AI provider — which is the reason this exists rather than "just use a real dossier".
 *
 * The filenames are deliberately unhelpful (IMG_4829.pdf, scan_0431.pdf, Unterlagen.pdf).
 * Section 9 is that the customer should not have to say what a file is, so a fixture named
 * Lohnausweis_2025.pdf would test the wrong thing — the model is given the name as an
 * explicitly unreliable hint, and a set of honest names would hide a classifier that leans
 * on it. INDEX.md is written alongside so the person testing still knows which is which.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { buildPdfPages, FIXTURES, grundbuchauszugAktuell, type Fixture } from "./makeTestPdf";

const OUT = join(process.cwd(), "test-documents");

/** What each file is, and what the funnel should make of it. */
const NOTES: Record<string, { was: string; expect: string }> = {
  identitaetskarte_max: {
    was: "Identitaetskarte Max Muster",
    expect: "erkannt, Person = Kreditnehmer 1",
  },
  identitaetskarte_anna: {
    was: "Identitaetskarte Anna Muster",
    expect: "erkannt, Person = Kreditnehmer 2 (Abschnitt 24)",
  },
  lohnausweis: {
    was: "Lohnausweis 2025 Max, Bruttolohn CHF 142'300",
    expect: "erkannt; Abweichung, wenn im Funnel CHF 150'000 erfasst wurde (Abschnitt 16)",
  },
  lohnausweis_anna: {
    was: "Lohnausweis 2025 Anna, Bruttolohn CHF 96'500",
    expect: "erkannt, anderer Arbeitgeber, Person = Kreditnehmer 2",
  },
  lohnabrechnung_juli: { was: "Lohnabrechnung Juli 2026", expect: "erkannt, Periode Juli 2026" },
  lohnabrechnung_juni: { was: "Lohnabrechnung Juni 2026", expect: "erkannt, Periode Juni 2026" },
  lohnabrechnung_mai_anderer_arbeitgeber: {
    was: "Lohnabrechnung Mai 2026, Arbeitgeber Example AG statt Muster Handels AG",
    expect: "erkannt und NICHT bemaengelt - Cross-Document-Pruefung ist Abschnitt 18, spaeter",
  },
  steuererklaerung: {
    was: "Steuererklaerung 2025, 2 Seiten - die Zahlen stehen auf Seite 2",
    expect: "steuerbares Einkommen CHF 214'900 gefunden (Abschnitt 23)",
  },
  eigenmittelnachweis: {
    was: "Eigenmittelnachweis, Total CHF 285'000 liquide",
    expect: "erkannt; Abweichung gegen die Eigenmittel im Funnel",
  },
  kaufvertrag: {
    was: "Kaufvertrag, 3 Seiten - der Kaufpreis steht auf Seite 2",
    expect: "Kaufpreis CHF 1'150'000 und Objektadresse gefunden",
  },
  grundbuchauszug: {
    was: "Grundbuchauszug vom 15.01.2024",
    expect: "Status 'outdated' - aelter als 6 Monate (Abschnitt 25)",
  },
  grundbuchauszug_aktuell: {
    was: "Grundbuchauszug, vor 45 Tagen ausgestellt",
    expect: "erkannt, kein Aktualitaetshinweis",
  },
  pensionskassenausweis: {
    was: "Vorsorgeausweis, Freizuegigkeitsleistung CHF 218'450",
    expect: "erkannt",
  },
  hypothekarvertrag: {
    was: "Hypothekarvertrag CHF 620'000, Ablauf 30.09.2027",
    expect: "erkannt; nur relevant, wenn der Funnel eine Abloesung erfasst",
  },
  auskunftsermaechtigung: {
    was: "HYPOTEQ-Formular mit Unterschrift und Datum",
    expect: "erkannt, Unterschrift vorhanden (Abschnitt 26)",
  },
  stromrechnung: {
    was: "Stromrechnung - kein Finanzierungsdokument",
    expect: "nicht erkannt, manuelle Auswahl wird angeboten (Abschnitte 20/21)",
  },
};

function write(key: string, fx: Fixture): { key: string; file: string; pages: number; bytes: number } {
  const pages = fx.pages ?? [fx.lines];
  const pdf = buildPdfPages(pages);
  writeFileSync(join(OUT, fx.file), pdf);
  return { key, file: fx.file, pages: pages.length, bytes: pdf.length };
}

mkdirSync(OUT, { recursive: true });

const all: Array<[string, Fixture]> = [
  ...Object.entries(FIXTURES),
  ["grundbuchauszug_aktuell", grundbuchauszugAktuell()],
];

const written = all.map(([key, fx]) => write(key, fx));

const index = [
  "# Test-Dokumente",
  "",
  "Erfundene Dokumente eines einzigen Falls: Max und Anna Muster kaufen die Seestrasse 118",
  "in Zuerich fuer CHF 1'150'000. Enthaelt keine echten Personendaten.",
  "",
  "Erzeugt mit `npx tsx scripts/writeTestPdfs.ts`. Die Dateinamen sind absichtlich",
  "nichtssagend - genau so laden Kundinnen und Kunden ihre Unterlagen hoch.",
  "",
  "| Datei | Inhalt | Erwartetes Verhalten |",
  "| --- | --- | --- |",
  ...written.map((w) => {
    const n = NOTES[w.key] ?? { was: w.key, expect: "-" };
    const pages = w.pages > 1 ? ` (${w.pages} Seiten)` : "";
    return `| \`${w.file}\` | ${n.was}${pages} | ${n.expect} |`;
  }),
  "",
  "## Vorschlag fuer einen Durchlauf",
  "",
  "Im Funnel als Jahreseinkommen **CHF 150'000** und als Kaufpreis **CHF 1'150'000**",
  "erfassen. Dann zeigt der Lohnausweis die Abweichung aus Abschnitt 16 (CHF 142'300 gegen",
  "CHF 150'000), waehrend der Kaufvertrag uebereinstimmt - so ist auf einen Blick zu sehen,",
  "dass gemeldete Abweichungen echte Abweichungen sind und nicht Rauschen.",
  "",
].join("\n");

writeFileSync(join(OUT, "INDEX.md"), index, "utf8");

console.log(`${written.length} PDFs -> ${OUT}\n`);
for (const w of written) {
  console.log(`  ${w.file.padEnd(30)} ${String(w.pages).padStart(2)} Seite(n)  ${String(w.bytes).padStart(5)} B`);
}
console.log(`\n  INDEX.md`);
