/**
 * The shape the Document Intelligence layer speaks in (spec §27, §32, §15).
 *
 * Kept free of any provider's vocabulary on purpose: §30 requires that the model can be
 * swapped without touching the funnel, so nothing outside providers/ may import an SDK type.
 */

/** Spec §32. `missing` is the funnel's word for a requirement, not a state of a file. */
export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "classified"
  | "review_required"
  | "confirmed"
  | "rejected"
  | "failed"
  | "outdated"
  | "unsupported";

/** One extracted value, always with its own confidence (§15). */
export interface ExtractedField {
  value: string | number | boolean | null;
  /** "CHF", "m2", "%" — omitted when the value is not a quantity. */
  unit?: string | null;
  confidence: number;
}

export interface Classification {
  /** A canonical id from documentTypes.ts, or "unknown" (§21). */
  type: string;
  /** German label shown to staff. */
  label: string;
  confidence: number;
}

/** Spec §27, verbatim in shape. */
export interface DocumentAnalysis {
  documentId: string;
  classification: Classification;
  person: { borrowerId: string | null; confidence: number } | null;
  /** ISO date the document itself carries (issue date / period end), not the upload date. */
  documentDate: string | null;
  suggestedFilename: string | null;
  fields: Record<string, ExtractedField>;
  status: DocumentStatus;

  /** Which funnel requirement this file satisfies, once resolved against what was asked. */
  funnelDocKey: string | null;
  /** Set when the file does not match the requirement it was uploaded against (§20). */
  mismatchedRequirement?: { expected: string; got: string } | null;
  /** Set when the document is older than its rule allows (§25). */
  freshness?: { maxAgeMonths: number; documentDate: string; ageMonths: number } | null;
  /**
   * Other document types the same file appears to contain (§22).
   *
   * Reported, not acted on. Splitting a combined PDF into its parts is a later stage; what
   * matters now is that a customer who merged eight documents into one upload is told the
   * other seven were seen, rather than left believing they are missing.
   */
  alsoContains?: string[];

  /** Audit (§36). The raw model output is deliberately NOT kept — see the route. */
  audit: {
    originalFileName: string;
    model: string;
    provider: string;
    analysedAt: string;
    /** Milliseconds the provider call took; useful when tuning §31's async UX. */
    durationMs: number;
  };
}

/** What a provider must implement. Everything else in this folder is provider-agnostic. */
export interface DocumentIntelligenceProvider {
  readonly name: string;
  readonly model: string;
  analyse(input: ProviderInput): Promise<ProviderResult>;
}

export interface ProviderInput {
  fileName: string;
  mimeType: string;
  /** Raw file bytes. Never logged — §37 forbids putting document content in logs. */
  data: Buffer;
  /** Only the requirements this case was actually asked for, so the model picks among them. */
  candidateTypes: string[];
  /** Borrower names, so a document can be attributed to a person (§24). */
  borrowers: Array<{ id: string; name: string }>;
}

/** What the provider returns before HYPOTEQ rules are applied. */
export interface ProviderResult {
  classification: Classification;
  person: { borrowerId: string | null; confidence: number } | null;
  documentDate: string | null;
  fields: Record<string, ExtractedField>;
  /** Other listed types the file also appears to contain (§22). */
  alsoContains?: string[];
  durationMs: number;
}

/**
 * Confidence bands (§15). Configurable because the spec says the thresholds are initial
 * guesses to be tuned during testing — hard-coding them would make that a code change.
 */
export function confidenceBands() {
  const accept = Number(process.env.DOCAI_CONFIDENCE_ACCEPT ?? 0.9);
  const review = Number(process.env.DOCAI_CONFIDENCE_REVIEW ?? 0.7);
  return {
    accept: Number.isFinite(accept) ? accept : 0.9,
    review: Number.isFinite(review) ? review : 0.7,
  };
}

export type ConfidenceBand = "certain" | "uncertain" | "unrecognised";

export function bandFor(confidence: number): ConfidenceBand {
  const { accept, review } = confidenceBands();
  if (confidence >= accept) return "certain";
  if (confidence >= review) return "uncertain";
  return "unrecognised";
}
