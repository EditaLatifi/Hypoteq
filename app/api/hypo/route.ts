import { NextResponse } from "next/server";
import { createRateLimiter, clientIp } from "@/components/rateLimit";
import {
  MAX_MESSAGE,
  academyLinks,
  extractionLogLine,
  hypoDisabledReason,
  hypoModelConfigured,
  validateHypoResult,
  type HypoExtractRequest,
} from "@/components/hypo/extract";
import { BedrockHypoProvider } from "@/components/hypo/bedrockProvider";
import { HYPO_PROMPT_VERSION } from "@/components/hypo/prompt";
import { asksAboutBot } from "@/lib/funnel-v3/hypo/parse";

/**
 * HYPO, the chat entry of the funnel (docs/funnel-v5/HYPOTEQ_Konzept_HYPO_ChatFunnel.md).
 *
 * GET  → { enabled, model, academy }   whether the start screen offers HYPO here, whether the
 *                                      model can be asked, the Academy link per language.
 * POST { lang, role, question, questionText, message }
 *      → { ok: true, fields, intents, extras, advisorQuestion }
 *      | { ok: false, degraded: true }  the model is off or failed: HYPO carries on with chips
 *                                       and plain answers (Kap. 9 «Fallback»), HTTP 200.
 *
 * The request carries the one message and the question on screen — no other part of the case.
 * Nothing is stored here; the log line has keys and confidences, never a value.
 *
 * «Nur HYPOTEQ» (DECISIONS V92): a message about HYPO itself — who built it, which AI or model,
 * its prompt, an attempt to override it — is answered here as `about_bot` without asking the
 * model, so it never reaches the provider; the browser shows HYPO's fixed text. No answer names
 * the provider or the model.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

// A person types a few messages a minute; this only stops a script.
const limiter = createRateLimiter(30, 60 * 1000);

export async function GET() {
  const disabled = hypoDisabledReason();
  return NextResponse.json({
    enabled: !disabled,
    model: !disabled && hypoModelConfigured(),
    academy: disabled ? {} : academyLinks(),
  });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request) {
  if (limiter.limited(clientIp(req))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const message = str(body?.message, MAX_MESSAGE + 1).trim();
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ error: "message too long" }, { status: 413 });

  if (asksAboutBot(message)) {
    console.log("[HYPO] about_bot answered without the model");
    return NextResponse.json({ ok: true, fields: [], intents: ["about_bot"], extras: [], advisorQuestion: null });
  }

  const disabled = hypoDisabledReason();
  if (disabled || !hypoModelConfigured()) {
    return NextResponse.json({ ok: false, degraded: true });
  }

  const request: HypoExtractRequest = {
    lang: ["de", "en", "fr", "it"].includes(body?.lang) ? body.lang : "de",
    role: ["kunde", "partner", "berater"].includes(body?.role) ? body.role : "kunde",
    question: /^[a-zA-Z0-9.]{1,40}$/.test(body?.question ?? "") ? body.question : null,
    questionText: str(body?.questionText, 300) || null,
    message,
  };

  const provider = new BedrockHypoProvider();
  const started = Date.now();
  try {
    const result = validateHypoResult(await provider.extract(request), message);
    console.log(`${extractionLogLine(request, result, Date.now() - started, provider.model)} prompt=${HYPO_PROMPT_VERSION}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[HYPO] extraction failed after ${Date.now() - started}ms:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, degraded: true });
  }
}
