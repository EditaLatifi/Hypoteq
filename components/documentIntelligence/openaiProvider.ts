import OpenAI from "openai";
import type {
  Classification,
  DocumentIntelligenceProvider,
  ExtractedField,
  ProviderInput,
  ProviderResult,
} from "./types";
import { DOCUMENT_TYPES, docTypeById } from "./documentTypes";

/**
 * The OpenAI implementation of the Document Intelligence provider.
 *
 * This is the ONLY file in the feature that imports a vendor SDK. Spec section 30 requires
 * the funnel to survive a change of provider, so everything upstream speaks the neutral
 * types in ./types and never sees an OpenAI object. Swapping vendor means writing a sibling
 * of this file.
 *
 * Model is configurable rather than hard-coded, because tuning it is a cost and accuracy
 * decision HYPOTEQ will want to make without a deploy.
 */

const DEFAULT_MODEL = "gpt-5.5";

/**
 * How long one analysis may take before it is abandoned.
 *
 * The SDK's own default is ten minutes with two retries — half an hour in the worst case,
 * for a request the serverless function is killed out from under at 120 seconds and a
 * customer stopped watching after twenty. Measured: a document that matches one of the
 * candidate types comes back in 8-18s, while one that matches none took 114s and, on
 * another run, over 180s — the model spends its time trying not to force a wrong answer.
 *
 * So the cap sits above the honest slow case and below the function's own limit, leaving
 * room for the response to be written. A timeout is not a lost document: section 38 turns it
 * into manual classification, which is a far better outcome than a spinner that never ends.
 */
const TIMEOUT_MS = Number(process.env.DOCAI_TIMEOUT_MS ?? 90_000);

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // A clear failure here beats an SDK error 3 stack frames deep, and the route turns this
    // into a "manual classification still works" response rather than a broken funnel.
    throw new Error("OPENAI_API_KEY is not set — document analysis is unavailable.");
  }
  // One retry, not two: a retry of a request that already ran out of time costs the customer
  // the same wait again and rarely ends differently.
  return new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
}

/**
 * Reasoning effort, for the models that have the setting.
 *
 * Reading a value off a payslip is not a reasoning problem — the answer is printed on the
 * page. The default effort is what made an unrecognisable document take almost two minutes:
 * the model deliberates over a choice it should simply decline. Low effort is the right
 * setting for extraction, and section 21 already says declining is a valid answer.
 *
 * Applied only to the model families that accept it, so setting OPENAI_DOCUMENT_MODEL to
 * something older does not turn every request into a 400.
 */
function reasoningFor(model: string): { effort: "low" } | undefined {
  return /^(gpt-5|o[134])/.test(model) ? { effort: "low" } : undefined;
}

/**
 * JSON Schema the model must answer in (section 27).
 *
 * Built per request from the candidate types, so the model can only name a document type
 * this case could plausibly have, and can only emit field keys that type defines. Letting it
 * invent keys would push validation into every consumer downstream.
 */
function buildSchema(candidates: string[]) {
  const fieldKeys = new Set<string>();
  for (const id of candidates) {
    for (const f of docTypeById(id)?.fields ?? []) fieldKeys.add(f.key);
  }

  const fieldProperties: Record<string, unknown> = {};
  for (const key of fieldKeys) {
    fieldProperties[key] = {
      type: ["object", "null"],
      properties: {
        value: { type: ["string", "number", "boolean", "null"] },
        unit: { type: ["string", "null"] },
        confidence: { type: "number" },
      },
      required: ["value", "unit", "confidence"],
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    properties: {
      classification: {
        type: "object",
        properties: {
          // "unknown" is a first-class answer (section 21): a document that cannot be
          // placed must be reported as such, never forced into the nearest type.
          type: { type: "string", enum: [...candidates, "unknown"] },
          confidence: { type: "number" },
        },
        required: ["type", "confidence"],
        additionalProperties: false,
      },
      person: {
        type: ["object", "null"],
        properties: {
          borrowerId: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
        required: ["borrowerId", "confidence"],
        additionalProperties: false,
      },
      documentDate: { type: ["string", "null"] },
      fields: {
        type: "object",
        properties: fieldProperties,
        required: [...fieldKeys],
        additionalProperties: false,
      },
    },
    required: ["classification", "person", "documentDate", "fields"],
    additionalProperties: false,
  };
}

function buildInstructions(input: ProviderInput): string {
  const types = input.candidateTypes
    .map((id) => {
      const spec = docTypeById(id);
      if (!spec) return null;
      const fields = spec.fields.map((f) => `${f.key} (${f.label}, ${f.kind})`).join(", ");
      return `- ${id} — ${spec.label}. Extract: ${fields}`;
    })
    .filter(Boolean)
    .join("\n");

  const borrowers = input.borrowers.length
    ? input.borrowers.map((b) => `- ${b.id}: ${b.name}`).join("\n")
    : "- (none given)";

  // No deadlines, thresholds or completeness rules are stated here. Section 25 requires
  // those to be configurable, and section 3 keeps "what is required" with HYPOTEQ's rules —
  // this prompt only answers "what is this document and what does it say".
  return [
    "You analyse documents submitted with Swiss mortgage applications.",
    "",
    "Decide which of the listed document types this file is, and extract the fields defined",
    "for that type. Swiss German financial vocabulary and Swiss number formats apply:",
    "\"CHF 142'300.00\" means 142300. Return money as plain numbers with unit \"CHF\", and",
    "dates as ISO (YYYY-MM-DD).",
    "",
    "Document types to choose between:",
    types,
    "",
    "Borrowers on this application:",
    borrowers,
    "",
    "Rules:",
    "- Read every page. Key values are often not on the first one.",
    "- Set a field to null when the document does not state it. Never infer, average or",
    "  calculate a value that is not printed — a wrong number here is worse than a missing",
    "  one, because it is compared against what the customer declared.",
    "- confidence is your own probability that the value is right, from 0 to 1. Reserve",
    "  values above 0.9 for things you read directly off the document.",
    "- Classify as \"unknown\" when the file is not one of the listed types, including when it",
    "  is a perfectly ordinary document of some other kind. Do not force a nearest match.",
    "- documentDate is the date the document itself carries (issue date, or the end of the",
    "  period it covers), never today's date.",
    "- person.borrowerId names the borrower the document belongs to, matched on the names",
    "  printed in it. Use null when it is unclear; the user will be asked.",
  ].join("\n");
}

function toExtractedFields(raw: unknown): Record<string, ExtractedField> {
  const out: Record<string, ExtractedField> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, v] of Object.entries(raw as Record<string, any>)) {
    // The schema allows null for "not present"; drop those rather than carrying empties
    // through to the UI, which would show a row per field the document never had.
    if (!v || typeof v !== "object" || v.value === null || v.value === undefined) continue;
    const confidence = typeof v.confidence === "number" ? v.confidence : 0;
    out[key] = {
      value: v.value,
      unit: v.unit ?? null,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }
  return out;
}

export class OpenAIDocumentProvider implements DocumentIntelligenceProvider {
  readonly name = "openai";
  readonly model = process.env.OPENAI_DOCUMENT_MODEL || DEFAULT_MODEL;

  async analyse(input: ProviderInput): Promise<ProviderResult> {
    const candidates = input.candidateTypes.length
      ? input.candidateTypes
      : DOCUMENT_TYPES.map((t) => t.id);

    const started = Date.now();
    const base64 = input.data.toString("base64");
    const isImage = input.mimeType.startsWith("image/");

    const response = await client().responses.create({
      model: this.model,
      reasoning: reasoningFor(this.model),
      instructions: buildInstructions({ ...input, candidateTypes: candidates }),
      input: [
        {
          role: "user",
          content: [
            isImage
              ? {
                  type: "input_image",
                  image_url: `data:${input.mimeType};base64,${base64}`,
                  detail: "high",
                }
              : {
                  // A PDF goes in whole: section 23 requires multi-page documents to be read
                  // as one document, so it must not be split into per-page images here.
                  type: "input_file",
                  filename: input.fileName,
                  file_data: `data:${input.mimeType};base64,${base64}`,
                },
            {
              type: "input_text",
              // The filename is a weak hint and is given as exactly that: customers upload
              // IMG_4829.pdf, and a name like "Lohnausweis.pdf" on the wrong file must not
              // override what the pages actually show.
              text: `Uploaded filename (an unreliable hint only): ${input.fileName}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "hypoteq_document_analysis",
          schema: buildSchema(candidates) as Record<string, unknown>,
          strict: true,
        },
      },
    });

    const durationMs = Date.now() - started;

    let parsed: any;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      // Section 38: an invalid model answer must not break the funnel. The route turns this
      // into a document the user can classify by hand.
      throw new Error("The document service returned a response that could not be read.");
    }

    const typeId: string = parsed?.classification?.type ?? "unknown";
    const spec = docTypeById(typeId);
    const classification: Classification = {
      type: typeId,
      label: spec?.label ?? "Nicht erkannt",
      confidence: Math.max(0, Math.min(1, Number(parsed?.classification?.confidence) || 0)),
    };

    const person =
      parsed?.person && typeof parsed.person === "object"
        ? {
            borrowerId: parsed.person.borrowerId ?? null,
            confidence: Math.max(0, Math.min(1, Number(parsed.person.confidence) || 0)),
          }
        : null;

    return {
      classification,
      person,
      documentDate: typeof parsed?.documentDate === "string" ? parsed.documentDate : null,
      fields: toExtractedFields(parsed?.fields),
      durationMs,
    };
  }
}
