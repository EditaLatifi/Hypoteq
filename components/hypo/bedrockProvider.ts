import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { HypoExtractRequest, HypoProvider } from "./extract";
import { buildHypoInput, buildHypoInstructions, buildHypoSchema } from "./prompt";

/**
 * Claude on AWS Bedrock, called from the Swiss region Zürich (HYPOTEQ 29.10.2026, point 2: «nicht
 * OpenAI», set). Bedrock keeps no prompt or answer and trains on nothing; the account's model
 * invocation logging stays off.
 *
 * AWS has no in-region inference in eu-central-2 for current Claude models: from Zürich they run
 * through the EU inference profile (`eu.` model id: Zürich, Frankfurt, Stockholm, Milan, Spain,
 * Ireland, Paris). A `global.` / `us.` / … id would leave Europe, so `bedrockHypoConfig` refuses it
 * and HYPO carries on without the model.
 *
 * Vercel reserves the AWS_* names, hence BEDROCK_*: an IAM user's key pair
 * (BEDROCK_AWS_ACCESS_KEY_ID + BEDROCK_AWS_SECRET_ACCESS_KEY) or a Bedrock API key
 * (BEDROCK_API_KEY). BEDROCK_HYPO_MODEL / BEDROCK_AWS_REGION override the defaults below.
 *
 * A chat waits for this: the call is capped well below the function limit, and a timeout makes
 * HYPO carry on with chips (Konzept Kap. 9 «Fallback»), never an error on screen.
 */

export const DEFAULT_HYPO_MODEL = "eu.anthropic.claude-opus-5-5";
export const DEFAULT_HYPO_REGION = "eu-central-2";

const TIMEOUT_MS = (() => {
  const raw = Number((process.env.HYPO_TIMEOUT_MS ?? "").trim());
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 25_000) : 15_000;
})();

interface BedrockHypoConfig {
  model: string;
  region: string;
  apiKey: string | null;
  accessKey: string | null;
  secretKey: string | null;
}

/** The configuration, or null when the model may not be asked here (no credentials, not in Europe). */
export function bedrockHypoConfig(env: Record<string, string | undefined> = process.env): BedrockHypoConfig | null {
  const v = (name: string) => (env[name] ?? "").trim() || null;
  const model = v("BEDROCK_HYPO_MODEL") ?? DEFAULT_HYPO_MODEL;
  const region = v("BEDROCK_AWS_REGION") ?? DEFAULT_HYPO_REGION;
  // The EU profile, or a bare in-region id should AWS ever offer one in a European region.
  if (!/^eu-/.test(region) || !/^(eu\.)?anthropic\.claude-/.test(model)) return null;
  const apiKey = v("BEDROCK_API_KEY");
  const accessKey = v("BEDROCK_AWS_ACCESS_KEY_ID");
  const secretKey = v("BEDROCK_AWS_SECRET_ACCESS_KEY");
  if (!apiKey && !(accessKey && secretKey)) return null;
  return { model, region, apiKey, accessKey, secretKey };
}

export class BedrockHypoProvider implements HypoProvider {
  readonly name = "bedrock";
  readonly model: string;
  private readonly config: BedrockHypoConfig | null;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.config = bedrockHypoConfig(env);
    this.model = this.config?.model ?? DEFAULT_HYPO_MODEL;
  }

  async extract(req: HypoExtractRequest): Promise<unknown> {
    const c = this.config;
    if (!c) throw new Error("HYPO's model is not configured on this deployment.");
    // Explicit credentials only: on Vercel the default AWS chain would find the platform's own.
    const client = c.apiKey
      ? new AnthropicBedrock({ awsRegion: c.region, apiKey: c.apiKey, timeout: TIMEOUT_MS, maxRetries: 0 })
      : new AnthropicBedrock({ awsRegion: c.region, apiKey: null, awsAccessKey: c.accessKey!, awsSecretKey: c.secretKey!, timeout: TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.create({
      model: c.model,
      max_tokens: 16000,
      // The instructions are the same for every message: cached.
      system: [{ type: "text", text: buildHypoInstructions(), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildHypoInput(req) }],
      // Reading a few fields out of one message: low effort keeps the chat quick.
      output_config: { effort: "low", format: { type: "json_schema", schema: buildHypoSchema() } },
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      throw new Error(`HYPO extraction stopped (${response.stop_reason}).`);
    }
    const text = response.content.find((b) => b.type === "text");
    try {
      return JSON.parse(text?.type === "text" ? text.text : "");
    } catch {
      throw new Error("HYPO extraction returned a response that could not be read.");
    }
  }
}
