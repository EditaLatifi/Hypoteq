import { conn, login } from "@/components/salesforceApi";
import { isTestMode, skipped } from "@/components/testMode";
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

/**
 * What the Case currently holds in Dokumenten_Check_State__c, or null.
 *
 * Deliberately forgiving: a Case that cannot be read must not cost the Nachreichung its
 * Dok_*__c flags, so every failure here degrades to "no previous state". The only thing
 * lost then is a caseworker's manual ticks, which the caller guards by writing nothing
 * when there is nothing to merge.
 */
async function readDokumentenCheckState(caseId: string): Promise<string | null> {
  const soql = `SELECT Dokumenten_Check_State__c FROM Case WHERE Id = '${caseId.replace(/'/g, "")}'`;
  const query = async () => (await conn.query(soql)) as any;
  let result: any;
  try {
    result = await query();
  } catch (error: any) {
    const message: string = error?.data?.message || error?.message || "";
    const code: string = error?.errorCode || error?.data?.errorCode || "";
    if (code === "INVALID_SESSION_ID" || /session expired or invalid/i.test(message) || !conn.accessToken) {
      await login();
      result = await query();
    } else {
      throw error;
    }
  }
  return result?.records?.[0]?.Dokumenten_Check_State__c ?? null;
}

export async function updateCaseCompleteness(
  caseId: string,
  update: CompletenessUpdate
): Promise<void> {
  if (!caseId) return;
  if (isTestMode()) {
    skipped("Case completeness update", `${caseId} (+${update.supplied.length} supplied)`);
    return;
  }

  const fields: Record<string, any> = {
    Id: caseId,
    Documents_completed__c: update.complete,
  };

  // Tick what just arrived in the Dokumenten-Check tab as well. Unlike the submit-time sync,
  // this MUST merge: the Case already has state — written at submit time and very possibly
  // edited by a caseworker since — and replacing it would silently undo their ticks. Reading
  // first costs one query on a path that runs once per Nachreichung.
  try {
    const { buildDokumentenCheckState, unmappedSupplied } = await import("./dokumentenCheckState");
    const existing = await readDokumentenCheckState(caseId);
    const merged = buildDokumentenCheckState(update.supplied, existing);
    if (merged) fields.Dokumenten_Check_State__c = merged;

    const notShown = unmappedSupplied(update.supplied);
    if (notShown.length) {
      console.warn(
        `[Salesforce] Case ${caseId}: ${notShown.length} nachgereichte document(s) have no ` +
          `Dokumenten-Check entry and will not appear in the tab: ${notShown.join(", ")}`
      );
    }
  } catch (error) {
    // A dossier that cannot pre-tick the tab is still a dossier worth recording. The
    // booleans and Documents_completed__c below carry on regardless.
    console.error(`[Salesforce] Case ${caseId}: Dokumenten-Check state not updated:`, error);
  }

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
