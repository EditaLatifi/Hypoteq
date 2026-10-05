/**
 * Provider contract for Funnel v3 recognition. Vendor-neutral on purpose (spec 5, «provider
 * swappable»): nothing outside a provider file may import an SDK type, and a provider only
 * reports what a document is and what it says. Rules live in ./analyse.ts.
 */

export interface V3ProviderInput {
  fileName: string;
  mimeType: string;
  /** Raw bytes. Never logged. */
  data: Buffer;
}

export interface V3ProviderField {
  key: string;
  value: string | null;
  confidence: number;
}

/** The model's answer, before HYPOTEQ rules are applied. */
export interface V3ProviderResult {
  /** A classifiable catalogue id (catalogue.classifiableTypes()) or "unknown". */
  docType: string;
  confidence: number;
  /** «Nachname Vorname» of the person the document belongs to, as printed. */
  personName: string | null;
  /** Lender on mortgage documents, short form («ZKB»). */
  bank: string | null;
  /** `JJJJ-MM-TT` or `JJJJ`. */
  docDate: string | null;
  note: string | null;
  fields: V3ProviderField[];
  durationMs: number;
}

export interface V3DocumentProvider {
  readonly name: string;
  readonly model: string;
  analyseV3(input: V3ProviderInput): Promise<V3ProviderResult>;
}

/** Stored beside the analysis on the row (`aiAnalysis.audit`), never shown to customers. */
export interface V3Audit {
  originalFileName: string;
  provider: string;
  model: string;
  analysedAt: string;
  durationMs: number;
  /** The model's own type when the rules changed it (e.g. an unknown id). */
  modelDocType?: string;
}
