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
 * and uploads land in a clearly separate folder.
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
 * Where a mail actually goes, given who it was meant for.
 *
 * Outside test mode: unchanged. In test mode every mail still goes out through the configured
 * mailbox — testing the mails is part of testing the funnel — but marked «[TEST]»:
 * - With HYPOTEQ_TEST_MAIL_TO set, everything goes to that one inbox, with the real recipient
 *   in the subject («[TEST → kunde@…]»).
 * - Without it, each mail goes to the address that was entered in the funnel (the testers
 *   type their own), and the internal notification to info@ as usual.
 * Addresses on the reserved example domains (example.com/.ch/.org …) are never mailed: they
 * cannot receive anything and only produce bounces.
 */
export function routeMail(to: string, subject: string): { to: string; subject: string } | null {
  if (!isTestMode()) return { to, subject };
  const inbox = (process.env.HYPOTEQ_TEST_MAIL_TO ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox)) {
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
