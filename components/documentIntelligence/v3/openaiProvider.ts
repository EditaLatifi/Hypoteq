import { client, DEFAULT_MODEL, reasoningFor } from "../openaiProvider";
import { buildV3Instructions, buildV3Schema } from "./prompt";
import type { V3DocumentProvider, V3ProviderInput, V3ProviderResult } from "./types";

/**
 * OpenAI implementation of the v3 provider. Shares the client of ../openaiProvider.ts, and with
 * it the rules that keep a request inside the 60 s function limit: our own 45 s timeout and no
 * retry (a second attempt cannot fit, and a platform kill returns nothing at all, where our own
 * timeout becomes a file the customer can still assign by hand).
 *
 * Swapping vendor = a sibling of this file implementing V3DocumentProvider with the same
 * instructions and schema from ./prompt.
 */
export class OpenAIV3DocumentProvider implements V3DocumentProvider {
  readonly name = "openai";
  readonly model = process.env.OPENAI_DOCUMENT_MODEL || DEFAULT_MODEL;

  async analyseV3(input: V3ProviderInput): Promise<V3ProviderResult> {
    const started = Date.now();
    const base64 = input.data.toString("base64");
    const isImage = input.mimeType.startsWith("image/");

    const response = await client().responses.create({
      model: this.model,
      reasoning: reasoningFor(this.model),
      instructions: buildV3Instructions(),
      input: [
        {
          role: "user",
          content: [
            isImage
              ? { type: "input_image", image_url: `data:${input.mimeType};base64,${base64}`, detail: "high" }
              : {
                  // Whole PDF: a multi-page document is one document.
                  type: "input_file",
                  filename: input.fileName,
                  file_data: `data:${input.mimeType};base64,${base64}`,
                },
            { type: "input_text", text: `Uploaded filename (an unreliable hint only): ${input.fileName}` },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "hypoteq_v3_document",
          schema: buildV3Schema() as Record<string, unknown>,
          strict: true,
        },
      },
    });
    const durationMs = Date.now() - started;

    let parsed: any;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      throw new Error("The document service returned a response that could not be read.");
    }
    return parseV3ProviderJson(parsed, durationMs);
  }
}

/** Defensive read of the model's JSON (the schema is strict, the code still does not trust it). */
export function parseV3ProviderJson(parsed: any, durationMs: number): V3ProviderResult {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    docType: typeof parsed?.docType === "string" ? parsed.docType : "unknown",
    confidence: Number(parsed?.confidence) || 0,
    personName: str(parsed?.personName),
    bank: str(parsed?.bank),
    docDate: str(parsed?.docDate),
    note: str(parsed?.note),
    fields: Array.isArray(parsed?.fields)
      ? parsed.fields
          .filter((f: any) => f && typeof f.key === "string")
          .map((f: any) => ({
            key: f.key,
            value: f.value === null || f.value === undefined ? null : String(f.value),
            confidence: Number(f.confidence) || 0,
          }))
      : [],
    durationMs,
  };
}
