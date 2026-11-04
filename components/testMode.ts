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

// ---- ZZTEST mode: a real Salesforce Case from a test deployment (HYPOTEQ 03.11.2026, 2.3) ----
//
// HYPOTEQ's acceptance test needs a preview run to create a real Case («erkennbar als Test»).
// HYPOTEQ 04.11.2026 (Fisnik, Punkt 2; DECISIONS V102): it runs on the name match alone — the
// Kreditnehmer's last name contains ZZTEST and the e-mail address is a «+test» one — with no
// further switch. Such a submission creates its Case in test mode too; every other submission
// is still withheld, mail is still marked «[TEST]», uploads still land in ZZ-TEST_ folders.

/** The mark of a test record: in the Kreditnehmer's last name or the company. */
export const ZZTEST_MARK = "ZZTEST";

/** Some text carries the ZZTEST mark (case-insensitive). */
export function hasZztestMark(...values: unknown[]): boolean {
  return values.some((v) => typeof v === "string" && v.toUpperCase().includes(ZZTEST_MARK));
}

/** A «+test» address: `name+test@…`, `name+test2@…`. */
export function isTestAddress(v: unknown): boolean {
  return typeof v === "string" && /\+test[^@\s]*@/i.test(v.trim());
}

/**
 * A ZZTEST submission (the /api/inquiry body): a Kreditnehmer's last name — or the company —
 * contains ZZTEST, and an address entered (the customer's, or the Berater's) is a «+test» one.
 */
export function isZztestSubmission(data: unknown): boolean {
  const d = (data ?? {}) as {
    client?: { lastName?: unknown; email?: unknown };
    lastName?: unknown;
    email?: unknown;
    v3?: { txt?: { nach?: unknown; firma?: unknown; mail?: unknown; bmail?: unknown }; borrowers?: unknown };
  };
  const borrowers = Array.isArray(d.v3?.borrowers) ? (d.v3!.borrowers as { nach?: unknown }[]).map((b) => b?.nach) : [];
  const named = hasZztestMark(d.client?.lastName, d.lastName, d.v3?.txt?.nach, d.v3?.txt?.firma, ...borrowers);
  const addressed = [d.client?.email, d.email, d.v3?.txt?.mail, d.v3?.txt?.bmail].some(isTestAddress);
  return named && addressed;
}

/** The submission may go to Salesforce: always outside test mode; in test mode only a ZZTEST submission. */
export function salesforceAllowedFor(data: unknown): boolean {
  return !isTestMode() || isZztestSubmission(data);
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
