import { client, DEFAULT_MODEL, reasoningFor } from "@/components/documentIntelligence/openaiProvider";
import type { HypoExtractRequest, HypoProvider } from "./extract";
import { buildHypoInput, buildHypoInstructions, buildHypoSchema } from "./prompt";

/**
 * OpenAI implementation of HYPO's extraction — the same client, key and data handling as the
 * document extraction (components/documentIntelligence/openaiProvider.ts), so HYPO adds no new
 * processor. `OPENAI_HYPO_MODEL` picks the model (default: the document model); the client
 * honours `OPENAI_BASE_URL`, e.g. for a regional endpoint.
 *
 * A chat waits for this: the call is capped well below the document timeout, and a timeout
 * makes HYPO carry on with chips (Konzept Kap. 9 «Fallback»), never an error on screen.
 */

const TIMEOUT_MS = (() => {
  const raw = Number((process.env.HYPO_TIMEOUT_MS ?? "").trim());
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 25_000) : 15_000;
})();

export class OpenAIHypoProvider implements HypoProvider {
  readonly name = "openai";
  readonly model = process.env.OPENAI_HYPO_MODEL || process.env.OPENAI_DOCUMENT_MODEL || DEFAULT_MODEL;

  async extract(req: HypoExtractRequest): Promise<unknown> {
    const response = await client().responses.create(
      {
        model: this.model,
        reasoning: reasoningFor(this.model),
        instructions: buildHypoInstructions(),
        input: [{ role: "user", content: [{ type: "input_text", text: buildHypoInput(req) }] }],
        // Kap. 9: the response is not kept at the provider for later retrieval (API data is not
        // used for training by default).
        store: false,
        text: { format: { type: "json_schema", name: "hypo_extraction", schema: buildHypoSchema() as Record<string, unknown>, strict: true } },
      },
      { timeout: TIMEOUT_MS }
    );
    try {
      return JSON.parse(response.output_text);
    } catch {
      throw new Error("HYPO extraction returned a response that could not be read.");
    }
  }
}
