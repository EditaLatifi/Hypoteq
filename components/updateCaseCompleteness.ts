import { conn, login } from "@/components/salesforceApi";
import { DOCUMENT_CATALOG } from "@/components/funnelDocumentCatalog";

/**
 * Push a revised completeness verdict onto an existing Case (spec V2: "Uploads werden dem
 * bestehenden Case zugeordnet").
 *
 * This is the Nachreichung counterpart of what syncFunnelStepsToSalesforce writes at
 * submit time. It updates the Case in place rather than going through the funnel sync,
 * because nothing else about the dossier changed — re-running the full sync would rewrite
 * dozens of fields from stale data just to flip one boolean.
 */

interface CompletenessUpdate {
  complete: boolean;
  /** i18n keys still missing after this Nachreichung. */
  missing: string[];
  /** i18n keys supplied by this Nachreichung. */
  supplied: string[];
  submissionId: string;
}

// Same resolution the submit-time sync uses: German labels, because the Dokumenten-Check
// tab is read by HYPOTEQ staff whatever language the customer used.
function resolveDocLabelsDe(keys: string[]): string[] {
  let de: any = {};
  try { de = require("@/messages/de.json"); } catch { /* label lookup is best-effort */ }
  return keys.map((key) => {
    const [ns, name] = key.split(".");
    return de?.[ns]?.[name] || key;
  });
}

export async function updateCaseCompleteness(
  caseId: string,
  update: CompletenessUpdate
): Promise<void> {
  if (!caseId) return;

  const NEWLINE = String.fromCharCode(10);
  const missingLabels = resolveDocLabelsDe(update.missing);

  const state = update.complete
    ? "Dossier vollständig (nachgereicht)"
    : `Fehlende Unterlagen (${missingLabels.length}):` +
      NEWLINE +
      missingLabels.map((m) => `- ${m}`).join(NEWLINE);

  // Dokumenten_Check_State__c is a JSON "checked map" driving the Dokumenten-Check tab,
  // not free text. Writing prose into it destroys that state, so it stays untouched until
  // Salesforce supplies the schema. `state` is kept for the log line below.
  void state;
  const fields: Record<string, any> = {
    Id: caseId,
    Documents_completed__c: update.complete,
  };

  // Flip the per-document booleans for what just arrived. Only ever set to true here:
  // a Nachreichung adds documents, it never withdraws one, so clearing a flag that some
  // other path set would lose information.
  for (const key of update.supplied) {
    const field = DOCUMENT_CATALOG[key]?.salesforceField;
    if (field) fields[field] = true;
  }

  const run = async () => (conn.sobject("Case") as any).update(fields);

  try {
    await run();
  } catch (error: any) {
    const code: string = error?.errorCode || error?.data?.errorCode || "";
    const message: string = error?.data?.message || error?.message || "";
    // The module-level connection may have no session yet in this process, or a stale one.
    // Re-authenticate once and retry — the same lazy strategy the read path uses, because
    // each client-credentials token opens a new session and eager logins retire the one
    // currently in flight.
    if (
      code === "INVALID_SESSION_ID" ||
      /session expired or invalid/i.test(message) ||
      /INVALID_SESSION_ID/i.test(message) ||
      !conn.accessToken
    ) {
      await login();
      await run();
    } else {
      throw error;
    }
  }

  console.log(
    `[Salesforce] Case ${caseId} completeness updated: complete=${update.complete}, ` +
      `supplied=${update.supplied.length}, still missing=${update.missing.length}`
  );
}
