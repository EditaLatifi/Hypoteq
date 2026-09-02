import { randomUUID } from "crypto";
import type { DocumentAnalysis, DocumentIntelligenceProvider, ProviderInput } from "./types";
import { bandFor } from "./types";
import { ageInMonths, candidateTypesFor, docTypeById, funnelKeyFor } from "./documentTypes";
import { OpenAIDocumentProvider } from "./openaiProvider";

/**
 * The HYPOTEQ side of document analysis: everything that is a business rule rather than a
 * model call.
 *
 * Spec section 28 is explicit that whether something counts as a problem is decided by
 * HYPOTEQ rules and not by the language model. So the provider only reports what a document
 * is and what it says; the status, the requirement it satisfies, whether it is the wrong
 * document and whether it is too old are all decided here, from data, where they can be
 * changed and tested without touching a prompt.
 */

export function defaultProvider(): DocumentIntelligenceProvider {
  return new OpenAIDocumentProvider();
}

export interface AnalyseRequest {
  fileName: string;
  mimeType: string;
  data: Buffer;
  /** Requirements this case was actually shown — the candidate set. */
  visibleFunnelKeys: string[];
  /** The requirement the file was uploaded against, when the user picked a tile. */
  expectedFunnelKey?: string | null;
  borrowers?: Array<{ id: string; name: string }>;
  documentId?: string;
  now?: Date;
}

/**
 * The person part of a generated filename, from a field that may hold far more than a name.
 *
 * A land registry extract states its owner as "Muster, Max, geb. 14.03.1985,
 * Alleineigentum", and passing that through produced
 * `Grundbuchauszug_2024_Muster_Max_geb_14_03_1985_Alleineigentum.pdf` — a name that is
 * worse than the IMG_4829.pdf it replaced, which is the one thing section 11 must not do.
 *
 * A Swiss register writes the person first, so the name is the leading comma-separated
 * parts: everything from the first part carrying a digit (a birth date, a share, a parcel)
 * is dropped, and the ownership form is dropped by name because it carries no digit to
 * catch it. Two parts at most — "Muster, Max" is a name, a third piece never is.
 */
const OWNERSHIP_TERMS = new Set([
  "alleineigentum",
  "miteigentum",
  "gesamteigentum",
  "stockwerkeigentum",
  "eigentuemer",
  "eigentümer",
]);

function personForFilename(raw: unknown): string {
  if (typeof raw !== "string") return "";

  const kept: string[] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (/\d/.test(part)) break;
    if (OWNERSHIP_TERMS.has(part.toLowerCase())) break;
    kept.push(part);
    if (kept.length === 2) break;
  }

  // A joint buyer ("Max Muster und Anna Muster") is still a legitimate name; the cap only
  // stops a sentence from becoming a filename.
  return kept.join(" ").split(/\s+/).slice(0, 5).join(" ");
}

/** Section 11: a name that says what the file is, from what was read out of it. */
function suggestFilename(
  typeId: string,
  fields: Record<string, { value: unknown }>,
  documentDate: string | null,
  originalFileName: string
): string | null {
  const spec = docTypeById(typeId);
  if (!spec) return null;

  const ext = originalFileName.includes(".") ? originalFileName.split(".").pop() : "pdf";
  const person = personForFilename(
    (fields.employee?.value as string) ||
      (fields.insuredPerson?.value as string) ||
      (fields.fullName?.value as string) ||
      [fields.firstName?.value, fields.lastName?.value].filter(Boolean).join(" ") ||
      (fields.buyer?.value as string) ||
      (fields.owner?.value as string) ||
      ""
  );

  const year = documentDate ? String(documentDate).slice(0, 4) : "";
  const base = spec.filenameBase;

  const parts = [base, year, person]
    .filter(Boolean)
    .join("_")
    // Umlauts and spaces survive SharePoint but make a mess of links and shell paths.
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return parts ? `${parts}.${ext}` : null;
}

export async function analyseDocument(
  req: AnalyseRequest,
  provider: DocumentIntelligenceProvider = defaultProvider()
): Promise<DocumentAnalysis> {
  const now = req.now ?? new Date();
  const documentId = req.documentId ?? `doc_${randomUUID()}`;
  const candidates = candidateTypesFor(req.visibleFunnelKeys).map((t) => t.id);

  const input: ProviderInput = {
    fileName: req.fileName,
    mimeType: req.mimeType,
    data: req.data,
    candidateTypes: candidates,
    borrowers: req.borrowers ?? [],
  };

  const result = await provider.analyse(input);
  const typeId = result.classification.type;
  const recognised = typeId !== "unknown" && Boolean(docTypeById(typeId));

  const funnelDocKey = recognised ? funnelKeyFor(typeId, req.visibleFunnelKeys) : null;

  // Section 20: the file was uploaded against a specific requirement and turned out to be
  // something else. Reported, never silently reassigned — the customer has to know the
  // Grundbuchauszug they think they supplied is an electricity bill.
  let mismatchedRequirement: DocumentAnalysis["mismatchedRequirement"] = null;
  if (recognised && req.expectedFunnelKey) {
    const spec = docTypeById(typeId);
    if (spec && !spec.funnelKeys.includes(req.expectedFunnelKey)) {
      mismatchedRequirement = { expected: req.expectedFunnelKey, got: typeId };
    }
  }

  // Section 25, from the type's own configured deadline rather than anything the model said.
  let freshness: DocumentAnalysis["freshness"] = null;
  const spec = docTypeById(typeId);
  if (spec?.maxAgeMonths && result.documentDate) {
    const age = ageInMonths(result.documentDate, now);
    if (age !== null && age > spec.maxAgeMonths) {
      freshness = {
        maxAgeMonths: spec.maxAgeMonths,
        documentDate: result.documentDate,
        ageMonths: age,
      };
    }
  }

  // Section 32. The order matters: a document nobody could identify is not "classified with
  // low confidence", and one that is the wrong document is a problem even at high confidence.
  let status: DocumentAnalysis["status"];
  if (!recognised) {
    status = "unsupported";
  } else if (mismatchedRequirement) {
    status = "rejected";
  } else if (freshness) {
    status = "outdated";
  } else if (bandFor(result.classification.confidence) !== "certain") {
    status = "review_required";
  } else if (Object.values(result.fields).some((f) => bandFor(f.confidence) !== "certain")) {
    // Section 14: the classification is safe but a value is not, so a human confirms before
    // anything derived from it is trusted.
    status = "review_required";
  } else {
    status = "classified";
  }

  return {
    documentId,
    classification: result.classification,
    // Section 24 assigns a DOCUMENT to a borrower. A file nobody could identify has no
    // document to assign, so an answer here would be a claim with nothing behind it — an
    // electricity bill came back attributed to borrower_01 at 96% confidence, which is
    // exactly the kind of confident noise that teaches staff to distrust the whole panel.
    person: recognised ? result.person : null,
    documentDate: result.documentDate,
    suggestedFilename: recognised
      ? suggestFilename(typeId, result.fields, result.documentDate, req.fileName)
      : null,
    fields: result.fields,
    status,
    funnelDocKey,
    mismatchedRequirement,
    freshness,
    audit: {
      originalFileName: req.fileName,
      model: provider.model,
      provider: provider.name,
      analysedAt: now.toISOString(),
      durationMs: result.durationMs,
    },
  };
}
