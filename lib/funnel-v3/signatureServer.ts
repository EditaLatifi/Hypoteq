/**
 * The Auskunftsermächtigung after the closing (Handover 6, 7.1, 8; DECISIONS V11, V34–V37):
 * its state per inquiry in `InquirySignature` and the reminders.
 *
 *   recordSignatureAtSubmit   /api/inquiry, right after the Inquiry exists: «uploaded» (signed
 *                             copy in the closing) or «pending» («Später nachreichen»; also
 *                             when the closing sent neither — the form is mandatory, V34).
 *   markSignatureReceived     a signed copy arrived later (Nachreich link): «received».
 *   sendSignatureReminders    daily cron: reminder 1 from the second, reminder 2 from the fifth
 *                             calendar day (Zürich) after «Später nachreichen», never more than
 *                             two, never two on one day, a second run the same day does nothing.
 *                             To the customer in the funnel language: the prefilled PDF and the
 *                             Nachreich link, no case summary (Handover 7.1).
 *
 * Everything fails soft: the table may not exist yet (prisma/sql/2026-10-15-v5-and-portal.sql
 * not run), Graph may be down — a submission, a Nachreichung or the portal cron never breaks
 * over it; the miss is logged.
 *
 * DocuSign (Handover 6, later phase; DECISIONS V40): `method` is stored with every row; a
 * DocuSign flow would call markSignatureReceivedVia with «docusign» where the upload ends today
 * — nothing else here depends on how the copy was signed.
 *
 * Test mode (components/testMode.ts): the reminder run changes nothing in the database and mails
 * only the test inbox (HYPOTEQ_TEST_MAIL_TO); without one it only logs. The submit and the
 * Nachreichung write their rows as in production (they are test inquiries themselves).
 */

import type { CompletionDocumentRow } from "./completion";
import type { V3Analysis } from "./files";
import { SIGNATURE_REQUIREMENT_ID } from "./requirements";
import { signatureProblems } from "./signature";

export type SignatureAtSubmit = { state: "uploaded" | "later" | null; fileName?: string | null; driveItemId?: string | null };

/** uploaded = in the closing · pending = «später nachreichen» · received = uploaded later. */
export type SignatureRowStatus = "uploaded" | "pending" | "received";
/** Handover 6: the upload today, DocuSign in a later phase. */
export type SignatureMethod = "upload" | "docusign";

export interface SignatureRow {
  inquiryId: string;
  status: string;
  method: string;
  fileName: string | null;
  driveItemId: string | null;
  requestedAt: Date | null;
  receivedAt: Date | null;
  remindersSent: number;
  lastReminderAt: Date | null;
}

/** Reminder 1 from this calendar day after «Später nachreichen», reminder 2 from that one. */
export const REMINDER_DAYS = [2, 5] as const;
export const MAX_REMINDERS = REMINDER_DAYS.length;
/** The Nachreich link must stay usable at least this long after a reminder (it expires, components/nachreichung.ts). */
export const LINK_MIN_DAYS_LEFT = 14;

const DAY_MS = 86_400_000;
const METHOD: SignatureMethod = "upload";

// ---- Calendar ---------------------------------------------------------------------------------

const ZURICH = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });

/** Days since 1970-01-01 of the calendar date in Zürich (the cron runs at 06:00 UTC). */
export function zurichDay(d: Date): number {
  const [y, m, day] = ZURICH.format(d).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / DAY_MS);
}

/**
 * Which reminder is due now (1 or 2), or null. Counted in Zürich calendar days from
 * `requestedAt`, so «nach 2 Tagen» is the morning of the second day after, whatever the hour
 * of the closing; one per day at most, two in all.
 */
export function reminderDue(row: Pick<SignatureRow, "status" | "requestedAt" | "remindersSent" | "lastReminderAt">, now: Date): 1 | 2 | null {
  if (row.status !== "pending" || !row.requestedAt) return null;
  const sent = Math.max(0, row.remindersSent || 0);
  if (sent >= MAX_REMINDERS) return null;
  const today = zurichDay(now);
  if (row.lastReminderAt && zurichDay(row.lastReminderAt) >= today) return null;
  const days = today - zurichDay(row.requestedAt);
  return days >= REMINDER_DAYS[sent] ? ((sent + 1) as 1 | 2) : null;
}

// ---- Dependencies -----------------------------------------------------------------------------

/** The Inquiry columns a reminder needs. */
export interface ReminderInquiry {
  id: string;
  caseNumber?: string | null;
  nachreichToken?: string | null;
  nachreichExpiresAt?: Date | null;
  v3State?: unknown;
  client?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
}

export interface SignatureReminderSend {
  to: string;
  lang: "de" | "en" | "fr" | "it";
  name: string;
  caseNumber: string | null;
  uploadUrl: string;
  reminder: 1 | 2;
  attachment: { name: string; bytes: Uint8Array } | null;
}

export interface SignatureServerDeps {
  db: {
    find(inquiryId: string): Promise<SignatureRow | null>;
    create(row: Partial<SignatureRow> & Pick<SignatureRow, "inquiryId" | "status">): Promise<void>;
    update(inquiryId: string, data: Partial<SignatureRow>): Promise<void>;
    /** status pending, fewer than MAX_REMINDERS sent. */
    listPending(): Promise<SignatureRow[]>;
    /** remindersSent from → from + 1 if still `from` and pending; true when this run got it. */
    claimReminder(inquiryId: string, from: number, at: Date): Promise<boolean>;
    /** Undo a claim whose mail failed, so the next run tries again. */
    releaseReminder(inquiryId: string, from: number, lastReminderAt: Date | null): Promise<void>;
    findInquiry(inquiryId: string): Promise<ReminderInquiry | null>;
    findDocuments(inquiryId: string): Promise<CompletionDocumentRow[]>;
    setNachreichLink(inquiryId: string, token: string, expiresAt: Date): Promise<void>;
  };
  buildPdf(inquiry: ReminderInquiry, lang: SignatureReminderSend["lang"]): Promise<{ name: string; bytes: Uint8Array } | null>;
  sendMail(mail: SignatureReminderSend): Promise<boolean>;
  testMode(): boolean;
  /** HYPOTEQ_TEST_MAIL_TO, when set. */
  testInbox(): string | null;
  log: Pick<Console, "log" | "warn" | "error">;
}

// ---- The three entry points ---------------------------------------------------------------------

export interface SignatureServer {
  recordSignatureAtSubmit(inquiryId: string, input: SignatureAtSubmit, now?: Date): Promise<void>;
  markSignatureReceived(inquiryId: string, file: { fileName: string; driveItemId?: string | null }, now?: Date, method?: SignatureMethod): Promise<void>;
  sendSignatureReminders(now?: Date): Promise<{ checked: number; sent: number }>;
  /** The row, or null (also when the table is missing). For the Case JSON (signatureWithServer). */
  signatureState(inquiryId: string): Promise<SignatureRow | null>;
}

const isReceived = (s: string | null | undefined) => s === "uploaded" || s === "received";
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createSignatureServer(deps: SignatureServerDeps): SignatureServer {
  const { db, log } = deps;
  const tag = (id: string) => `[Auskunftsermächtigung ${id}]`;

  async function recordSignatureAtSubmit(inquiryId: string, input: SignatureAtSubmit, now: Date = new Date()): Promise<void> {
    try {
      if (!inquiryId) return;
      const uploaded = input?.state === "uploaded";
      const file = { fileName: input?.fileName ?? null, driveItemId: input?.driveItemId ?? null };
      const existing = await db.find(inquiryId);
      if (!existing) {
        await db.create(
          uploaded
            ? { inquiryId, status: "uploaded", method: METHOD, ...file, receivedAt: now }
            : { inquiryId, status: "pending", method: METHOD, ...file, requestedAt: now }
        );
      } else if (uploaded && !isReceived(existing.status)) {
        await db.update(inquiryId, { status: "uploaded", ...file, receivedAt: now });
      } else if (uploaded) {
        if (file.fileName || file.driveItemId) await db.update(inquiryId, file);
      }
      // A retried submit with «später» keeps the first request time and the reminders sent, and
      // never undoes a copy that is already there.
      log.log(`${tag(inquiryId)} at submit: ${uploaded ? "uploaded" : input?.state === "later" ? "pending (später nachreichen)" : "pending (none chosen)"}`);
    } catch (err) {
      log.error(`${tag(inquiryId)} could not record the state at submit (continuing): ${message(err)}`);
    }
  }

  async function markSignatureReceived(
    inquiryId: string,
    file: { fileName: string; driveItemId?: string | null },
    now: Date = new Date(),
    method: SignatureMethod = METHOD
  ): Promise<void> {
    try {
      if (!inquiryId) return;
      const data = { fileName: file?.fileName ?? null, driveItemId: file?.driveItemId ?? null };
      const existing = await db.find(inquiryId);
      if (!existing) await db.create({ inquiryId, status: "received", method, ...data, receivedAt: now });
      else if (!isReceived(existing.status)) await db.update(inquiryId, { status: "received", method, ...data, receivedAt: now });
      else return; // already there: the first copy and its time stay
      log.log(`${tag(inquiryId)} signed copy received: ${data.fileName ?? "(no name)"}`);
    } catch (err) {
      log.error(`${tag(inquiryId)} could not mark the signed copy as received (continuing): ${message(err)}`);
    }
  }

  async function signatureState(inquiryId: string): Promise<SignatureRow | null> {
    try {
      return await db.find(inquiryId);
    } catch (err) {
      log.warn(`${tag(inquiryId)} state not readable: ${message(err)}`);
      return null;
    }
  }

  /** A signed copy already among the inquiry's documents (one that bypassed markSignatureReceived). */
  async function signedCopyOnFile(inquiryId: string): Promise<CompletionDocumentRow | null> {
    const rows = await db.findDocuments(inquiryId);
    return (
      rows.find((r) => {
        const ai = (r.aiAnalysis ?? {}) as { v3?: V3Analysis; v3Completion?: { removed?: boolean } };
        const a = ai.v3;
        if (ai.v3Completion?.removed || !a || a.status !== "done" || a.docTypeId !== SIGNATURE_REQUIREMENT_ID) return false;
        return signatureProblems(a).length === 0;
      }) ?? null
    );
  }

  async function sendSignatureReminders(now: Date = new Date()): Promise<{ checked: number; sent: number }> {
    let pending: SignatureRow[];
    try {
      pending = await db.listPending();
    } catch (err) {
      log.error(`[Auskunftsermächtigung] reminders: pending signatures not readable (table missing?): ${message(err)}`);
      return { checked: 0, sent: 0 };
    }
    const test = deps.testMode();
    let sent = 0;
    for (const row of pending) {
      const due = reminderDue(row, now);
      if (!due) continue;
      try {
        if (await sendOne(row, due, now, test)) sent++;
      } catch (err) {
        log.error(`${tag(row.inquiryId)} reminder ${due} failed: ${message(err)}`);
      }
    }
    log.log(`[Auskunftsermächtigung] reminders: ${pending.length} pending, ${sent} sent${test ? " (test mode)" : ""}`);
    return { checked: pending.length, sent };
  }

  async function sendOne(row: SignatureRow, due: 1 | 2, now: Date, test: boolean): Promise<boolean> {
    const id = row.inquiryId;
    const inquiry = await db.findInquiry(id);
    if (!inquiry) {
      log.warn(`${tag(id)} reminder ${due}: inquiry not found`);
      return false;
    }

    const copy = await signedCopyOnFile(id).catch(() => null);
    if (copy) {
      if (!test) await markSignatureReceived(id, { fileName: copy.storedName || copy.fileName, driveItemId: copy.driveItemId }, now);
      return false;
    }

    const { storedV3State } = await import("./nachreich");
    const { confirmationRecipients } = await import("./completion");
    const { splitFullName } = await import("./requirements");
    const state = storedV3State(inquiry);
    const lang = state?.lang ?? "de";
    const to = confirmationRecipients({ v3: state, client: inquiry.client ?? {} }).to;
    if (!to) {
      log.warn(`${tag(id)} reminder ${due}: no customer address`);
      return false;
    }
    const name =
      (state?.txt?.vor || "").trim() || splitFullName(state?.txt?.zeichner || "").first || (inquiry.client?.firstName || "").trim();

    if (test) {
      const inbox = deps.testInbox();
      if (!inbox) {
        const { skipped } = await import("@/components/testMode");
        skipped("signature reminder", `${due} for inquiry ${id} (no HYPOTEQ_TEST_MAIL_TO)`);
        return false;
      }
    }

    // Claimed before the mail goes out: a second cron run at the same time finds it taken.
    if (!test && !(await db.claimReminder(id, row.remindersSent, now))) return false;
    const release = async () => {
      if (!test) await db.releaseReminder(id, row.remindersSent, row.lastReminderAt).catch((e) => log.error(`${tag(id)} could not release the reminder claim: ${message(e)}`));
    };

    const link = await ensureLink(inquiry, now, test).catch((err) => {
      log.error(`${tag(id)} reminder ${due}: Nachreich link not usable: ${message(err)}`);
      return null;
    });
    if (!link) {
      await release();
      return false;
    }

    const attachment = await deps.buildPdf(inquiry, lang).catch((err) => {
      // The Nachreich page offers the template too: the reminder still goes out.
      log.error(`${tag(id)} reminder ${due}: PDF not built (sending without): ${message(err)}`);
      return null;
    });

    let ok = false;
    try {
      ok = await deps.sendMail({ to, lang, name, caseNumber: inquiry.caseNumber ?? null, uploadUrl: link, reminder: due, attachment });
    } catch (err) {
      log.error(`${tag(id)} reminder ${due}: mail failed: ${message(err)}`);
    }
    if (!ok) await release();
    else log.log(`${tag(id)} reminder ${due} sent`);
    return ok;
  }

  /** The Nachreich URL, with a token that is still valid for LINK_MIN_DAYS_LEFT (minted or extended). */
  async function ensureLink(inquiry: ReminderInquiry, now: Date, test: boolean): Promise<string> {
    const { createNachreichToken, nachreichExpiry, buildNachreichUrl } = await import("@/components/nachreichung");
    const { storedV3State } = await import("./nachreich");
    const lang = storedV3State(inquiry)?.lang ?? "de";
    let token = inquiry.nachreichToken || null;
    const expires = inquiry.nachreichExpiresAt ? new Date(inquiry.nachreichExpiresAt) : null;
    const tooSoon = !expires || expires.getTime() < now.getTime() + LINK_MIN_DAYS_LEFT * DAY_MS;
    if (!token || tooSoon) {
      if (test) {
        if (!token) throw new Error("no Nachreich token (not minted in test mode)");
      } else {
        token = token || createNachreichToken();
        await db.setNachreichLink(inquiry.id, token, nachreichExpiry(now));
      }
    }
    return buildNachreichUrl(token!, lang);
  }

  return { recordSignatureAtSubmit, markSignatureReceived, sendSignatureReminders, signatureState };
}

// ---- Production -------------------------------------------------------------------------------

function prismaDeps(): SignatureServerDeps {
  const load = async () => (await import("@/lib/prisma")).prisma;
  const row = (r: any): SignatureRow => ({
    inquiryId: r.inquiryId,
    status: r.status,
    method: r.method,
    fileName: r.fileName ?? null,
    driveItemId: r.driveItemId ?? null,
    requestedAt: r.requestedAt ?? null,
    receivedAt: r.receivedAt ?? null,
    remindersSent: r.remindersSent ?? 0,
    lastReminderAt: r.lastReminderAt ?? null,
  });
  return {
    db: {
      async find(inquiryId) {
        const p = await load();
        const r = await p.inquirySignature.findUnique({ where: { inquiryId } });
        return r ? row(r) : null;
      },
      async create(data) {
        const p = await load();
        await p.inquirySignature.create({ data: data as any });
      },
      async update(inquiryId, data) {
        const p = await load();
        await p.inquirySignature.update({ where: { inquiryId }, data: data as any });
      },
      async listPending() {
        const p = await load();
        const rows = await p.inquirySignature.findMany({
          where: { status: "pending", remindersSent: { lt: MAX_REMINDERS }, requestedAt: { not: null } },
          orderBy: { requestedAt: "asc" },
          take: 500,
        });
        return rows.map(row);
      },
      async claimReminder(inquiryId, from, at) {
        const p = await load();
        const res = await p.inquirySignature.updateMany({
          where: { inquiryId, status: "pending", remindersSent: from },
          data: { remindersSent: from + 1, lastReminderAt: at },
        });
        return res.count === 1;
      },
      async releaseReminder(inquiryId, from, lastReminderAt) {
        const p = await load();
        await p.inquirySignature.updateMany({ where: { inquiryId, remindersSent: from + 1 }, data: { remindersSent: from, lastReminderAt } });
      },
      async findInquiry(inquiryId) {
        const p = await load();
        return (await (p.inquiry as any).findUnique({
          where: { id: inquiryId },
          select: {
            id: true,
            caseNumber: true,
            nachreichToken: true,
            nachreichExpiresAt: true,
            v3State: true,
            client: { select: { email: true, firstName: true, lastName: true } },
          },
        })) as ReminderInquiry | null;
      },
      async findDocuments(inquiryId) {
        const p = await load();
        return (await p.document.findMany({ where: { inquiryId }, orderBy: { uploadedAt: "asc" } })) as unknown as CompletionDocumentRow[];
      },
      async setNachreichLink(inquiryId, token, expiresAt) {
        const p = await load();
        await p.inquiry.update({ where: { id: inquiryId }, data: { nachreichToken: token, nachreichExpiresAt: expiresAt }, select: { id: true } });
      },
    },
    async buildPdf(inquiry, lang) {
      const { storedV3State } = await import("./nachreich");
      const state = storedV3State(inquiry);
      if (!state) return null;
      const { authorizationDataFromState } = await import("./authorizationData");
      const { buildAuthorizationPdf, authorizationFileName } = await import("./authorization");
      const data = authorizationDataFromState(state, lang, { caseNumber: inquiry.caseNumber ?? null });
      return { name: authorizationFileName(data), bytes: await buildAuthorizationPdf(data) };
    },
    async sendMail(mail) {
      const { sendSignatureReminderMail } = await import("./signatureReminderMail");
      return sendSignatureReminderMail(mail);
    },
    testMode: () => {
      const raw = (process.env.HYPOTEQ_TEST_MODE ?? "").trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes";
    },
    testInbox: () => {
      const inbox = (process.env.HYPOTEQ_TEST_MAIL_TO ?? "").trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox) ? inbox : null;
    },
    log: console,
  };
}

let server: SignatureServer | null = null;
const production = () => (server ??= createSignatureServer(prismaDeps()));

/** Contract (Handover 6 / mail agent): called by /api/inquiry once the Inquiry exists. Never throws. */
export async function recordSignatureAtSubmit(inquiryId: string, input: SignatureAtSubmit, now?: Date): Promise<void> {
  return production().recordSignatureAtSubmit(inquiryId, input, now);
}

/** A signed copy arrived after the closing (Nachreich link). Never throws. */
export async function markSignatureReceived(inquiryId: string, file: { fileName: string; driveItemId?: string | null }, now?: Date): Promise<void> {
  return production().markSignatureReceived(inquiryId, file, now);
}

/**
 * The DocuSign seam (Handover 6, later phase): a signing flow that does not upload a file reports
 * its signed copy here with its own method; markSignatureReceived is this with «upload».
 */
export async function markSignatureReceivedVia(
  inquiryId: string,
  file: { fileName: string; driveItemId?: string | null },
  method: SignatureMethod,
  now?: Date
): Promise<void> {
  return production().markSignatureReceived(inquiryId, file, now, method);
}

/** The daily reminders (app/api/portal/cron). Never throws. */
export async function sendSignatureReminders(now?: Date): Promise<{ checked: number; sent: number }> {
  try {
    return await production().sendSignatureReminders(now);
  } catch (err) {
    console.error("[Auskunftsermächtigung] reminders failed:", err);
    return { checked: 0, sent: 0 };
  }
}

/** The row of an inquiry, or null (missing table included). */
export async function signatureState(inquiryId: string): Promise<SignatureRow | null> {
  return production().signatureState(inquiryId);
}
