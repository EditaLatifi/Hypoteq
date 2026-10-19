/**
 * Fall Mustermann as the closing step sees it: the answers of every screen and one analysed
 * file per requirement of the v5 list (20, the Auskunftsermächtigung included), plus the
 * «Weitere Dateien» of Handover 4.3 — among them what v5 no longer asks for (Schuldbrief,
 * Anstellungsvertrag without a Lohnerhöhung, Eigenmittelnachweis at an Ablösung, the older
 * Lohnausweise without a bonus).
 *
 * Made up: it has the shape of the handover's reference case (Ablösung mit Erhöhung, STWE,
 * Unterhalt, Privatkredit, Leasing, Säule 3a, an outdated Grundbuchauszug, a duplicate and
 * surplus files), but the person, address, employer, banks, amounts and file names are
 * fictional — no real customer data (HYPOTEQ 19.10., A.3).
 */
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { OLDER_SALARY_DE } from "@/lib/funnel-v3/placeFile";

export const SUBMISSION = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

export function mustermannState(over: Partial<FunnelState> = {}): FunnelState {
  return {
    role: "kunde",
    mode: "begleitet",
    ans: {
      ...DEFAULT_ANSWERS,
      antrag: "Ablösung",
      anrede: "Herr",
      immo: "Bestehende Immobilie",
      lieg: "Stockwerkeigentum",
      nutz: "Selbstbewohnt",
      aufstockung: "Ja",
      unterhalt: "Ja",
      kredite: "Ja",
      leasing: "Ja",
      laufzeit: "3 Jahre",
    },
    em: { ...EMPTY_EM, s3a: 8760 },
    info: {},
    src: {},
    touched: {},
    sig: null,
    borrowers: [{ id: "b1", vor: "Max", nach: "Mustermann", job: "Angestellt", pkSe: "Nein" }],
    txt: {
      ...EMPTY_TEXTS,
      vor: "Max",
      nach: "Mustermann",
      mail: "max.mustermann@example.ch",
      tel: "079 123 45 67",
      plz: "8000",
      ort: "Zürich",
      zweck: "Ablösung Privatkredit und Leasing, kleinere Renovationen",
    },
    fin: { ...EMPTY_AMOUNTS, old: 380000, up: 170000, inc: 110000, val: 1240000 },
    ...over,
  };
}

function analysis(docTypeId: string | null, over: Partial<V3Analysis> = {}): V3Analysis {
  return {
    status: "done",
    docTypeId,
    docTypeLabel: docTypeId,
    confidence: 0.95,
    requirementId: docTypeId,
    fields: {},
    ...over,
  };
}

let n = 0;
function file(name: string, instanceId: string | null, a: V3Analysis, over: Partial<FileEntry> = {}): FileEntry {
  n++;
  return {
    id: `f${n}`,
    name,
    size: 1000 + n,
    uploadState: "uploaded",
    documentId: `doc-${n}`,
    sharepointUrl: `https://sp.example/${encodeURIComponent(name)}`,
    analysisState: a.status === "failed" ? "failed" : "done",
    analysis: a,
    instanceId,
    ...over,
  };
}

/**
 * Every requirement of the Mustermann list fulfilled, plus surplus, duplicate and not-needed files.
 *
 * Described the way the real pipeline produces them: placement is recomputed from the
 * recognised type, so a not-needed file carries a not-needed type id and a duplicate shares
 * the content hash of the file it duplicates.
 */
export function mustermannFiles(): FileEntry[] {
  n = 0;
  return [
    file("03_Foto_Liegenschaft_Musterweg_1.pdf", "fotos", analysis("fotos", { fields: { Aufnahmen: { value: "7 Seiten", confidence: 0.9 } } })),
    file("03_Verkaufsdokumentation_Musterweg_1_8000_Zuerich.pdf", "verkaufsdoku", analysis("verkaufsdoku", { docDate: "2024", fields: { Baujahr: { value: "1964", confidence: 0.92 }, "Verkaufspreis 2024": { value: "CHF 1'240'000", confidence: 0.9 } } })),
    file("03_STWE_Aufteilungsplaene_Liegenschaft.pdf", "stwe_plan", analysis("stwe_plan")),
    file(
      "03_Grundbuchauszug_Musterweg_1_Zuerich_2026_01_15.pdf",
      "grundbuch",
      analysis("grundbuch", {
        docDate: "2026-01-15",
        outdated: true,
        outdatedReason: "älter als 6 Monate",
        note: "Grundbuchauszug vom 15.01.2026, vor der Bankanfrage aktualisieren.",
        fields: { Eigentümer: { value: "Max Simon Mustermann", confidence: 0.97 }, Blatt: { value: "1001 / 1002", confidence: 0.94 } },
      }),
      { outdatedOverride: true }
    ),
    file("03_Gebaeudeversicherung_GVZ_Liegenschaft_2026.pdf", "gvz", analysis("gvz", { docDate: "2026-01-01", fields: { Kubatur: { value: "1320 m³", confidence: 0.9 } } })),
    file("03_STWE_Reglement_Liegenschaft_angepasst.pdf", "stwe_regl", analysis("stwe_regl")),
    file("03_Erneuerungsfonds_Auszug_Liegenschaft.pdf", "ef", analysis("ef", { docDate: "2025-12-31" })),
    file("03_Hypothek_Produktvereinbarung_Musterbank_Max_Mustermann.pdf", "produkt", analysis("produkt", { bank: "Musterbank", docDate: "2023-01-20" })),
    file("03_Hypothek_Zinsabrechnung_Musterbank_Max_Mustermann.pdf", "hyp_zins", analysis("hyp_zins", { bank: "Musterbank", docDate: "2026-03-30", fields: { Zinssatz: { value: "SARON 0.80 %", confidence: 0.96 } } })),
    file("01_Auskunftsermaechtigung_Max_Mustermann_unterzeichnet.pdf", "vollmacht", analysis("vollmacht", { docDate: "2026-06-02" })),
    file("01_ID_Max_Mustermann.pdf", "id#b1", analysis("id", { personName: "Mustermann Max Simon", fields: { Geburtsdatum: { value: "05.03.1985", confidence: 0.98 } } })),
    file("01_Lohnausweis_Max_Mustermann_2025.pdf", "lohnausweise#b1", analysis("lohnausweise", { docDate: "2025", fields: { Bruttolohn: { value: "CHF 110'310", confidence: 0.95 } } })),
    file("01_Lohnabrechnung_Max_Mustermann_2026_02_03_04_05.pdf", "lohnabrechnungen#b1", analysis("lohnabrechnungen", { docDate: "2026-05" })),
    file("01_Pensionskassenausweis_Max_Mustermann_2026.pdf", "pk#b1", analysis("pk", { docDate: "2026-01-01" })),
    file("01_Steuererklaerung_Max_Mustermann_2025.pdf", "steuer#b1", analysis("steuer", { docDate: "Steuerjahr 2025" })),
    file("01_Unterhalt_Elternvereinbarung_Max_Mustermann_2025.pdf", "unterhalt", analysis("unterhalt", { docDate: "2025" })),
    file("01_Privatkredit_MusterKredit_Max_Mustermann_87654321.pdf", "kredit", analysis("kredit", { note: "Muster Kredit, Restschuld CHF 21'480 – wird mit der Erhöhung abgelöst." })),
    file("01_Leasingvertrag_MusterLeasing_Max_Mustermann.pdf", "leasing", analysis("leasing", { note: "Muster Leasing AG – wird abgelöst.", contentHash: "sha-leasing-muster" })),
    file("01_Saeule3a_Bescheinigung_Max_Mustermann.pdf", "s3a", analysis("s3a")),
    file("01_Versicherung_Saeule3a_Police_7654321.pdf", "police", analysis("police", { note: "Police an die Musterbank verpfändet." })),
    file("01_Versicherung_Saeule3a_Wertmitteilung_7654321.pdf", "police", analysis("police", { docDate: "2026-01-09" })),
    // Handover 4.3: outside the list
    file("01_Lohnausweis_Max_Mustermann_2024_Muster_Treuhand_AG.pdf", null, analysis("lohnausweise", { requirementId: "lohnausweise", extraKind: "surplus", docDate: "2024", extraReason: OLDER_SALARY_DE })),
    file("01_Lohnausweis_Max_Mustermann_2023.pdf", null, analysis("lohnausweise", { requirementId: "lohnausweise", extraKind: "surplus", docDate: "2023", extraReason: OLDER_SALARY_DE })),
    file("01_Anstellungsvertrag_MusterTreuhand.pdf", null, analysis("anstellung", { requirementId: "anstellung", extraKind: "notneeded", extraReason: "Nur nötig bei einer Lohnerhöhung im laufenden Jahr – keine erkannt." })),
    file("01_Vermoegen_Musterbank_Konten_Max_Mustermann.pdf", null, analysis("vermoegen", { requirementId: "vermoegen", extraKind: "notneeded", extraReason: "Eigenmittelnachweis ist nur bei einem Kauf nötig." })),
    file("03_Hypothek_Sicherungsvereinbarung_Musterbank_Max_Mustermann.pdf", null, analysis("hyp_sicher", { requirementId: null, extraKind: "notneeded", extraReason: "Schuldbrief / Sicherungsvereinbarung wird nicht benötigt.", bank: "Musterbank" })),
    file("01_Lohnausweis_Max_Mustermann_2022.pdf", null, analysis("lohnausweise", { requirementId: null, extraKind: "surplus", docDate: "2022", extraReason: "viertes Jahr" })),
    file("01_Leasingvertrag_MusterLeasing_Max_Musterman.pdf", null, analysis("leasing", { requirementId: null, extraKind: "duplicate", contentHash: "sha-leasing-muster" })),
    file("01_Steuerrechnung_Max_Mustermann_2023_Schlussrechnung.pdf", null, analysis("nn_steuerrechnung", { requirementId: null, extraKind: "notneeded", extraReason: "Steuerrechnung" })),
    file("03_Nebenkostenabrechnung_Musterweg_1_Zuerich_2025.PDF", null, analysis("nn_nebenkosten", { requirementId: null, extraKind: "notneeded", extraReason: "Nebenkostenabrechnung" }), { keep: true }),
  ];
}
