import { BedrockHypoProvider, bedrockHypoConfig } from "./bedrockProvider";
import type { HypoProvider } from "./extract";
import { OpenAIHypoProvider, openaiHypoConfig } from "./openaiProvider";

/**
 * Which model HYPO asks (DECISIONS V110): Claude on Bedrock when its keys are set (HYPOTEQ
 * 29.10.2026 point 2), else OpenAI — on the Preview only, never on the Production deployment —
 * else none, and HYPO carries on with chips.
 */
export function hypoProvider(env: Record<string, string | undefined> = process.env): HypoProvider | null {
  if (bedrockHypoConfig(env)) return new BedrockHypoProvider(env);
  if (openaiHypoConfig(env)) return new OpenAIHypoProvider(env);
  return null;
}
