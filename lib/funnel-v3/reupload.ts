/**
 * Re-Upload (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich Kap. 5; answers 1, 8 and 9 of
 * 26.10.2026). Pure: the request Salesforce sends, which requirement it means, the mails
 * (10.1 the request, 10.2 the reminders after 2 and 5 days — customers «du», partners «Sie»),
 * and when a reminder is due. The side effects are in reuploadServer.ts.
 */

import { MAIL_FOOTER } from "./mail/texts";
import { isLang, translate, type Lang } from "./i18n";
import { reqList, type RequirementInstance } from "./requirements";
import { requirementLabel } from "./nachreichView";
import { SOURCE_TYPES } from "./abgleich/rules";
import type { V3State } from "./completion";

export type ReuploadRecipient = "kunde" | "partner";

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** What Salesforce sends (the endpoint spec: docs/funnel-v5/HYPOTEQ_Schnittstelle_ReUpload.md). */
export interface ReuploadRequest {
  caseId: string | null;
  caseNumber: string | null;
  requirement: string;
  reason: string;
  /** The mail as HYPOTEQ edited it in the dialog; null = the funnel's text. */
  mailText: string | null;
  recipient: ReuploadRecipient | null;
  lang: Lang | null;
  taskId: string | null;
  /** True: only return the prepared mail (for the dialog), change nothing. */
  preview: boolean;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const SF_ID = /^[a-zA-Z0-9]{15,18}$/;

/** The request body, checked. A string error names what is wrong. */
export function parseReuploadRequest(body: unknown): ReuploadRequest | string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caseId = str(b.caseId, 18);
  const caseNumber = str(b.caseNumber, 20);
  if (!caseId && !caseNumber) return "caseId or caseNumber is required";
  if (caseId && !SF_ID.test(caseId)) return "caseId is not a Salesforce id";
  const requirement = str(b.requirement, 120);
  if (!requirement) return "requirement is required";
  const reason = str(b.reason, 1000);
  if (!reason) return "reason is required";
  const recipient = b.recipient === undefined || b.recipient === null || b.recipient === "" ? null : b.recipient === "kunde" || b.recipient === "partner" ? b.recipient : undefined;
  if (recipient === undefined) return "recipient must be «kunde» or «partner»";
  const taskId = str(b.taskId, 18);
  if (taskId && !SF_ID.test(taskId)) return "taskId is not a Salesforce id";
  return {
    caseId,
    caseNumber,
    requirement,
    reason,
    mailText: typeof b.mailText === "string" && b.mailText.trim() ? b.mailText.replace(/\r\n/g, "\n").trim().slice(0, 8000) : null,
    recipient,
    lang: isLang(b.lang) ? b.lang : null,
    taskId,
    preview: b.preview === true,
  };
}

/**
 * The requirement the key means: the `id` of Dokumenten_Check_State__c `requirements[]`
 * (`lohnausweise#<borrower>`, `grundbuch`), the requirement code with the Kreditnehmer
 * (`P2`, `P2_kn2`), the requirement id with it (`lohnausweise_kn2`), or HYPOTEQ's document key
 * of the Prüfregeln with it (`pass_id_kn1`, `grundbuchauszug`). Null when none fits or the key
 * is ambiguous.
 */
export function resolveRequirement(state: V3State, key: string): RequirementInstance | null {
  const list = reqList(state);
  const exact = list.find((i) => i.instanceId === key);
  if (exact) return exact;
  const m = key.trim().match(/^(.+?)(?:[_#:\s-]+kn([12]))?$/i);
  if (!m) return null;
  const base = m[1].toLowerCase();
  const kn = m[2] ? Number(m[2]) : null;
  const borrowerId = kn ? (state.ans.kn === "Juristische Person" ? undefined : state.borrowers[kn - 1]?.id) : undefined;
  if (kn && !borrowerId) return null;
  const types = SOURCE_TYPES[base] ?? [];
  const candidates = list.filter((i) => i.id.toLowerCase() === base || i.code.toLowerCase() === base || types.includes(i.id));
  const fit = borrowerId ? candidates.filter((i) => i.borrowerId === borrowerId) : candidates.filter((i) => !i.perBorrower || i.borrowerId === state.borrowers[0]?.id);
  return fit.length === 1 ? fit[0] : null;
}

export interface ReuploadMailInput {
  lang: Lang;
  recipient: ReuploadRecipient;
  /** The person written to (the customer, or the partner). */
  first: string;
  last: string;
  caseNumber: string | null;
  /** The requirement, in the case language. */
  document: string;
  reason: string;
  link: string;
  /** 0 = the request (10.1), 1 / 2 = the reminders (10.2). */
  reminder: 0 | 1 | 2;
  /** HYPOTEQ's edited text of the request (10.1 only). */
  mailText?: string | null;
}

export interface ReuploadMail {
  subject: string;
  text: string;
  html: string;
}

/** Kap. 10.1 / 10.2 in the case language; the request may carry HYPOTEQ's own wording. */
export function reuploadMail(m: ReuploadMailInput): ReuploadMail {
  const a = m.recipient;
  const t = (key: string, p: Record<string, string> = {}) => translate(m.lang, `reup.${key}`, p);
  const params = { vorname: m.first, nachname: m.last, dokument: m.document, grund: m.reason, fall: m.caseNumber ?? "", link: m.link };
  const named = Boolean(m.first || m.last);
  const greeting = a === "partner" && !named ? t("partner.greetingNoName") : t(`${a}.greeting`, params).replace(/\s+,/, ",").replace(/\s{2,}/g, " ").trim();
  const subject = m.reminder === 0 ? t(`${a}.subject`) : t(`${a}.reminder${m.reminder}`);

  let paragraphs: string[];
  let signoff: string;
  if (m.reminder === 0 && m.mailText) {
    // HYPOTEQ's wording, as edited in the Salesforce dialog; the link where it says {link}.
    paragraphs = m.mailText.split(/\n{2,}/).map((p) => p.replace(/\{link\}/g, m.link).trim()).filter(Boolean);
    signoff = "";
  } else if (m.reminder === 0) {
    paragraphs = [greeting, t(`${a}.intro`, params), t(`${a}.ask`)];
    signoff = `${t(`${a}.signoff`)}\n${t(`${a}.team`)}`;
  } else {
    paragraphs = [greeting, t(`${a}.reminderBody`, params), t("reminderAsk")];
    signoff = `${t(`${a}.reminderSignoff`)}\n${t(`${a}.team`)}`;
  }
  const hasLink = paragraphs.some((p) => p.includes(m.link));
  const button = t("button");

  const text = [...paragraphs, ...(hasLink ? [] : [m.link]), ...(signoff ? [signoff] : []), MAIL_FOOTER].join("\n\n");
  const para = (p: string) => `<p style="font-size:15px;margin:0 0 14px 0;white-space:pre-line;">${linkify(escapeHtml(p), m.link)}</p>`;
  const html = `<!DOCTYPE html>
<html lang="${m.lang}">
<head><meta charset="UTF-8" /></head>
<body style="font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.7;color:#132219;max-width:600px;margin:0 auto;padding:20px;background-color:#f5f5f5;">
  <div style="background:#fff;border-radius:10px;padding:36px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
    <div style="margin-bottom:26px;padding-bottom:18px;border-bottom:2px solid #CAF476;">
      <img src="https://www.hypoteq.com/images/HYPOTEQ_layout_logo.png" alt="HYPOTEQ" width="140" style="display:block;width:140px;height:auto;border:0;" />
      ${m.caseNumber ? `<div style="font-size:13px;color:#132219;opacity:.65;margin-top:4px;">${escapeHtml(m.caseNumber)}</div>` : ""}
    </div>
    ${paragraphs.map(para).join("\n    ")}
    ${hasLink ? "" : `<p style="margin:6px 0 26px 0;"><a href="${escapeHtml(m.link)}" style="display:inline-block;background:#CAF476;color:#132219;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 26px;">${escapeHtml(button)}</a></p>`}
    ${
      signoff
        ? `<div style="padding-top:18px;border-top:2px solid #CAF476;">${signoff
            .split("\n")
            .map((l, i) => `<div style="${i ? "font-weight:600;margin-top:10px;" : "font-size:15px;"}">${escapeHtml(l)}</div>`)
            .join("")}<div style="margin-top:12px;font-size:12px;color:#132219;opacity:.6;">${escapeHtml(MAIL_FOOTER)}</div></div>`
        : `<div style="margin-top:12px;font-size:12px;color:#132219;opacity:.6;">${escapeHtml(MAIL_FOOTER)}</div>`
    }
  </div>
</body>
</html>`;
  return { subject, text, html };
}

/** The (escaped) link in a paragraph as an anchor. */
function linkify(escaped: string, link: string): string {
  const e = escapeHtml(link);
  return escaped.split(e).join(`<a href="${e}" style="color:#132219;font-weight:600;">${e}</a>`);
}

/** The requirement's name in the case language, «– Max Mustermann» for a borrower's. */
export function documentName(inst: RequirementInstance, lang: Lang): string {
  return requirementLabel(inst, lang);
}

// ---- Reminders (10.2: after 2 and 5 days without an upload, like M4/M5) ----------------------

export const REUPLOAD_REMINDER_DAYS = [2, 5] as const;

export interface ReuploadRow {
  id: string;
  inquiryId: string;
  requirement: string;
  reason: string;
  mailText: string | null;
  recipient: string;
  recipientEmail: string | null;
  lang: string;
  taskId: string | null;
  status: string;
  requestedAt: Date;
  remindersSent: number;
  lastReminderAt: Date | null;
  resolvedAt: Date | null;
  previousDocumentIds: unknown;
}

const ZURICH = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
const zurichDay = (d: Date) => {
  const [y, mo, day] = ZURICH.format(d).split("-").map(Number);
  return Math.floor(Date.UTC(y, mo - 1, day) / 86_400_000);
};

/** Which reminder is due (1 or 2), counted in Zürich calendar days, one per day at most. */
export function reuploadReminderDue(row: Pick<ReuploadRow, "status" | "requestedAt" | "remindersSent" | "lastReminderAt">, now: Date): 1 | 2 | null {
  if (row.status !== "open") return null;
  const sent = Math.max(0, row.remindersSent || 0);
  if (sent >= REUPLOAD_REMINDER_DAYS.length) return null;
  const today = zurichDay(now);
  if (row.lastReminderAt && zurichDay(new Date(row.lastReminderAt)) >= today) return null;
  return today - zurichDay(new Date(row.requestedAt)) >= REUPLOAD_REMINDER_DAYS[sent] ? ((sent + 1) as 1 | 2) : null;
}

/** `reuploads[]` of the Abgleich JSON (6.2). */
export function reuploadsForState(rows: readonly Pick<ReuploadRow, "requirement" | "requestedAt" | "resolvedAt">[]): { requirement: string; requestedAt: string | null; resolvedAt: string | null }[] {
  return rows.map((r) => ({
    requirement: r.requirement,
    requestedAt: r.requestedAt ? new Date(r.requestedAt).toISOString() : null,
    resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
  }));
}
