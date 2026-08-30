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

export function buildPdf(lines: string[]): Buffer {
  const leading = 18;
  const top = 780;

  const content =
    "BT\n/F1 11 Tf\n" +
    `${leading} TL\n` +
    `56 ${top} Td\n` +
    lines.map((l) => `(${escapeText(l)}) Tj T*`).join("\n") +
    "\nET\n";

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
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

/** Fixtures shaped like the real Swiss documents, with invented people and numbers. */
export const FIXTURES: Record<string, { file: string; lines: string[] }> = {
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
};
