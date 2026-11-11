/**
 * The switch that makes a deployment safe to test against.
 *
 * WHY THIS EXISTS
 * ---------------
 * There is no staging. `.env.local` and every Vercel environment point at the one real
 * Postgres, the one real Salesforce org, the one real SharePoint drive and the real
 * mailboxes — so "running it locally" has never been testing, it has been production with a
 * different URL. Five test submissions on 25 August created Salesforce Cases 00001349 to
 * 00001354, real SharePoint folders, and real confirmation mail to whatever address was
 * typed in.
 *
 * With HYPOTEQ_TEST_MODE set, a submission still walks the entire funnel and still writes to
 * the database — the flow has to be genuinely exercised or the test proves nothing — but it
 * stops at every boundary that reaches someone outside: no Case is created, no mail is sent,
 * and uploads land in a clearly separate folder. The one exception is a ZZTEST submission
 * (below): it creates its real Case, for HYPOTEQ's acceptance.
 *
 * OFF BY DEFAULT, AND UNSET MEANS PRODUCTION. A misconfigured production deployment must
 * behave as production and be caught by a missing Case, never silently swallow real leads
 * because a variable was forgotten. That is why there is no "production mode" flag to
 * forget: the dangerous state has to be the one you have to ask for.
 */

/** True when this deployment must not touch Salesforce, mail, or the live document folder. */
export function isTestMode(): boolean {
  const raw = (process.env.HYPOTEQ_TEST_MODE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

// ---- Salesforce from a test deployment (HYPOTEQ 11.11.2026, DECISIONS V115) ----------------
//
// The Preview creates every Case as usual: HYPOTEQ knows who tests it and deletes those Cases
// («nicht mehr ZZTEST, normal testen»). Before (V102, 04.11.) only a submission with ZZTEST in the
// last name and a «+test» address got one. Mail stays marked «[TEST]», uploads land in ZZ-TEST_
// folders.
//
// What stays guarded is the WRITE to an existing Case (Nachreichung, Re-Upload, completeness):
// the Preview shares the production database, so it may touch only a Case it created itself —
// stamped TEST_DEPLOYMENT_KEY in the inquiry's stored answers — or a ZZTEST Case from before
// (updateCaseCompleteness.ts isTestCase). A customer's Case is never written from the Preview.

/** Key a test deployment adds to the stored v3 answers of each inquiry it creates. */
export const TEST_DEPLOYMENT_KEY = "testDeployment" as const;

/** The mark of a test record from before V115: in the Case name or the Account. */
export const ZZTEST_MARK = "ZZTEST";

/** Some text carries the ZZTEST mark (case-insensitive). */
export function hasZztestMark(...values: unknown[]): boolean {
  return values.some((v) => typeof v === "string" && v.toUpperCase().includes(ZZTEST_MARK));
}

/**
 * Log line for a side effect that was suppressed.
 *
 * Every skip is announced. A test deployment that quietly does nothing is indistinguishable
 * from a broken one, and the whole point is to be able to tell those apart.
 */
export function skipped(what: string, detail?: string): void {
  console.log(`[TEST MODE] skipped ${what}${detail ? `: ${detail}` : ""}`);
}

/**
 * Marker folded into the SharePoint folder name in test mode.
 *
 * The folder is not suppressed, because upload is the part most worth testing. It is made
 * obvious instead, so nobody mistakes a test dossier for a customer's paperwork.
 */
export const TEST_FOLDER_PREFIX = "ZZ-TEST_";

/**
 * HYPOTEQ_TEST_MAIL_TO as a list: one inbox, or several separated by commas (a ZZTEST run for
 * HYPOTEQ and the developer at once). Invalid entries are dropped.
 */
export function testInboxes(): string[] {
  return (process.env.HYPOTEQ_TEST_MAIL_TO ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/** The recipients of a routed address: several when test mode routes to a list of inboxes. */
export function recipientsOf(to: string): string[] {
  return to
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Where a mail actually goes, given who it was meant for.
 *
 * Outside test mode: unchanged. In test mode every mail still goes out through the configured
 * mailbox — testing the mails is part of testing the funnel — but marked «[TEST]»:
 * - With HYPOTEQ_TEST_MAIL_TO set, everything goes to that inbox — or those inboxes, separated
 *   by commas — with the real recipient in the subject («[TEST → kunde@…]»).
 * - Without it, each mail goes to the address that was entered in the funnel (the testers
 *   type their own), and the internal notification to info@ as usual.
 * Addresses on the reserved example domains (example.com/.ch/.org …) are never mailed: they
 * cannot receive anything and only produce bounces.
 */
export function routeMail(to: string, subject: string): { to: string; subject: string } | null {
  if (!isTestMode()) return { to, subject };
  const inbox = testInboxes().join(",");
  if (inbox) {
    console.log(`[TEST MODE] mail for ${to} redirected to ${inbox}`);
    return { to: inbox, subject: `[TEST → ${to}] ${subject}` };
  }
  if (/@([^@]+\.)?example\.[a-z]+$/i.test(to.trim())) {
    skipped("mail", `"${subject}" to ${to} (reserved example address)`);
    return null;
  }
  console.log(`[TEST MODE] mail sent to ${to} marked as test`);
  return { to, subject: `[TEST] ${subject}` };
}
