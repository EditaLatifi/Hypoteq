import { loadPruefregeln } from "@/lib/funnel-v3/abgleich/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Prüfregeln for the funnel's Abgleich before the closing (Spezifikation Datenabgleich 3,
 * 4.3): HYPOTEQ's configuration from `Pruefregel__c`, cached for 15 minutes on the server, the
 * built-in start values when Salesforce is out of reach. No customer data — tolerances and
 * thresholds only, so the browser may cache it for a few minutes too.
 *
 *   GET /api/funnel/pruefregeln → { from: "salesforce" | "fallback", rules: PruefRegel[] }
 */
export async function GET() {
  const { rules, from } = await loadPruefregeln();
  return Response.json({ from, rules }, { headers: { "Cache-Control": "private, max-age=300" } });
}
