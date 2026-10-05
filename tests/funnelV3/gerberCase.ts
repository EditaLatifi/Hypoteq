/**
 * Fall Gerber (spec header, sample dossier) as the closing step sees it: the answers of all
 * six steps and one analysed file per requirement, plus the «Weitere Dateien» of spec 4.3.
 */
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";

export const SUBMISSION = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";

export function gerberState(over: Partial<FunnelState> = {}): FunnelState {
  return {
    role: "kunde",
    ans: {
      ...DEFAULT_ANSWERS,
      antrag: "Ablösung",
      anrede: "Herr",
      immo: "Bestehende Immobilie",
      lieg: "Stockwerkeigentum",
      nutz: "Selbstbewohnt",
      heizung: "Unbekannt",
      aufstockung: "Ja",
      kinder: "Ja",
      unterhalt: "Ja",
      kredite: "Ja",
      leasing: "Ja",
      laufzeit: "3 Jahre",
      s3a: "Ja",
    },
    borrowers: [{ id: "b1", vor: "Gary", nach: "Gerber", job: "Angestellt", pkSe: "Nein" }],
    txt: {
      ...EMPTY_TEXTS,
      vor: "Gary",
      nach: "Gerber",
      mail: "gary.gerber@example.ch",
      tel: "079 123 45 67",
      plz: "8820",
      ort: "Wädenswil",
      zweck: "Ablösung Privatkredit BANK-now und Cembra-Leasing, kleinere Renovationen",
    },
    fin: { ...EMPTY_AMOUNTS, old: 449000, up: 201000, inc: 125000, val: 1450000 },
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

/** Every requirement of the Gerber list fulfilled, plus surplus, duplicate and not-needed files. */
export function gerberFiles(): FileEntry[] {
  n = 0;
  return [
    file("03_Foto_Liegenschaft_Etzelstrasse_52.pdf", "fotos", analysis("fotos", { fields: { Aufnahmen: { value: "7 Seiten", confidence: 0.9 } } })),
    file("03_Verkaufsdokumentation_Etzelstrasse_52_8820_Waedenswil.pdf", "verkaufsdoku", analysis("verkaufsdoku", { docDate: "2024", fields: { Baujahr: { value: "1921", confidence: 0.92 }, "Verkaufspreis 2024": { value: "CHF 1'450'000", confidence: 0.9 } } })),
    file("03_STWE_Aufteilungsplaene_Liegenschaft.pdf", "stwe_plan", analysis("stwe_plan")),
    file(
      "03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf",
      "grundbuch",
      analysis("grundbuch", {
        docDate: "2026-01-15",
        outdated: true,
        outdatedReason: "älter als 6 Monate",
        note: "Grundbuchauszug vom 15.01.2026, vor der Bankanfrage aktualisieren.",
        fields: { Eigentümer: { value: "Gary Samuel Gerber", confidence: 0.97 }, Blatt: { value: "7357 / 7361", confidence: 0.94 } },
      }),
      { outdatedOverride: true }
    ),
    file("03_Gebaeudeversicherung_GVZ_Liegenschaft_2026.pdf", "gvz", analysis("gvz", { docDate: "2026-01-01", fields: { Kubatur: { value: "1497 m³", confidence: 0.9 } } })),
    file("03_STWE_Reglement_Liegenschaft_angepasst.pdf", "stwe_regl", analysis("stwe_regl")),
    file("03_Erneuerungsfonds_Auszug_Liegenschaft.pdf", "ef", analysis("ef", { docDate: "2025-12-31" })),
    file("03_Hypothek_Rahmenvertrag_ZKB_Gary_Gerber.pdf", "hyp_rahmen", analysis("hyp_rahmen", { bank: "ZKB", docDate: "2023-01-20" })),
    file("03_Hypothek_Sicherungsvereinbarung_ZKB_Gary_Gerber.pdf", "hyp_sicher", analysis("hyp_sicher", { bank: "ZKB" })),
    file("03_Hypothek_Zinsabrechnung_ZKB_Gary_Gerber.pdf", "hyp_zins", analysis("hyp_zins", { bank: "ZKB", docDate: "2026-03-30", fields: { Zinssatz: { value: "SARON 0.65 %", confidence: 0.96 } } })),
    file("01_Auskunftsermaechtigung_Gary_Gerber_unterzeichnet.pdf", "vollmacht", analysis("vollmacht", { docDate: "2026-06-02" })),
    file("01_ID_Gary_Gerber.pdf", "id#b1", analysis("id", { personName: "Gerber Gary Samuel", fields: { Geburtsdatum: { value: "04.01.1988", confidence: 0.98 } } })),
    file("01_Lohnausweis_Gary_Gerber_2025.pdf", "lohnausweise#b1", analysis("lohnausweise", { docDate: "2025" })),
    file("01_Lohnausweis_Gary_Gerber_2023.pdf", "lohnausweise#b1", analysis("lohnausweise", { docDate: "2023" })),
    file("01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf", "lohnausweise#b1", analysis("lohnausweise", { docDate: "2024", fields: { Bruttolohn: { value: "CHF 125'385", confidence: 0.95 } } })),
    file("01_Lohnabrechnung_Gary_Gerber_2026_02_03_04_05.pdf", "lohnabrechnungen#b1", analysis("lohnabrechnungen", { docDate: "2026-05" })),
    file("01_Anstellungsvertrag_Etzel.pdf", "anstellung#b1", analysis("anstellung")),
    file("01_Pensionskassenausweis_Gary_Gerber_2026.pdf", "pk#b1", analysis("pk", { docDate: "2026-01-01" })),
    file("01_Steuererklaerung_Gary_Gerber_2025.pdf", "steuer#b1", analysis("steuer", { docDate: "Steuerjahr 2025" })),
    file("01_Unterhalt_Elternvereinbarung_Gary_Gerber_2025.pdf", "unterhalt", analysis("unterhalt", { docDate: "2025" })),
    file("01_Privatkredit_BANKnow_Gary_Gerber_21768324.pdf", "kredit", analysis("kredit", { note: "BANK-now, Restschuld CHF 24'360 – wird mit der Erhöhung abgelöst." })),
    file("01_Leasingvertrag_Cembra_Gary_Gerber.pdf", "leasing", analysis("leasing", { note: "Cembra Money Bank – wird abgelöst." })),
    file("01_Vermoegen_UBS_Konten_Gary_Gerber.pdf", "vermoegen", analysis("vermoegen")),
    file("01_Saeule3a_Bescheinigung_Gary_Gerber.pdf", "s3a", analysis("s3a")),
    file("01_Versicherung_Saeule3a_Police_1583886.pdf", "police", analysis("police", { note: "Police an die ZKB verpfändet." })),
    file("01_Versicherung_Saeule3a_Wertmitteilung_1583886.pdf", "police", analysis("police", { docDate: "2026-01-09" })),
    // spec 4.3
    file("01_Lohnausweis_Gary_Gerber_2022.pdf", null, analysis("lohnausweise", { requirementId: null, extraKind: "surplus", docDate: "2022", extraReason: "viertes Jahr" })),
    file("01_Leasingvertrag_Cembra_Gary_Gerbe.pdf", null, analysis("leasing", { requirementId: null, extraKind: "duplicate" })),
    file("01_Steuerrechnung_Gary_Gerber_2023_Schlussrechnung.pdf", null, analysis(null, { requirementId: null, extraKind: "notneeded", extraReason: "Steuerrechnung" })),
    file("03_Nebenkostenabrechnung_Etzelstrasse_52_Waedenswil_2025.PDF", null, analysis(null, { requirementId: null, extraKind: "notneeded", extraReason: "Nebenkostenabrechnung" }), { keep: true }),
  ];
}
