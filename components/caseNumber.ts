import { randomInt } from "crypto";

/**
 * The HYPOTEQ case number, `HQ-JJ-MM-NNNNNN` (DECISIONS D1, spec 5.1 example HQ-26-06-156283).
 *
 * Minted by the funnel at submit and stored on the Inquiry, not taken from Salesforce: the
 * sync is allowed to fail, and file names and the dossier need the number regardless.
 * JJ-MM is the Swiss calendar month of the submission; NNNNNN is random, so the number
 * reveals nothing about volume. Uniqueness is enforced by the database (Inquiry.caseNumber
 * is @unique); a collision just draws again.
 */

export const CASE_NUMBER_RE = /^HQ-\d{2}-\d{2}-\d{6}$/;
export const MAX_ATTEMPTS = 5;

/** The part of the Prisma client this needs — keeps tests free of a real client. */
export interface CaseNumberStore {
  inquiry: {
    update(args: { where: { id: string }; data: { caseNumber: string }; select?: { id: true } }): Promise<unknown>;
  };
}

/** «26-10» for a date in October 2026, in Swiss time (a submission at 00:30 on the 1st counts for the new month). */
function yearMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "2-digit",
    month: "2-digit",
  }).formatToParts(now);
  const yy = parts.find((p) => p.type === "year")?.value ?? "";
  const mm = parts.find((p) => p.type === "month")?.value ?? "";
  return `${yy}-${mm}`;
}

export function formatCaseNumber(now: Date, digits: number): string {
  return `HQ-${yearMonth(now)}-${String(digits).padStart(6, "0")}`;
}

export function randomCaseNumber(now: Date, rng: () => number = () => randomInt(0, 1_000_000)): string {
  return formatCaseNumber(now, rng());
}

/** True for Prisma's unique-constraint error on caseNumber (P2002). */
function isCaseNumberCollision(err: any): boolean {
  if (err?.code !== "P2002") return false;
  const target = err?.meta?.target;
  if (target == null) return true;
  return Array.isArray(target) ? target.some((t: string) => /caseNumber/.test(t)) : /caseNumber/.test(String(target));
}

/**
 * Draw a case number and store it on the inquiry, drawing again on a unique collision (up
 * to MAX_ATTEMPTS). Writing it is the reservation — checking first and writing later would
 * leave a window for two submissions to take the same number. Throws when no number could
 * be stored; the caller keeps the inquiry either way.
 */
export async function allocateCaseNumber(
  prisma: CaseNumberStore,
  now: Date,
  inquiryId: string,
  rng?: () => number
): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const caseNumber = randomCaseNumber(now, rng);
    try {
      await prisma.inquiry.update({ where: { id: inquiryId }, data: { caseNumber }, select: { id: true } });
      return caseNumber;
    } catch (err) {
      if (!isCaseNumberCollision(err)) throw err;
      lastError = err;
      console.warn(`[Case number] ${caseNumber} is taken (attempt ${attempt}/${MAX_ATTEMPTS}), drawing again`);
    }
  }
  throw new Error(`[Case number] no free number after ${MAX_ATTEMPTS} attempts: ${String((lastError as any)?.message ?? lastError)}`);
}
