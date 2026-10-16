/**
 * v5 submissions for the closing tests (mails, Salesforce, dossier). Made-up people and
 * figures — no real case data.
 */
import { toInquiryPayload, type Locale } from "@/lib/funnel-v3/toInquiryPayload";
import type { CompletedFile } from "@/lib/funnel-v3/completion";
import type { V3Analysis } from "@/lib/funnel-v3/files";
import { reqList, SIGNATURE_REQUIREMENT_ID } from "@/lib/funnel-v3/requirements";
import type { SignatureJson } from "@/lib/funnel-v3/signature";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, type FunnelState } from "@/lib/funnel-v3/types";

export const SUBMISSION = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
export const CASE_NO = "HQ-26-10-123456";
export const RETURN_URL = "https://hypoteq.com/de/nachreichen/tok-123";

/** Kunde, Neue Hypothek, natural person, one borrower: Lea Muster, 8001 Zürich. */
export function kaufState(over: Partial<FunnelState> = {}): FunnelState {
  return {
    role: "kunde",
    mode: "begleitet",
    em: { ...EMPTY_EM },
    info: {},
    src: {},
    touched: {},
    sig: { choice: "uploaded", at: "2026-10-15T09:00:00.000Z", method: "upload" },
    ans: {
      ...DEFAULT_ANSWERS,
      antrag: "Neue Hypothek",
      anrede: "Frau",
      immo: "Bestehende Immobilie",
      lieg: "Einfamilienhaus",
      nutz: "Selbstbewohnt",
      laufzeit: "10 Jahre",
    },
    borrowers: [{ id: "b1", vor: "Lea", nach: "Muster", job: "Angestellt", pkSe: "Nein" }],
    txt: { ...EMPTY_TEXTS, vor: "Lea", nach: "Muster", mail: "lea.muster@kunde.ch", tel: "079 111 22 33", plz: "8001", ort: "Zürich" },
    fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 1000000, inc: 200000 },
    ...over,
  };
}

/** Berater entry, Ablösung with Erhöhung: Marco Beispiel, 3000 Bern; Berater Bea Rater. */
export function ablState(over: Partial<FunnelState> = {}): FunnelState {
  return kaufState({
    role: "berater",
    ans: { ...DEFAULT_ANSWERS, antrag: "Ablösung", anrede: "Herr", immo: "Bestehende Immobilie", lieg: "Stockwerkeigentum", nutz: "Selbstbewohnt", aufstockung: "Ja", laufzeit: "5 Jahre" },
    borrowers: [{ id: "b1", vor: "Marco", nach: "Beispiel", job: "Angestellt", pkSe: "Nein" }],
    txt: {
      ...EMPTY_TEXTS,
      bmail: "bea.rater@partner.ch",
      pvor: "Bea",
      pnach: "Rater",
      ptel: "044 000 00 00",
      pfirma: "Partner AG",
      vor: "Marco",
      nach: "Beispiel",
      mail: "marco.beispiel@kunde.ch",
      tel: "078 222 33 44",
      plz: "3000",
      ort: "Bern",
      zweck: "Renovation Küche",
    },
    fin: { ...EMPTY_AMOUNTS, old: 400000, up: 100000, val: 1200000, inc: 150000 },
    ...over,
  });
}

/** Juristische Person (Kunde), Neue Hypothek, Vermietet. */
export function jurState(over: Partial<FunnelState> = {}): FunnelState {
  return kaufState({
    ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek", kn: "Juristische Person", immo: "Bestehende Immobilie", lieg: "Mehrfamilienhaus", nutz: "Vermietet" },
    borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }],
    txt: { ...EMPTY_TEXTS, mail: "info@immo-ag.ch", tel: "044 555 66 77", plz: "8400", ort: "Winterthur", firma: "Immo Beispiel AG", zeichner: "Petra Beispiel" },
    fin: { ...EMPTY_AMOUNTS, kaufpreis: 3000000, val: 3000000, miete: 120000 },
    ...over,
  });
}

export function analysis(docTypeId: string, over: Partial<V3Analysis> = {}): V3Analysis {
  return { status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.95, requirementId: docTypeId, fields: {}, ...over };
}

/**
 * The closing's file list. `missing` names requirement ids left without a file; everything else
 * gets as many files as it expects. P0 (the Auskunftsermächtigung) only when `signed`.
 */
export function completedFiles(state: FunnelState, opts: { missing?: string[]; signed?: boolean } = {}): CompletedFile[] {
  const out: CompletedFile[] = [];
  for (const inst of reqList(state)) {
    if (opts.missing?.includes(inst.id)) continue;
    if (inst.id === SIGNATURE_REQUIREMENT_ID && !opts.signed) continue;
    for (let k = 0; k < inst.expect; k++) {
      const id = `doc-${inst.instanceId}-${k}`;
      out.push({
        documentId: id,
        originalName: `${id}.pdf`,
        storedName: `${CASE_NO}_${id}.pdf`,
        url: `https://sp.example/case/${id}.pdf`,
        instanceId: inst.instanceId,
        requirementId: inst.id,
        removed: false,
        assignedByUser: inst.id === SIGNATURE_REQUIREMENT_ID,
        analysis: analysis(inst.id, inst.id === SIGNATURE_REQUIREMENT_ID ? { status: "done", fields: {} } : {}),
      });
    }
  }
  return out;
}

export function signatureOf(state: FunnelState, uploaded: boolean): SignatureJson {
  return uploaded ? { status: "uploaded", at: state.sig?.at ?? null, method: "upload" } : { status: "pending", at: state.sig?.at ?? null, method: "upload" };
}

/** The /api/inquiry body of a v5 submission, after the closing ran (`v3Completion`). */
export function v5Payload(
  state: FunnelState,
  opts: { locale?: Locale; missing?: string[]; signed?: boolean; folder?: boolean } = {}
): any {
  const signed = opts.signed ?? state.sig?.choice !== "later";
  const p: any = toInquiryPayload(state, { locale: opts.locale ?? "de", submissionId: SUBMISSION, signature: signatureOf(state, signed) });
  p.v3Completion = {
    folderId: "FOLDER",
    folderWebUrl: opts.folder === false ? null : "https://sp.example/case",
    files: completedFiles(state, { missing: opts.missing, signed }),
    dossier: opts.folder === false ? null : { name: `${CASE_NO}_00_Fall-Dossier.pdf`, webUrl: "https://sp.example/case/dossier.pdf", driveItemId: "dossier" },
    errors: [],
  };
  return p;
}
