/**
 * HYPO on the server (Konzept Kap. 1.1, 9): one model call per free-text message, and the rules
 * that do not trust it — every field key must be on the whitelist and every value must pass the
 * field's own check (lib/funnel-v3/hypo/fields.ts coerce), intents are an enum, notes are cut to
 * length. What fails a check is dropped, never repaired.
 *
 * The gate is the one of the document extraction (components/documentIntelligence/enabled.ts),
 * with its own opt-in: on the Production deployment HYPO is off until HYPOTEQ sets
 * HYPOTEQ_HYPO_IN_PRODUCTION (their release, 29.10.2026 point 10). The model is Claude on AWS
 * Bedrock from Zürich (./bedrockProvider.ts, HYPOTEQ 29.10.2026 point 2).
 */

import { coerce, isHypoKey, type HypoKey, type HypoValue } from "@/lib/funnel-v3/hypo/fields";
import { INTENTS, type HypoIntent } from "./prompt";
import { bedrockHypoConfig } from "./bedrockProvider";

export interface HypoExtractRequest {
  lang: string;
  role: string;
  /** Id of the question on screen (`antrag`, `kaufpreis` …); null for the opening message. */
  question: string | null;
  /** Its text as the customer read it — context for the model. */
  questionText: string | null;
  message: string;
}

export interface HypoExtractField {
  key: HypoKey;
  value: HypoValue;
  confidence: number;
}

export interface HypoExtractResult {
  fields: HypoExtractField[];
  intents: HypoIntent[];
  extras: string[];
  advisorQuestion: string | null;
}

export interface HypoProvider {
  readonly name: string;
  readonly model: string;
  extract(req: HypoExtractRequest): Promise<unknown>;
}

export const MAX_MESSAGE = 1500;
const MAX_EXTRAS = 4;
const MAX_EXTRA = 80;
const MAX_QUESTION = 200;

const clamp01 = (n: unknown) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
};
const clean = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Words that never belong in a note HYPO shows or files (DECISIONS V92 «nur HYPOTEQ»): the model
 * talking about itself, its maker or its instructions, whatever a message tried.
 */
const ABOUT_ITSELF =
  /(open ?ai|chat ?gpt|\bgpt|anthropic|claude|gemini|llama|mistral|deepseek|\bllm\b|\bk\.?i\.?\b|\ba\.?i\.?\b|\bia\b|künstlich|artificial|artificiel|artificiale|intelligen|sprachmodell|language model|modèle|modello|\bmodel|prompt|instruction|anweisung|istruzion|system|assistant|assistent|\bbot\b)/i;

const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 || /^\d+$/.test(w));

/** A note the model wrote is kept only when it is the person's own: enough of its words are in the message. */
function fromMessage(note: string, message: string, share: number): boolean {
  if (!note || ABOUT_ITSELF.test(note)) return false;
  const own = new Set(words(message));
  const w = words(note);
  if (!w.length) return false;
  return w.filter((x) => own.has(x)).length / w.length >= share;
}

/**
 * The model's answer through the whitelist. Pure. With the message, the free-text parts are checked
 * against it: an extra must share a word with it, the advisor question most of its words — and
 * neither may talk about AI, models, providers or prompts (else it is dropped; the controller then
 * files the person's own question).
 */
export function validateHypoResult(raw: unknown, message = ""): HypoExtractResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const byKey = new Map<HypoKey, HypoExtractField>();
  for (const f of Array.isArray(r.fields) ? r.fields : []) {
    if (!f || typeof f !== "object") continue;
    const { key, value, confidence } = f as Record<string, unknown>;
    if (!isHypoKey(key)) continue;
    const v = coerce(key, value);
    if (v === null) continue;
    const c = clamp01(confidence);
    const prev = byKey.get(key);
    if (!prev || prev.confidence < c) byKey.set(key, { key, value: v, confidence: c });
  }
  const intents = [...new Set((Array.isArray(r.intents) ? r.intents : []).filter((i): i is HypoIntent => (INTENTS as readonly string[]).includes(i as string)))];
  const checked = Boolean(message);
  const extras = (Array.isArray(r.extras) ? r.extras : [])
    .map((e) => clean(e, MAX_EXTRA))
    .filter((e) => e && (!checked || fromMessage(e, message, 0.01)))
    .slice(0, MAX_EXTRAS);
  const q = clean(r.advisorQuestion, MAX_QUESTION);
  return { fields: [...byKey.values()], intents, extras, advisorQuestion: q && (!checked || fromMessage(q, message, 0.6)) ? q : null };
}

/** Reason HYPO is switched off on this deployment, or null when it may run. */
export function hypoDisabledReason(): string | null {
  const isBuiltDeployment = process.env.NODE_ENV === "production";
  const isProductionScope = (process.env.VERCEL_ENV ?? "").trim().toLowerCase() === "production";
  if (!isBuiltDeployment || !isProductionScope) return null;
  const optIn = (process.env.HYPOTEQ_HYPO_IN_PRODUCTION ?? "").trim().toLowerCase();
  if (optIn === "1" || optIn === "true" || optIn === "yes") return null;
  return "HYPO is limited to preview deployments (set HYPOTEQ_HYPO_IN_PRODUCTION to enable it in production).";
}

/** Whether the model can be asked at all (HYPO still runs without: chips and plain answers). */
export function hypoModelConfigured(): boolean {
  return bedrockHypoConfig() !== null;
}

const LANGS = ["de", "en", "fr", "it"] as const;

/**
 * The HYPOTEQ Academy link per language (Konzept Kap. 6, offener Punkt 1): HYPO_ACADEMY_URL_DE …
 * _IT, else HYPO_ACADEMY_URL; only https. No link → the offer is not made.
 */
export function academyLinks(): Partial<Record<(typeof LANGS)[number], string>> {
  const out: Partial<Record<(typeof LANGS)[number], string>> = {};
  const fallback = (process.env.HYPO_ACADEMY_URL ?? "").trim();
  for (const l of LANGS) {
    const url = (process.env[`HYPO_ACADEMY_URL_${l.toUpperCase()}`] ?? "").trim() || fallback;
    if (/^https:\/\/[^\s]+$/i.test(url)) out[l] = url;
  }
  return out;
}

/** Log line of an extraction: keys and confidences, never a value (as the document extraction). */
export function extractionLogLine(req: Pick<HypoExtractRequest, "lang" | "question">, res: HypoExtractResult, ms: number, model: string): string {
  const fields = res.fields.map((f) => `${f.key} ${Math.round(f.confidence * 100)}%`).join(", ");
  return `[HYPO] ${req.lang} q=${req.question ?? "start"} -> ${res.fields.length} field(s)${fields ? ` [${fields}]` : ""}, intents=[${res.intents.join(",")}], extras=${res.extras.length}, ${model}, ${ms}ms`;
}
