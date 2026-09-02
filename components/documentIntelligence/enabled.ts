/**
 * Whether this deployment may run document analysis at all.
 *
 * WHY THIS EXISTS
 * ---------------
 * Document Intelligence is meant to run on the Preview deployment only for now. Until this
 * file, nothing enforced that: the route ran wherever OPENAI_API_KEY happened to be set, so
 * "preview only" rested entirely on someone remembering not to add that variable to the
 * Production scope. One person adding it "just to test once" would have switched the feature
 * on for real customers, silently, with no line in any diff to show for it.
 *
 * THE TRAP THIS AVOIDS
 * --------------------
 * The obvious check — `VERCEL_ENV !== "production"` — is wrong here, and wrong in the
 * direction that hurts: `.env.local` is pulled from Vercel's Production scope and therefore
 * sets VERCEL_ENV="production" on the developer's own machine. That check would disable the
 * feature exactly where it is being built and tested, while a genuine Preview build passed
 * it. So both signals have to agree before anything is switched off:
 *
 *   NODE_ENV      set by Next.js itself, and NOT overridable from a .env file:
 *                 "development" under `next dev`, "production" for a built deployment.
 *   VERCEL_ENV    which Vercel scope the deployment belongs to.
 *
 *   local `next dev`      development / production(from .env.local) -> ON
 *   Preview deployment    production  / preview                     -> ON
 *   Production deployment production  / production                  -> OFF
 *
 * OPT-IN, NEVER OPT-OUT. Going live in production is a decision someone has to make on
 * purpose by setting HYPOTEQ_DOCAI_IN_PRODUCTION, not a state reached by forgetting a
 * variable — the same reasoning as testMode.ts, pointed the other way: there the dangerous
 * state is "reaches real people", here it is "runs for real customers".
 */

/** Reason analysis is switched off here, or null when it may run. */
export function documentIntelligenceDisabledReason(): string | null {
  const isBuiltDeployment = process.env.NODE_ENV === "production";
  const isProductionScope = (process.env.VERCEL_ENV ?? "").trim().toLowerCase() === "production";

  if (!isBuiltDeployment || !isProductionScope) return null;

  const optIn = (process.env.HYPOTEQ_DOCAI_IN_PRODUCTION ?? "").trim().toLowerCase();
  if (optIn === "1" || optIn === "true" || optIn === "yes") return null;

  return "Document Intelligence is limited to preview deployments (set HYPOTEQ_DOCAI_IN_PRODUCTION to enable it in production).";
}

export function isDocumentIntelligenceEnabled(): boolean {
  return documentIntelligenceDisabledReason() === null;
}
