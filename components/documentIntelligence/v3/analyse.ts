import type { ExtractedField, V3Analysis } from "@/lib/funnel-v3/files";
import { formatDocDate } from "@/lib/funnel-v3/storedName";
import { classifiableTypes, freshnessProblem, outdatedReasonDe, v3DocType } from "./catalogue";
import { OpenAIV3DocumentProvider } from "./openaiProvider";
import type { V3Audit, V3DocumentProvider, V3ProviderResult } from "./types";

/**
 * The HYPOTEQ side of v3 recognition: everything that is a rule rather than a model call.
 *
 * The provider says what the file is and what it says. Whether the type is a real catalogue
 * entry, which fields count, whether the document is too old and whether it is one the bank
 * does not need are decided here, from the catalogue. Placement on the customer's list (which
 * depends on the answers) is decided in the browser by lib/funnel-v3/placeFile.ts.
 */

/** Below this the type is not trusted enough to place the file anywhere: it becomes «Nicht erkannt». */
export const MIN_CLASSIFICATION_CONFIDENCE = 0.5;
const MAX_NOTE = 280;

export function defaultV3Provider(): V3DocumentProvider {
  return new OpenAIV3DocumentProvider();
}

export interface AnalyseV3Request {
  fileName: string;
  mimeType: string;
  data: Buffer;
  contentHash?: string | null;
  now?: Date;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** Applies the catalogue to a provider result. Pure (given `now`). */
export function applyV3Rules(
  result: V3ProviderResult,
  opts: { contentHash?: string | null; now?: Date } = {}
): V3Analysis {
  const now = opts.now ?? new Date();
  const classifiable = new Set(classifiableTypes().map((t) => t.id));
  const confidence = clamp01(result.confidence);
  const type =
    classifiable.has(result.docType) && confidence >= MIN_CLASSIFICATION_CONFIDENCE ? v3DocType(result.docType) : undefined;

  if (!type) {
    return {
      status: "done",
      docTypeId: null,
      docTypeLabel: null,
      confidence,
      requirementId: null,
      extraKind: "unknown",
      fields: {},
      contentHash: opts.contentHash ?? null,
    };
  }

  if (type.kind === "notneeded") {
    return {
      status: "done",
      docTypeId: type.id,
      docTypeLabel: type.labelDe,
      confidence,
      requirementId: null,
      extraKind: "notneeded",
      extraReason: type.notNeededReason ?? type.labelDe,
      fields: {},
      contentHash: opts.contentHash ?? null,
    };
  }

  // Only the type's own keys; on a repeated key the more confident reading wins.
  const allowed = new Set(type.fields.map((f) => f.key));
  const fields: Record<string, ExtractedField> = {};
  for (const f of result.fields) {
    if (!allowed.has(f.key) || f.value === null || f.value === "") continue;
    const c = clamp01(f.confidence);
    if (!fields[f.key] || fields[f.key].confidence < c) fields[f.key] = { value: f.value, confidence: c };
  }

  let docDate: string | null = type.naming.date === "none" ? null : formatDocDate(result.docDate) || null;
  if (docDate && type.naming.date === "year") docDate = docDate.slice(0, 4);

  const problem = freshnessProblem(type.id, docDate, fields, now);
  const note = type.noteWhen && result.note ? result.note.slice(0, MAX_NOTE) : null;

  return {
    status: "done",
    docTypeId: type.id,
    docTypeLabel: type.labelDe,
    confidence,
    // The type's own requirement; the browser moves it to the right instance (or to an extra).
    requirementId: type.id,
    personName: type.naming.person ? result.personName : null,
    bank: type.naming.bank ? result.bank : null,
    docDate,
    outdated: Boolean(problem),
    outdatedReason: problem ? outdatedReasonDe(problem) : null,
    note,
    fields,
    contentHash: opts.contentHash ?? null,
  };
}

export async function analyseDocumentV3(
  req: AnalyseV3Request,
  provider: V3DocumentProvider = defaultV3Provider()
): Promise<{ analysis: V3Analysis; audit: V3Audit }> {
  const now = req.now ?? new Date();
  const result = await provider.analyseV3({ fileName: req.fileName, mimeType: req.mimeType, data: req.data });
  const analysis = applyV3Rules(result, { contentHash: req.contentHash, now });
  return {
    analysis,
    audit: {
      originalFileName: req.fileName,
      provider: provider.name,
      model: provider.model,
      analysedAt: now.toISOString(),
      durationMs: result.durationMs,
      ...(analysis.docTypeId !== result.docType ? { modelDocType: result.docType } : {}),
    },
  };
}

/** The body for a file that could not be analysed (spec: an AI failure never blocks the funnel). */
export function failedV3Analysis(contentHash: string | null = null): V3Analysis {
  return {
    status: "failed",
    docTypeId: null,
    docTypeLabel: null,
    confidence: 0,
    requirementId: null,
    extraKind: "unknown",
    fields: {},
    contentHash,
  };
}
