/**
 * An inquiry stored BEFORE v5 waiting for a Nachreichung (fixtures for the nachreich*.test.ts
 * suites): `Inquiry.v3State` in the v3 shape (version 1 — Kinder, ab 50, Heizungsart, the
 * Eigenmittel yes/no answers), read by lib/funnel-v3/legacy.ts and judged by the v5 rules.
 *
 * Fall Gerber with a second borrower, Anna Muster: Gary's documents arrived (but not the
 * photos and none of his Lohnausweise); none of Anna's did. The v3 list also had the
 * Rahmenvertrag, the Schuldbrief, the Anstellungsvertrag and the Eigenmittelnachweis — their
 * files are on the inquiry under the v3 requirement ids. The Document rows look the way
 * /api/inquiry left them: AI verdict under aiAnalysis.v3, the customer's decision under
 * aiAnalysis.v3Submitted, stored names from the closing, and one duplicate the closing deleted.
 */
import type { CompletionDocumentRow } from "@/lib/funnel-v3/completion";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import type { Borrower } from "@/lib/funnel-v3/types";
import { gerberFiles } from "./gerberCase";

export const CASE = "HQ-26-10-000123";
export const INQUIRY = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
export const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

export const GARY: Borrower = { id: "b1", vor: "Gary", nach: "Gerber", job: "Angestellt", pkSe: "Nein" };
export const ANNA: Borrower = { id: "b2", vor: "Anna", nach: "Muster", job: "Angestellt", pkSe: "Nein" };

/** `Inquiry.v3State` as a v3 submission stored it (version 1, before v5). */
export function v3StateFor(borrowers: Borrower[] = [GARY, ANNA], lang = "de") {
  return {
    version: 1,
    role: "kunde" as string,
    ans: {
      antrag: "Ablösung",
      kn: "Natürliche Person",
      anrede: "Herr",
      immo: "Bestehende Immobilie",
      nbDocs: "Nein",
      lieg: "Stockwerkeigentum",
      nutz: "Selbstbewohnt",
      heizung: "Unbekannt",
      baurecht: "Nein",
      aufstockung: "Ja",
      reno: "Nein",
      reserviert: "Nein",
      angebote: "Nein",
      ab50: "Nein",
      kinder: "Ja",
      unterhalt: "Ja",
      kredite: "Ja",
      leasing: "Ja",
      buerge: "Nein",
      laufzeit: "3 Jahre",
      s3a: "Ja",
      schenkung: "Nein",
      erbe: "Nein",
      darlehen: "Nein",
      pk: "Nein",
    },
    txt: {
      bmail: "", pvor: "", pnach: "", ptel: "", pfirma: "",
      vor: "Gary", nach: "Gerber", mail: "gary.gerber@example.ch", tel: "079 123 45 67",
      plz: "8820", ort: "Wädenswil", zweck: "Ablösung Privatkredit BANK-now und Cembra-Leasing, kleinere Renovationen",
      firma: "", zeichner: "", buergeName: "", kommentar: "",
    } as Record<string, string>,
    fin: { old: 449000, up: 201000, kaufpreis: 0, inc: 125000, val: 1450000 },
    borrowers,
    lang,
  };
}

const LEFT_OUT = new Set([
  "03_Foto_Liegenschaft_Etzelstrasse_52.pdf",
  "01_Lohnausweis_Gary_Gerber_2025.pdf",
  "01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf",
  "01_Lohnausweis_Gary_Gerber_2023.pdf",
]);

/** Where the v3 list had placed the files (v3 requirement ids). */
const V3_PLACEMENT: Record<string, { name?: string; instanceId: string; docTypeId?: string }> = {
  "03_Hypothek_Produktvereinbarung_ZKB_Gary_Gerber.pdf": { name: "03_Hypothek_Rahmenvertrag_ZKB_Gary_Gerber.pdf", instanceId: "hyp_rahmen", docTypeId: "hyp_rahmen" },
  "03_Hypothek_Sicherungsvereinbarung_ZKB_Gary_Gerber.pdf": { instanceId: "hyp_sicher" },
  "01_Anstellungsvertrag_Etzel.pdf": { instanceId: "anstellung#b1" },
  "01_Vermoegen_UBS_Konten_Gary_Gerber.pdf": { instanceId: "vermoegen" },
  "01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf": { instanceId: "lohnausweise#b1" },
  "01_Lohnausweis_Gary_Gerber_2023.pdf": { instanceId: "lohnausweise#b1" },
};

/** Gary's documents as the v3 closing left them, minus the photos and his Lohnausweise. */
export function existingRows(opts: { leaveOut?: Set<string>; grundbuchOverride?: boolean } = {}): CompletionDocumentRow[] {
  const leaveOut = opts.leaveOut ?? LEFT_OUT;
  const files = gerberFiles()
    .map((f) => {
      const v3 = V3_PLACEMENT[f.name];
      if (!v3) return f;
      const docTypeId = v3.docTypeId ?? f.analysis!.docTypeId;
      return { ...f, name: v3.name ?? f.name, instanceId: v3.instanceId, analysis: { ...f.analysis!, docTypeId, docTypeLabel: docTypeId, requirementId: docTypeId, extraKind: undefined, extraReason: undefined } };
    })
    .filter((f) => f.instanceId && !leaveOut.has(f.name));
  const rows: CompletionDocumentRow[] = files.map((f, i) => {
    const override = f.instanceId === "grundbuch" ? opts.grundbuchOverride ?? true : false;
    const stored = f.instanceId === "lohnausweise#b1" ? `${CASE}_01_Lohnausweis_Gerber-Gary_${f.analysis!.docDate}.pdf` : null;
    return {
      id: f.documentId!,
      fileName: stored ?? f.name,
      fileUrl: `https://sp.example/case/${encodeURIComponent(stored ?? f.name)}`,
      originalFileName: f.name,
      driveItemId: `item-${f.documentId}`,
      uploadedAt: new Date(Date.UTC(2026, 9, 1, 10, 0, i)),
      aiAnalysis: {
        v3: f.analysis,
        v3Submitted: {
          instanceId: f.instanceId,
          requirementId: f.analysis!.requirementId,
          ...(override ? { outdatedOverride: true } : {}),
          submittedAt: "2026-10-01T10:00:00.000Z",
        },
      },
      storedName: stored,
    };
  });
  // A duplicate the closing removed from SharePoint: its row stays, it must not count.
  rows.push({
    id: "doc-removed",
    fileName: "01_Leasingvertrag_Cembra_Gary_Gerbe.pdf",
    fileUrl: "https://sp.example/case/dup.pdf",
    originalFileName: "01_Leasingvertrag_Cembra_Gary_Gerbe.pdf",
    driveItemId: null,
    uploadedAt: new Date(Date.UTC(2026, 9, 1, 10, 1, 0)),
    aiAnalysis: { v3: { status: "done", docTypeId: "fotos", docTypeLabel: "fotos", confidence: 0.9, requirementId: "fotos", fields: {} }, v3Completion: { removed: true } },
    storedName: null,
  });
  return rows;
}

export function analysis(docTypeId: string, over: Partial<V3Analysis> = {}): V3Analysis {
  return { status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.95, requirementId: docTypeId, fields: {}, ...over };
}

/** A file uploaded through the Nachreich page: a held row filed under the inquiry id. */
export function heldRow(id: string, name: string, a: V3Analysis, second = 0): CompletionDocumentRow {
  return {
    id,
    fileName: name,
    fileUrl: `https://sp.example/case/${encodeURIComponent(name)}`,
    originalFileName: name,
    driveItemId: `item-${id}`,
    uploadedAt: new Date(Date.UTC(2026, 9, 5, 9, 0, second)),
    aiAnalysis: { v3: a },
    storedName: null,
  };
}

/** The inquiry row as the Nachreich route selects it. */
export function inquiryRow(over: Record<string, any> = {}) {
  return {
    id: INQUIRY,
    caseNumber: CASE,
    documentsComplete: false,
    documentsMissing: "fotos,lohnausweise#b1,id#b2",
    nachreichExpiresAt: new Date(Date.now() + 86_400_000),
    nachreichCompletedAt: null,
    salesforceCaseId: "500CASE",
    sharepointFolderId: "FOLDER",
    client: { email: "gary.gerber@example.ch", firstName: "Gary", lastName: "Gerber" },
    v3State: v3StateFor(),
    v3Skipped: [],
    ...over,
  };
}
