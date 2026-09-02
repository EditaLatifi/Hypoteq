/**
 * Minimal PDF writer for test fixtures.
 *
 * Hand-rolled rather than pulled from a library: this exists only so the Document
 * Intelligence pipeline can be exercised without real customer paperwork, and a dependency
 * that ships in the production bundle for that would be a poor trade.
 *
 * The cross-reference table is written with real byte offsets — a PDF with a broken xref is
 * accepted by some readers and rejected by others, which would make a test failure
 * ambiguous between "the model could not read it" and "the file was malformed".
 */

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pageContent(lines: string[]): string {
  const leading = 18;
  const top = 780;
  return (
    "BT\n/F1 11 Tf\n" +
    `${leading} TL\n` +
    `56 ${top} Td\n` +
    lines.map((l) => `(${escapeText(l)}) Tj T*`).join("\n") +
    "\nET\n"
  );
}

/**
 * A document of several pages, as one file.
 *
 * Worth having as its own function rather than a flag: spec section 23 says a multi-page
 * document must be read as one document and the model must not stop at the first page, and
 * that is not testable with a fixture that only ever has one. The tax return fixture below
 * puts its key figures on page two for exactly this reason.
 */
export function buildPdfPages(pages: string[][]): Buffer {
  const n = pages.length;
  // Object numbers are 1-based and referenced by number inside the file, so they are worked
  // out up front: catalog, page tree, one object per page, one content stream per page, font.
  const firstPageObj = 3;
  const firstContentObj = firstPageObj + n;
  const fontObj = firstContentObj + n;

  const contents = pages.map(pageContent);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPageObj + i} 0 R`).join(" ")}] /Count ${n} >>`,
    ...pages.map(
      (_, i) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${firstContentObj + i} 0 R >>`
    ),
    ...contents.map(
      (c) => `<< /Length ${Buffer.byteLength(c, "latin1")} >>\nstream\n${c}\nendstream`
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

export function buildPdf(lines: string[]): Buffer {
  return buildPdfPages([lines]);
}

export interface Fixture {
  /** The name a customer's file would actually have — section 9: never a helpful one. */
  file: string;
  lines: string[];
  /** Set instead of relying on `lines` when the document must span pages (section 23). */
  pages?: string[][];
}

/** Fixtures shaped like the real Swiss documents, with invented people and numbers. */
export const FIXTURES: Record<string, Fixture> = {
  lohnausweis: {
    file: "IMG_4829.pdf",
    lines: [
      "Lohnausweis / Rentenbescheinigung",
      "Kalenderjahr 2025",
      "",
      "A  Personalien des Arbeitnehmers",
      "Name, Vorname:            Muster, Max",
      "Adresse:                  Bahnhofstrasse 12, 8001 Zuerich",
      "AHV-Nummer:               756.1234.5678.97",
      "",
      "B  Arbeitgeber",
      "Firma:                    Muster Handels AG",
      "Adresse:                  Industriestrasse 4, 8005 Zuerich",
      "",
      "C  Lohnangaben",
      "1. Lohn:                  CHF 142'300.00",
      "3. Unregelmaessige Leistungen (Bonus):  CHF 18'000.00",
      "8. Nettolohn:             CHF 119'400.00",
      "11. Massgebender Lohn AHV: CHF 160'300.00",
      "",
      "Beschaeftigungszeitraum:  01.01.2025 - 31.12.2025",
      "",
      "Ort und Datum: Zuerich, 31.12.2025",
    ],
  },
  grundbuchauszug: {
    file: "scan_002.pdf",
    lines: [
      "Grundbuchamt Zuerich-Altstadt",
      "GRUNDBUCHAUSZUG",
      "",
      "Grundstueck Nr.:          482",
      "Gemeinde:                 Zuerich",
      "Plan / Parzelle:          Parzelle 482",
      "Grundstuecksflaeche:      623 m2",
      "",
      "Eigentum",
      "Muster, Max, geb. 14.03.1985, Alleineigentum",
      "",
      "Dienstbarkeiten",
      "Fuss- und Fahrwegrecht zulasten Nr. 483",
      "",
      "Grundpfandrechte",
      "Namen-Schuldbrief CHF 450'000.00, 1. Rang",
      "",
      "Ausstellungsdatum:        15.01.2024",
    ],
  },
  stromrechnung: {
    // Section 20: something perfectly ordinary that is not one of the requested types.
    file: "document_2026.pdf",
    lines: [
      "Elektrizitaetswerk der Stadt Zuerich",
      "RECHNUNG",
      "",
      "Rechnungsnummer:          RG-2026-884213",
      "Kunde:                    Max Muster, Bahnhofstrasse 12, 8001 Zuerich",
      "Abrechnungsperiode:       01.01.2026 - 31.03.2026",
      "",
      "Verbrauch Hochtarif:      412 kWh",
      "Verbrauch Niedertarif:    268 kWh",
      "",
      "Total inkl. MWST:         CHF 184.55",
      "Zahlbar bis:              30.04.2026",
    ],
  },

  /* ------------------------------------------------------------------------------------
   * One coherent case, so the fixtures can be tested together and not only one at a time:
   * Max and Anna Muster buying Seestrasse 118 in Zuerich for CHF 1'150'000.
   *
   * The figures are chosen to exercise the comparison rather than to agree with everything.
   * The Lohnausweis says CHF 142'300 against the CHF 150'000 a tester is meant to type into
   * the funnel — the worked example in section 16 — and the payslips are consistent with the
   * certificate, so a run that flags them is flagging noise.
   * ---------------------------------------------------------------------------------- */

  identitaetskarte_max: {
    file: "IMG_8834.pdf",
    lines: [
      "SCHWEIZERISCHE EIDGENOSSENSCHAFT",
      "IDENTITAETSKARTE / CARTE D'IDENTITE",
      "",
      "Name:                     Muster",
      "Vorname:                  Max",
      "Geburtsdatum:             14.03.1985",
      "Geschlecht:               M",
      "Nationalitaet:            CH",
      "Heimatort:                Zuerich ZH",
      "Dokumentnummer:           C1234567",
      "Ausstellungsdatum:        21.06.2022",
      "Gueltig bis:              20.06.2032",
      "Behoerde:                 Kreisbuero 4, Stadt Zuerich",
    ],
  },

  identitaetskarte_anna: {
    file: "IMG_8835.pdf",
    lines: [
      "SCHWEIZERISCHE EIDGENOSSENSCHAFT",
      "IDENTITAETSKARTE / CARTE D'IDENTITE",
      "",
      "Name:                     Muster",
      "Vorname:                  Anna",
      "Geburtsdatum:             02.09.1987",
      "Geschlecht:               F",
      "Nationalitaet:            CH",
      "Heimatort:                Winterthur ZH",
      "Dokumentnummer:           C7654321",
      "Ausstellungsdatum:        09.02.2023",
      "Gueltig bis:              08.02.2033",
      "Behoerde:                 Kreisbuero 4, Stadt Zuerich",
    ],
  },

  // Section 24: a second borrower's certificate, so person assignment has something to get
  // right. Nothing on it names Max, and nothing on Max's names Anna.
  lohnausweis_anna: {
    file: "IMG_4830.pdf",
    lines: [
      "Lohnausweis / Rentenbescheinigung",
      "Kalenderjahr 2025",
      "",
      "A  Personalien des Arbeitnehmers",
      "Name, Vorname:            Muster, Anna",
      "Adresse:                  Bahnhofstrasse 12, 8001 Zuerich",
      "AHV-Nummer:               756.8765.4321.19",
      "",
      "B  Arbeitgeber",
      "Firma:                    Kantonsspital Winterthur",
      "Adresse:                  Brauerstrasse 15, 8400 Winterthur",
      "",
      "C  Lohnangaben",
      "1. Lohn:                  CHF 96'500.00",
      "3. Unregelmaessige Leistungen (Bonus):  CHF 0.00",
      "8. Nettolohn:             CHF 83'120.00",
      "11. Massgebender Lohn AHV: CHF 96'500.00",
      "",
      "Beschaeftigungszeitraum:  01.01.2025 - 31.12.2025",
      "Beschaeftigungsgrad:      80 %",
      "",
      "Ort und Datum: Winterthur, 31.12.2025",
    ],
  },

  lohnabrechnung_juli: {
    file: "scan_0431.pdf",
    lines: [
      "Muster Handels AG, Industriestrasse 4, 8005 Zuerich",
      "LOHNABRECHNUNG",
      "",
      "Mitarbeiter:              Muster, Max",
      "Personalnummer:           4417",
      "Abrechnungsperiode:       Juli 2026",
      "Beschaeftigungsgrad:      100 %",
      "",
      "Monatslohn brutto:        CHF 11'858.35",
      "Kinderzulage:             CHF 200.00",
      "Spesenpauschale:          CHF 250.00",
      "",
      "Abzuege AHV/IV/EO:        CHF 628.50",
      "Abzuege ALV:              CHF 130.45",
      "Abzuege BVG:              CHF 892.30",
      "",
      "Nettolohn:                CHF 10'657.10",
      "Auszahlung per:           25.07.2026",
    ],
  },

  lohnabrechnung_juni: {
    file: "scan_0432.pdf",
    lines: [
      "Muster Handels AG, Industriestrasse 4, 8005 Zuerich",
      "LOHNABRECHNUNG",
      "",
      "Mitarbeiter:              Muster, Max",
      "Personalnummer:           4417",
      "Abrechnungsperiode:       Juni 2026",
      "Beschaeftigungsgrad:      100 %",
      "",
      "Monatslohn brutto:        CHF 11'858.35",
      "Kinderzulage:             CHF 200.00",
      "Spesenpauschale:          CHF 250.00",
      "",
      "Abzuege AHV/IV/EO:        CHF 628.50",
      "Abzuege ALV:              CHF 130.45",
      "Abzuege BVG:              CHF 892.30",
      "",
      "Nettolohn:                CHF 10'657.10",
      "Auszahlung per:           25.06.2026",
    ],
  },

  // The employer here is NOT Muster Handels AG. Section 18's own example: the certificate
  // and the current payslip disagree about where the borrower works. Cross-document checks
  // are a later stage, so today this should classify cleanly and NOT be flagged — a fixture
  // for the feature that does not exist yet, kept so the day it does there is a case ready.
  lohnabrechnung_mai_anderer_arbeitgeber: {
    file: "scan_0433.pdf",
    lines: [
      "Example AG, Seefeldstrasse 200, 8008 Zuerich",
      "LOHNABRECHNUNG",
      "",
      "Mitarbeiter:              Muster, Max",
      "Personalnummer:           118",
      "Abrechnungsperiode:       Mai 2026",
      "Beschaeftigungsgrad:      100 %",
      "",
      "Monatslohn brutto:        CHF 11'858.35",
      "Spesenpauschale:          CHF 250.00",
      "",
      "Nettolohn:                CHF 10'480.55",
      "Auszahlung per:           25.05.2026",
    ],
  },

  eigenmittelnachweis: {
    file: "dokument_2.pdf",
    lines: [
      "Zuercher Kantonalbank",
      "AUFSTELLUNG UND NACHWEIS DER EIGENMITTEL",
      "",
      "Kunde:                    Max und Anna Muster",
      "Stichtag:                 30.06.2026",
      "",
      "Kontokorrent CHF 1234.5678:        CHF  84'200.00",
      "Sparkonto CHF 1234.9012:           CHF 126'800.00",
      "Wertschriftendepot:                CHF  34'000.00",
      "Saeule 3a (ZKB Vorsorgekonto):     CHF  40'000.00",
      "",
      "Total liquide Mittel und Wertschriften:  CHF 285'000.00",
      "",
      "Zusaetzlich vorgesehen:",
      "Verpfaendung Pensionskasse:        CHF  60'000.00",
      "Schenkung Eltern (Zusage):         CHF  50'000.00",
      "",
      "Total Eigenmittel:                 CHF 395'000.00",
    ],
  },

  pensionskassenausweis: {
    file: "PK_2026.pdf",
    lines: [
      "Pensionskasse der Muster Handels AG",
      "VORSORGEAUSWEIS",
      "",
      "Versicherte Person:       Muster, Max",
      "Geburtsdatum:             14.03.1985",
      "Vorsorgeeinrichtung:      PK Muster Handels AG, Zuerich",
      "Stand per:                01.01.2026",
      "",
      "Versicherter Jahreslohn:  CHF 142'300.00",
      "Altersguthaben (FZL):     CHF 218'450.00",
      "Bisheriger WEF-Vorbezug:  CHF 0.00",
      "Moeglicher Vorbezug:      CHF 218'450.00",
      "",
      "Voraussichtliche Altersrente mit 65:  CHF 46'200.00 pro Jahr",
    ],
  },

  hypothekarvertrag: {
    file: "hypo_alt.pdf",
    lines: [
      "Zuercher Kantonalbank",
      "HYPOTHEKARVERTRAG",
      "",
      "Kreditnehmer:             Max Muster, Bahnhofstrasse 12, 8001 Zuerich",
      "Objekt:                   Seestrasse 118, 8038 Zuerich",
      "",
      "Hypothekarbetrag:         CHF 620'000.00",
      "Produkt:                  Festhypothek",
      "Zinssatz:                 1.85 % p.a.",
      "Laufzeit:                 5 Jahre",
      "Beginn:                   01.10.2022",
      "Ablaufdatum:              30.09.2027",
      "Amortisation:             CHF 8'000.00 pro Jahr, indirekt ueber Saeule 3a",
      "Kuendigungsfrist:         6 Monate vor Ablauf",
    ],
  },

  auskunftsermaechtigung: {
    file: "formular_unterschrieben.pdf",
    lines: [
      "HYPOTEQ AG",
      "AUSKUNFTSERMAECHTIGUNG",
      "",
      "Hiermit ermaechtige ich die HYPOTEQ AG, bei Banken, Versicherungen und",
      "Vorsorgeeinrichtungen Auskuenfte einzuholen, soweit dies fuer die Pruefung",
      "meiner Finanzierungsanfrage erforderlich ist.",
      "",
      "Name, Vorname:            Muster, Max",
      "Adresse:                  Bahnhofstrasse 12, 8001 Zuerich",
      "Geburtsdatum:             14.03.1985",
      "",
      "Ort und Datum:            Zuerich, 12.08.2026",
      "",
      "Unterschrift:             M. Muster",
      "                          ______________________",
    ],
  },
};

/* ========================================================================================
 * Multi-page fixtures (section 23).
 *
 * Written separately because the point of each is what is NOT on page one: a model that
 * stops at the first page finds the header and none of the numbers, which is the failure
 * section 23 exists to catch. `lines` holds the whole document for callers that want one
 * page; `pages` is the split that actually tests the rule.
 * ===================================================================================== */

const STEUERERKLAERUNG_P1 = [
  "Kanton Zuerich",
  "STEUERERKLAERUNG 2025",
  "Natuerliche Personen",
  "",
  "Steuerpflichtige:         Muster, Max und Anna",
  "Adresse:                  Bahnhofstrasse 12, 8001 Zuerich",
  "Gemeinde:                 Zuerich",
  "Zivilstand:               verheiratet",
  "",
  "Beilagen: Lohnausweise, Bescheinigung Saeule 3a, Wertschriftenverzeichnis",
  "",
  "(Die Zusammenstellung der Faktoren finden Sie auf Seite 2.)",
];

const STEUERERKLAERUNG_P2 = [
  "STEUERERKLAERUNG 2025 - Seite 2",
  "Zusammenstellung der Faktoren",
  "",
  "Einkuenfte",
  "Ziffer 1  Einkuenfte aus unselbstaendiger Erwerbstaetigkeit: CHF 238'800.00",
  "Ziffer 4  Wertschriftenertrag:                               CHF   1'240.00",
  "",
  "Abzuege",
  "Ziffer 15 Berufsauslagen:                                    CHF   6'200.00",
  "Ziffer 18 Saeule 3a:                                         CHF   7'056.00",
  "",
  "Steuerbares Einkommen:                                       CHF 214'900.00",
  "",
  "Vermoegen",
  "Wertschriften und Guthaben:                                  CHF 245'040.00",
  "Total Schulden:                                              CHF  12'000.00",
  "Steuerbares Vermoegen:                                       CHF 233'040.00",
  "",
  "Steuerjahr: 2025    Kanton: Zuerich",
];

const KAUFVERTRAG_P1 = [
  "Notariat Zuerich-Enge",
  "OEFFENTLICHE URKUNDE",
  "KAUFVERTRAG",
  "",
  "Verkaeufer:",
  "Brunner, Peter, geb. 07.11.1958",
  "Alte Landstrasse 44, 8802 Kilchberg",
  "",
  "Kaeufer:",
  "Muster, Max, geb. 14.03.1985",
  "Muster, Anna, geb. 02.09.1987",
  "Bahnhofstrasse 12, 8001 Zuerich",
  "je zu 1/2 Miteigentum",
];

const KAUFVERTRAG_P2 = [
  "KAUFVERTRAG - Seite 2",
  "",
  "I. Kaufobjekt",
  "Grundstueck Nr. 482, Gemeinde Zuerich",
  "Seestrasse 118, 8038 Zuerich",
  "Einfamilienhaus, Grundstuecksflaeche 623 m2",
  "",
  "II. Kaufpreis",
  "Der Kaufpreis betraegt CHF 1'150'000.00",
  "(eine Million einhundertfuenfzigtausend Schweizer Franken)",
  "",
  "III. Zahlungsbedingungen",
  "Anzahlung von CHF 115'000.00 bei Vertragsunterzeichnung.",
  "Restkaufpreis von CHF 1'035'000.00 zahlbar bis 30.11.2026.",
];

const KAUFVERTRAG_P3 = [
  "KAUFVERTRAG - Seite 3",
  "",
  "IV. Antritt und Nutzen",
  "Antritt, Nutzen und Gefahr gehen am 01.12.2026 auf die Kaeufer ueber.",
  "",
  "V. Grundbuchanmeldung",
  "Die Anmeldung erfolgt durch das beurkundende Notariat.",
  "",
  "Zuerich, 04.09.2026",
  "",
  "Verkaeufer: P. Brunner        Kaeufer: M. Muster / A. Muster",
  "Beurkundet: lic. iur. R. Steiner, Notar",
];

FIXTURES.steuererklaerung = {
  file: "dokument_1.pdf",
  lines: [...STEUERERKLAERUNG_P1, ...STEUERERKLAERUNG_P2],
  pages: [STEUERERKLAERUNG_P1, STEUERERKLAERUNG_P2],
};

FIXTURES.kaufvertrag = {
  file: "Unterlagen.pdf",
  lines: [...KAUFVERTRAG_P1, ...KAUFVERTRAG_P2, ...KAUFVERTRAG_P3],
  pages: [KAUFVERTRAG_P1, KAUFVERTRAG_P2, KAUFVERTRAG_P3],
};

/**
 * A land registry extract dated recently, as the counterpart to `grundbuchauszug`.
 *
 * The date is computed when the file is written rather than fixed, because the rule under
 * test is relative to today: a hard-coded "current" date turns into a stale fixture that
 * fails the freshness check months later and looks like a bug in the check.
 */
export function grundbuchauszugAktuell(now: Date = new Date()): Fixture {
  const issued = new Date(now);
  issued.setDate(issued.getDate() - 45);
  const dd = String(issued.getDate()).padStart(2, "0");
  const mm = String(issued.getMonth() + 1).padStart(2, "0");

  return {
    file: "scan_003.pdf",
    lines: [
      "Grundbuchamt Zuerich-Altstadt",
      "GRUNDBUCHAUSZUG",
      "",
      "Grundstueck Nr.:          482",
      "Gemeinde:                 Zuerich",
      "Plan / Parzelle:          Parzelle 482",
      "Grundstuecksflaeche:      623 m2",
      "Lage:                     Seestrasse 118, 8038 Zuerich",
      "",
      "Eigentum",
      "Brunner, Peter, geb. 07.11.1958, Alleineigentum",
      "",
      "Dienstbarkeiten",
      "Fuss- und Fahrwegrecht zulasten Nr. 483",
      "",
      "Grundpfandrechte",
      "Namen-Schuldbrief CHF 620'000.00, 1. Rang",
      "",
      `Ausstellungsdatum:        ${dd}.${mm}.${issued.getFullYear()}`,
    ],
  };
}
