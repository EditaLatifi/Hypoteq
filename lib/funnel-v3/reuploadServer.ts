/**
 * Re-Upload on the server (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich Kap. 5; answers 8
 * and 9 of 26.10.2026). Three entry points, all failing soft where they are not the request
 * itself:
 *
 *   requestReupload        Salesforce asks (POST /api/funnel/reupload): the requirement goes back
 *                          to «FEHLT» — its documents move to «Weitere Dateien», never deleted —,
 *                          the request is kept (InquiryReupload), the mail of 10.1 goes to the
 *                          customer or the partner with the Nachreich link, the Case gets the
 *                          recomputed documents and the Abgleich JSON with `reuploads[]`.
 *   sendReuploadReminders  the daily cron: 10.2 after 2 and 5 days without a new document.
 *   resolveReuploads       a Nachreichung brought a document for the requirement: resolved, the
 *                          optional Salesforce Task closed, the reminders stop.
 *
 * The table comes from prisma/sql/2026-10-26-inquiry-reupload.sql; until it exists the endpoint
 * answers 503 and the rest does nothing.
 */

import type { CompletionDocumentRow, CompletedFile, V3State } from "./completion";
import { abgleichCaseField, v3DocumentCaseFields } from "./completion";
import type { Lang } from "./i18n";
import { filesFromRows, liveRows, storedSubmission, storedV3State, type NachreichInquiryRow } from "./nachreich";
import { documentName, parseReuploadRequest, resolveRequirement, reuploadMail, reuploadReminderDue, reuploadsForState, type ReuploadMail, type ReuploadRecipient, type ReuploadRequest, type ReuploadRow } from "./reupload";
import type { PruefRegel } from "./abgleich/rules";
import { buildNachreichUrl, createNachreichToken, nachreichExpiry, type NachreichLocale } from "@/components/nachreichung";

const DAY_MS = 86_400_000;
/** The Nachreich link must stay usable at least this long after a request or a reminder. */
export const REUPLOAD_LINK_MIN_DAYS = 14;

export interface ReuploadInquiry extends NachreichInquiryRow {
  nachreichToken?: string | null;
  nachreichCompletedAt?: Date | string | null;
}

export interface ReuploadDeps {
  db: {
    findInquiry(by: { caseId: string | null; caseNumber: string | null }): Promise<ReuploadInquiry | null>;
    findInquiryById(id: string): Promise<ReuploadInquiry | null>;
    findDocuments(inquiryId: string): Promise<CompletionDocumentRow[]>;
    updateDocumentAnalysis(id: string, aiAnalysis: Record<string, unknown>): Promise<void>;
    /** Throws «table missing» when prisma/sql/2026-10-26-inquiry-reupload.sql has not run. */
    listForInquiry(inquiryId: string): Promise<ReuploadRow[]>;
    create(row: Omit<ReuploadRow, "id" | "resolvedAt" | "lastReminderAt" | "remindersSent" | "status"> & { status?: string }): Promise<ReuploadRow>;
    update(id: string, data: Partial<ReuploadRow>): Promise<void>;
    listOpen(): Promise<ReuploadRow[]>;
    /** remindersSent from → from + 1 if still `from` and open; true when this run got it. */
    claimReminder(id: string, from: number, at: Date): Promise<boolean>;
    releaseReminder(id: string, from: number, lastReminderAt: Date | null): Promise<void>;
    setNachreichLink(inquiryId: string, token: string, expiresAt: Date): Promise<void>;
  };
  sendMail(to: string, mail: ReuploadMail): Promise<boolean>;
  /** components/updateCaseCompleteness updateCaseV3Documents (test mode guarded there). */
  updateCase(caseId: string, build: (previous: string | null) => Record<string, boolean | string> | null): Promise<unknown>;
  /** Task.Status = Completed. */
  closeTask(taskId: string): Promise<void>;
  pruefregeln(): Promise<{ rules: readonly PruefRegel[]; from: "salesforce" | "fallback" }>;
  link: { create(): string; expiry(from: Date): Date; url(token: string, lang: Lang): string };
  testMode(): boolean;
  log: Pick<Console, "log" | "warn" | "error">;
}

export type ReuploadResponse = { status: number; body: Record<string, unknown> };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isMissingTable = (err: unknown) => /P2021|does not exist|relation .*InquiryReupload|inquiryReupload/i.test(message(err));

/** The case data the Case builders read, from the document rows as they now are. */
function caseData(state: V3State, rows: CompletionDocumentRow[], skipped: string[]) {
  const live = liveRows(rows);
  const documents = live.map(storedSubmission).filter((s): s is NonNullable<typeof s> => !!s);
  const files: CompletedFile[] = filesFromRows(state, rows);
  return { v3: state, documents, documentCompleteness: { skipped }, v3Completion: { files, folderWebUrl: null } };
}

const skippedOf = (row: ReuploadInquiry) => (Array.isArray(row.v3Skipped) ? row.v3Skipped.filter((s): s is string => typeof s === "string") : []);

export function createReuploadServer(d: ReuploadDeps) {
  const { db, log } = d;

  /** The Nachreich URL, valid for at least REUPLOAD_LINK_MIN_DAYS (minted or extended). */
  async function ensureLink(inquiry: ReuploadInquiry, lang: Lang, now: Date, change: boolean): Promise<string | null> {
    let token = inquiry.nachreichToken || null;
    const expires = inquiry.nachreichExpiresAt ? new Date(inquiry.nachreichExpiresAt) : null;
    const tooSoon = !expires || expires.getTime() < now.getTime() + REUPLOAD_LINK_MIN_DAYS * DAY_MS;
    if (!token || tooSoon) {
      if (!change) return token ? d.link.url(token, lang) : null;
      token = token || d.link.create();
      await db.setNachreichLink(inquiry.id, token, d.link.expiry(now));
      inquiry.nachreichToken = token;
      inquiry.nachreichExpiresAt = d.link.expiry(now);
    }
    return d.link.url(token, lang);
  }

  function recipientOf(state: V3State, inquiry: ReuploadInquiry, recipient: ReuploadRecipient): { to: string | null; first: string; last: string } {
    if (recipient === "partner") {
      const to = String(state.txt.bmail || "").trim();
      return { to: EMAIL_RE.test(to) ? to : null, first: String(state.txt.pvor || "").trim(), last: String(state.txt.pnach || "").trim() };
    }
    const to = String(state.txt.mail || inquiry.client?.email || "").trim();
    return { to: EMAIL_RE.test(to) ? to : null, first: String(state.txt.vor || inquiry.client?.firstName || "").trim(), last: String(state.txt.nach || inquiry.client?.lastName || "").trim() };
  }

  /** The Case: documents recomputed (the requirement open again) and the Abgleich JSON with the re-uploads. */
  async function updateCase(inquiry: ReuploadInquiry, state: V3State, now: Date) {
    if (!inquiry.salesforceCaseId) return;
    const rows = await db.findDocuments(inquiry.id);
    const data = caseData(state, rows, skippedOf(inquiry));
    const rules = await d.pruefregeln().catch(() => null);
    const reuploads = await db.listForInquiry(inquiry.id).catch(() => []);
    await d.updateCase(inquiry.salesforceCaseId, (previous) => {
      const fields = v3DocumentCaseFields(data, previous, now);
      const abgleich = fields && rules ? abgleichCaseField(data, rules, now, reuploadsForState(reuploads)) : null;
      return abgleich ? { ...fields, Funnel_Abgleich_State__c: abgleich } : fields;
    });
  }

  async function requestReupload(body: unknown, now: Date = new Date()): Promise<ReuploadResponse> {
    const req = parseReuploadRequest(body);
    if (typeof req === "string") return { status: 400, body: { ok: false, error: req } };
    const inquiry = await db.findInquiry({ caseId: req.caseId, caseNumber: req.caseNumber });
    if (!inquiry) return { status: 404, body: { ok: false, error: "case not found" } };
    const state = storedV3State(inquiry);
    if (!state) return { status: 409, body: { ok: false, error: "not a funnel v3 case" } };
    const inst = resolveRequirement(state, req.requirement);
    if (!inst) {
      const { reqList } = await import("./requirements");
      return { status: 422, body: { ok: false, error: "requirement not on this case's list", requirements: reqList(state).map((i) => ({ id: i.instanceId, code: i.code, label: i.labelDe })) } };
    }
    const recipient: ReuploadRecipient = req.recipient ?? (state.role === "berater" ? "partner" : "kunde");
    const lang: Lang = req.lang ?? state.lang;
    const who = recipientOf(state, inquiry, recipient);
    if (!who.to) return { status: 422, body: { ok: false, error: `no e-mail address for the ${recipient}` } };

    // The dialog asks first: the prepared mail, nothing changes.
    if (req.preview) {
      const link = (await ensureLink(inquiry, lang, now, false)) ?? "{link}";
      const mail = reuploadMail({ lang, recipient, first: who.first, last: who.last, caseNumber: inquiry.caseNumber ?? null, document: documentName(inst, lang), reason: req.reason, link, reminder: 0, mailText: req.mailText });
      return { status: 200, body: { ok: true, preview: true, requirement: inst.instanceId, document: documentName(inst, lang), recipient, to: who.to, subject: mail.subject, text: mail.text } };
    }

    let existing: ReuploadRow[];
    try {
      existing = await db.listForInquiry(inquiry.id);
    } catch (err) {
      if (isMissingTable(err)) return { status: 503, body: { ok: false, error: "re-upload is not set up (prisma/sql/2026-10-26-inquiry-reupload.sql)" } };
      throw err;
    }

    // The requirement's documents to «Weitere Dateien» (never deleted; Kap. 5.2).
    const rows = await db.findDocuments(inquiry.id);
    const onIt = filesFromRows(state, rows).filter((f) => f.instanceId === inst.instanceId).map((f) => f.documentId);
    for (const id of onIt) {
      const r = rows.find((x) => x.id === id)!;
      const ai = r.aiAnalysis && typeof r.aiAnalysis === "object" ? (r.aiAnalysis as Record<string, unknown>) : {};
      const sub = storedSubmission(r);
      const { documentId: _id, ...detail } = sub ?? { documentId: id, instanceId: null, requirementId: inst.id };
      await db.updateDocumentAnalysis(id, {
        ...ai,
        v3Submitted: { ...detail, instanceId: null, requirementId: inst.id, extraKind: "surplus", keep: true, submittedAt: now.toISOString() },
        v3Reupload: { requirement: inst.instanceId, reason: req.reason, requestedAt: now.toISOString() },
      });
    }

    const open = existing.find((r) => r.status === "open" && r.requirement === inst.instanceId);
    const previous = Array.isArray(open?.previousDocumentIds) ? (open!.previousDocumentIds as string[]) : [];
    const fields = { reason: req.reason, mailText: req.mailText, recipient, recipientEmail: who.to, lang, taskId: req.taskId, requestedAt: now };
    let row: ReuploadRow;
    if (open) {
      await db.update(open.id, { ...fields, remindersSent: 0, lastReminderAt: null, previousDocumentIds: [...new Set([...previous, ...onIt])] });
      row = { ...open, ...fields, remindersSent: 0, lastReminderAt: null };
    } else {
      row = await db.create({ inquiryId: inquiry.id, requirement: inst.instanceId, previousDocumentIds: onIt, ...fields });
    }

    const link = await ensureLink(inquiry, lang, now, !d.testMode());
    let mailSent = false;
    if (link) {
      const mail = reuploadMail({ lang, recipient, first: who.first, last: who.last, caseNumber: inquiry.caseNumber ?? null, document: documentName(inst, lang), reason: req.reason, link, reminder: 0, mailText: req.mailText });
      mailSent = await d.sendMail(who.to, mail).catch((err) => {
        log.error(`[Re-Upload ${inquiry.id}] mail failed: ${message(err)}`);
        return false;
      });
    } else {
      log.warn(`[Re-Upload ${inquiry.id}] no Nachreich link (test mode without a token): no mail`);
    }

    await updateCase(inquiry, state, now).catch((err) => log.error(`[Re-Upload ${inquiry.id}] Case not updated: ${message(err)}`));

    log.log(`[Re-Upload ${inquiry.id}] ${inst.instanceId}: ${onIt.length} document(s) moved, mail ${mailSent ? "sent" : "not sent"} to the ${recipient}`);
    const reminders = [2, 5].map((n) => new Date(now.getTime() + n * DAY_MS).toISOString().slice(0, 10));
    return {
      status: 200,
      body: { ok: true, id: row.id, inquiryId: inquiry.id, requirement: inst.instanceId, document: documentName(inst, lang), recipient, mailSent, movedDocuments: onIt.length, reminders },
    };
  }

  /** A file on the requirement that came after the request: the request is answered. */
  function answered(state: V3State, rows: CompletionDocumentRow[], r: ReuploadRow): boolean {
    const placed = new Set(filesFromRows(state, rows).filter((f) => f.instanceId === r.requirement).map((f) => f.documentId));
    return rows.some((row) => placed.has(row.id) && new Date(row.uploadedAt).getTime() >= new Date(r.requestedAt).getTime());
  }

  async function resolve(r: ReuploadRow, now: Date) {
    await db.update(r.id, { status: "resolved", resolvedAt: now });
    if (r.taskId) await d.closeTask(r.taskId).catch((err) => log.error(`[Re-Upload ${r.inquiryId}] Task ${r.taskId} not closed: ${message(err)}`));
  }

  /** After a Nachreichung: the requests its documents answer. Returns every request of the inquiry (for the JSON). */
  async function resolveReuploads(inquiryId: string, state: V3State, rows: CompletionDocumentRow[], now: Date = new Date()): Promise<ReuploadRow[]> {
    let list: ReuploadRow[];
    try {
      list = await db.listForInquiry(inquiryId);
    } catch {
      return [];
    }
    const out: ReuploadRow[] = [];
    for (const r of list) {
      if (r.status === "open" && answered(state, rows, r)) {
        await resolve(r, now).catch((err) => log.error(`[Re-Upload ${inquiryId}] not resolved: ${message(err)}`));
        out.push({ ...r, status: "resolved", resolvedAt: now });
      } else out.push(r);
    }
    return out;
  }

  async function sendReuploadReminders(now: Date = new Date()): Promise<{ checked: number; sent: number; resolved: number }> {
    let open: ReuploadRow[];
    try {
      open = await db.listOpen();
    } catch (err) {
      if (!isMissingTable(err)) log.error(`[Re-Upload] reminders: ${message(err)}`);
      return { checked: 0, sent: 0, resolved: 0 };
    }
    const test = d.testMode();
    let sent = 0;
    let resolved = 0;
    for (const r of open) {
      const due = reuploadReminderDue(r, now);
      if (!due) continue;
      try {
        const inquiry = await db.findInquiryById(r.inquiryId);
        const state = inquiry ? storedV3State(inquiry) : null;
        if (!inquiry || !state) continue;
        const rows = await db.findDocuments(r.inquiryId);
        if (answered(state, rows, r)) {
          if (!test) await resolve(r, now);
          resolved++;
          continue;
        }
        const inst = resolveRequirement(state, r.requirement);
        if (!inst || !r.recipientEmail) continue;
        if (!test && !(await db.claimReminder(r.id, r.remindersSent, now))) continue;
        const lang = (r.lang as Lang) || state.lang;
        const link = await ensureLink(inquiry, lang, now, !test);
        if (!link) {
          if (!test) await db.releaseReminder(r.id, r.remindersSent, r.lastReminderAt);
          continue;
        }
        const recipient = r.recipient === "partner" ? "partner" : "kunde";
        const who = recipientOf(state, inquiry, recipient);
        const mail = reuploadMail({ lang, recipient, first: who.first, last: who.last, caseNumber: inquiry.caseNumber ?? null, document: documentName(inst, lang), reason: r.reason, link, reminder: due });
        const ok = await d.sendMail(r.recipientEmail, mail).catch(() => false);
        if (ok) sent++;
        else if (!test) await db.releaseReminder(r.id, r.remindersSent, r.lastReminderAt);
      } catch (err) {
        log.error(`[Re-Upload ${r.inquiryId}] reminder ${due} failed: ${message(err)}`);
      }
    }
    log.log(`[Re-Upload] reminders: ${open.length} open, ${sent} sent, ${resolved} answered${test ? " (test mode)" : ""}`);
    return { checked: open.length, sent, resolved };
  }

  return { requestReupload, sendReuploadReminders, resolveReuploads, listReuploads: (inquiryId: string) => db.listForInquiry(inquiryId).catch(() => [] as ReuploadRow[]) };
}

// ---- Production ---------------------------------------------------------------------------------

function prismaDeps(): ReuploadDeps {
  const load = async () => (await import("@/lib/prisma")).prisma as any;
  const INQUIRY = {
    id: true,
    caseNumber: true,
    salesforceCaseId: true,
    sharepointFolderId: true,
    nachreichToken: true,
    nachreichExpiresAt: true,
    nachreichCompletedAt: true,
    v3State: true,
    v3Skipped: true,
    client: { select: { email: true, firstName: true, lastName: true } },
  };
  const row = (r: any): ReuploadRow => ({ ...r, previousDocumentIds: r.previousDocumentIds ?? null });
  return {
    db: {
      async findInquiry(by) {
        const p = await load();
        const where = by.caseId ? { salesforceCaseId: by.caseId } : { caseNumber: by.caseNumber };
        return p.inquiry.findFirst({ where, select: INQUIRY, orderBy: { createdAt: "desc" } });
      },
      async findInquiryById(id) {
        const p = await load();
        return p.inquiry.findUnique({ where: { id }, select: INQUIRY });
      },
      async findDocuments(inquiryId) {
        const p = await load();
        return p.document.findMany({ where: { inquiryId }, orderBy: { uploadedAt: "asc" } });
      },
      async updateDocumentAnalysis(id, aiAnalysis) {
        const p = await load();
        await p.document.update({ where: { id }, data: { aiAnalysis }, select: { id: true } });
      },
      async listForInquiry(inquiryId) {
        const p = await load();
        return (await p.inquiryReupload.findMany({ where: { inquiryId }, orderBy: { requestedAt: "asc" } })).map(row);
      },
      async create(data) {
        const p = await load();
        return row(await p.inquiryReupload.create({ data }));
      },
      async update(id, data) {
        const p = await load();
        await p.inquiryReupload.update({ where: { id }, data });
      },
      async listOpen() {
        const p = await load();
        return (await p.inquiryReupload.findMany({ where: { status: "open", remindersSent: { lt: 2 } }, orderBy: { requestedAt: "asc" }, take: 500 })).map(row);
      },
      async claimReminder(id, from, at) {
        const p = await load();
        const res = await p.inquiryReupload.updateMany({ where: { id, status: "open", remindersSent: from }, data: { remindersSent: from + 1, lastReminderAt: at } });
        return res.count === 1;
      },
      async releaseReminder(id, from, lastReminderAt) {
        const p = await load();
        await p.inquiryReupload.updateMany({ where: { id, remindersSent: from + 1 }, data: { remindersSent: from, lastReminderAt } });
      },
      async setNachreichLink(inquiryId, token, expiresAt) {
        const p = await load();
        await p.inquiry.update({ where: { id: inquiryId }, data: { nachreichToken: token, nachreichExpiresAt: expiresAt, nachreichCompletedAt: null }, select: { id: true } });
      },
    },
    async sendMail(to, mail) {
      const { getGraphMailClient } = await import("@/components/nachreichMail");
      const { routeMail } = await import("@/components/testMode");
      const client = getGraphMailClient();
      if (!client) return false;
      const routed = routeMail(to, mail.subject);
      if (!routed) return false;
      const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
      await client.api(`/users/${sendAsUser}/sendMail`).post({
        message: { subject: routed.subject, body: { contentType: "HTML", content: mail.html }, toRecipients: [{ emailAddress: { address: routed.to } }] },
        saveToSentItems: true,
      });
      return true;
    },
    async updateCase(caseId, build) {
      const { updateCaseV3Documents } = await import("@/components/updateCaseCompleteness");
      return updateCaseV3Documents(caseId, build);
    },
    async closeTask(taskId) {
      const { isTestMode } = await import("@/components/testMode");
      if (isTestMode()) return;
      const { conn, ensureSession, withSessionRetry } = await import("@/components/salesforceApi");
      await ensureSession();
      await withSessionRetry(() => conn.sobject("Task").update({ Id: taskId, Status: "Completed" }) as Promise<unknown>, "Re-Upload Task");
    },
    async pruefregeln() {
      const { loadPruefregeln } = await import("./abgleich/config");
      return loadPruefregeln();
    },
    link: { create: createNachreichToken, expiry: nachreichExpiry, url: (token, lang) => buildNachreichUrl(token, lang as NachreichLocale) },
    testMode: () => {
      const raw = (process.env.HYPOTEQ_TEST_MODE ?? "").trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes";
    },
    log: console,
  };
}

let server: ReturnType<typeof createReuploadServer> | null = null;
const production = () => (server ??= createReuploadServer(prismaDeps()));

export async function requestReupload(body: unknown, now?: Date): Promise<ReuploadResponse> {
  return production().requestReupload(body, now);
}

/** The daily reminders (app/api/portal/cron). Never throws. */
export async function sendReuploadReminders(now?: Date): Promise<{ checked: number; sent: number; resolved: number }> {
  try {
    return await production().sendReuploadReminders(now);
  } catch (err) {
    console.error("[Re-Upload] reminders failed:", err);
    return { checked: 0, sent: 0, resolved: 0 };
  }
}

/** After a Nachreichung (lib/funnel-v3/nachreich.ts). Never throws; [] without the table. */
export async function resolveReuploads(inquiryId: string, state: V3State, rows: CompletionDocumentRow[], now?: Date): Promise<ReuploadRow[]> {
  try {
    return await production().resolveReuploads(inquiryId, state, rows, now);
  } catch {
    return [];
  }
}

/** The requests of an inquiry (the Nachreich page's «Neues Dokument angefordert»). [] without the table. */
export async function listReuploads(inquiryId: string): Promise<ReuploadRow[]> {
  try {
    return await production().listReuploads(inquiryId);
  } catch {
    return [];
  }
}

export type { ReuploadRequest };
