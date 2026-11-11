import OpenAI from "openai";
import type { HypoExtractRequest, HypoProvider } from "./extract";
import { buildHypoInput, buildHypoInstructions, buildHypoSchema } from "./prompt";
import { reasoningFor } from "@/components/documentIntelligence/openaiProvider";

/**
 * HYPO on OpenAI, for the Preview only (DECISIONS V110, 11.11.2026): HYPOTEQ chose Claude on AWS
 * Bedrock (29.10.2026 point 2, ./bedrockProvider.ts), but no AWS keys exist, so the Preview test
 * ran HYPO without a model — chips only, free text not understood (Komplett-Test 06.11. C01, C02,
 * C05). The Preview already has OPENAI_API_KEY for the document recognition; HYPO uses it there.
 *
 * Never on the Production deployment: there HYPOTEQ's «nicht OpenAI» stands, whatever keys are
 * set. Bedrock, once configured, goes first everywhere (./provider.ts).
 *
 * Same contract as Bedrock: one call per message, the HYPO schema strict, the answer through
 * `validateHypoResult`; a timeout makes HYPO carry on with chips.
 */

export const DEFAULT_OPENAI_HYPO_MODEL = "gpt-5.5";

const TIMEOUT_MS = (() => {
  const raw = Number((process.env.HYPO_TIMEOUT_MS ?? "").trim());
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 25_000) : 15_000;
})();

interface OpenAIHypoConfig {
  apiKey: string;
  model: string;
}

/**
 * The configuration, or null: no key, or the Production deployment (a built app in Vercel's
 * Production scope — the same two signals as components/documentIntelligence/enabled.ts, so
 * `next dev` with the Production-pulled .env.local still counts as development).
 */
export function openaiHypoConfig(env: Record<string, string | undefined> = process.env): OpenAIHypoConfig | null {
  const productionDeployment = env.NODE_ENV === "production" && (env.VERCEL_ENV ?? "").trim().toLowerCase() === "production";
  if (productionDeployment) return null;
  const apiKey = (env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;
  return { apiKey, model: (env.HYPO_OPENAI_MODEL ?? "").trim() || DEFAULT_OPENAI_HYPO_MODEL };
}

export class OpenAIHypoProvider implements HypoProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly config: OpenAIHypoConfig | null;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.config = openaiHypoConfig(env);
    this.model = this.config?.model ?? DEFAULT_OPENAI_HYPO_MODEL;
  }

  async extract(req: HypoExtractRequest): Promise<unknown> {
    const c = this.config;
    if (!c) throw new Error("HYPO's model is not configured on this deployment.");
    const client = new OpenAI({ apiKey: c.apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const response = await client.responses.create({
      model: c.model,
      // Reading a few fields out of one message: low effort keeps the chat quick.
      reasoning: reasoningFor(c.model),
      instructions: buildHypoInstructions(),
      input: [{ role: "user", content: [{ type: "input_text", text: buildHypoInput(req) }] }],
      text: { format: { type: "json_schema", name: "hypo_extraction", schema: buildHypoSchema() as Record<string, unknown>, strict: true } },
      // Nothing of the conversation is kept at OpenAI beyond the call.
      store: false,
    });
    if (response.status === "incomplete") throw new Error(`HYPO extraction stopped (${response.incomplete_details?.reason ?? "incomplete"}).`);
    try {
      return JSON.parse(response.output_text);
    } catch {
      throw new Error("HYPO extraction returned a response that could not be read.");
    }
  }
}
