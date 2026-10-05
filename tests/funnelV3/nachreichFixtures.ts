/**
 * A v3 inquiry waiting for a Nachreichung (fixtures for the nachreich*.test.ts suites).
 *
 * Fall Gerber with a second borrower, Anna Muster: Gary's documents arrived (but not the
 * photos and only two of three Lohnausweise); none of Anna's did. The Document rows look the
 * way /api/inquiry leaves them: AI verdict under aiAnalysis.v3, the customer's decision under
 * aiAnalysis.v3Submitted, stored names from the closing, and one duplicate the closing deleted.
 */
import type { CompletionDocumentRow } from "@/lib/funnel-v3/completion";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import type { Borrower } from "@/lib/funnel-v3/types";
import { gerberFiles, gerberState } from "./gerberCase";

export const CASE = "HQ-26-10-000123";
export const INQUIRY = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
export const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

export const GARY: Borrower = { id: "b1", vor: "Gary", nach: "Gerber", job: "Angestellt", pkSe: "Nein" };
export const ANNA: Borrower = { id: "b2", vor: "Anna", nach: "Muster", job: "Angestellt", pkSe: "Nein" };

export function v3StateFor(borrowers: Borrower[] = [GARY, ANNA], lang = "de") {
  const s = gerberState({ borrowers });
  return { version: 1, role: s.role, ans: s.ans, txt: s.txt, fin: s.fin, borrowers: s.borrowers, lang };
}

const LEFT_OUT = new Set(["03_Foto_Liegenschaft_Etzelstrasse_52.pdf", "01_Lohnausweis_Gary_Gerber_2023.pdf"]);

/** Gary's documents as Document rows, minus the photos and the 2023 Lohnausweis. */
export function existingRows(opts: { leaveOut?: Set<string>; grundbuchOverride?: boolean } = {}): CompletionDocumentRow[] {
  const leaveOut = opts.leaveOut ?? LEFT_OUT;
  const files = gerberFiles().filter((f) => f.instanceId && !leaveOut.has(f.name));
  const rows: CompletionDocumentRow[] = files.map((f, i) => {
    const override = f.instanceId === "grundbuch" ? opts.grundbuchOverride ?? true : false;
    const stored = f.instanceId === "lohnausweise#b1" ? `${CASE}_01_Lohnausweis_Gerber-Gary_${f.analysis!.docDate}_${f.analysis!.docDate === "2024" ? 1 : 2}.pdf` : null;
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
