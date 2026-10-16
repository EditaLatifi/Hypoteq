/**
 * The mails of the closing of a v5 request (Handover 7.1): per recipient exactly one.
 *
 *   Kunde            confirmation + summary + (Auskunftsermächtigung pending) the prefilled
 *                    template attached and the upload link + (documents open) the list and the
 *                    link back — one mail; Rosanna's test had two (auto-response + dossier mail)
 *   Berater / VP     the same summary in a neutral tone, «aus Dokument» marks, subject with the
 *                    customer's name — its own mail; no copy of the customer mail any more (D17)
 *   HYPOTEQ intern   the same summary, the marks, and the Salesforce Case (Lightning link) or,
 *                    when the sync failed, that it failed
 *
 * When the Berater typed the customer's address as their own, the address gets the customer
 * mail only (one mail per recipient). Pure up to the PDF of the Auskunftsermächtigung (injected);
 * `sendClosingMails` routes each mail through test mode (components/testMode.ts: «[TEST]» subject,
 * routed inbox) and hands it to a transport. A failed mail never stops the others.
 */

import { routeMail } from "@/components/testMode";
import { authorizationFileName, buildAuthorizationPdf, type AuthorizationData, type AuthorizationSigner } from "../authorization";
import type { Lang } from "../i18n";
import type { StoredFunnelState } from "../legacy";
import { splitFullName } from "../requirements";
import { renderClosingMail, type SalesforceOutcome } from "./render";
import { beraterEmailOf, buildCaseSummary, closingFacts, customerEmailOf, placeOf, type CaseSummary } from "./summary";
import type { Audience } from "./texts";
import type { MailTransport } from "./transport";

/** The HYPOTEQ queue (Handover 7.1 «HYPOTEQ intern»); `FUNNEL_INTERNAL_MAIL_TO` overrides it. */
export function internalMailTo(env: NodeJS.ProcessEnv = process.env): string {
  return (env.FUNNEL_INTERNAL_MAIL_TO || "").trim() || "info@hypoteq.ch";
}

export interface MailAttachment {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface ClosingMail {
  audience: Audience;
  to: string;
  subject: string;
  html: string;
  replyTo: { address: string; name?: string } | null;
  attachments: MailAttachment[];
  /** What the mail says, for logs and tests. */
  summary: CaseSummary;
}

export interface ClosingMailsInput {
  /** The /api/inquiry body (v5), with `v3Completion` when the closing ran. */
  data: any;
  lang: Lang;
  caseNumber: string | null;
  date: Date;
  inquiryId: string;
  /** The inquiry's Nachreich link. */
  returnUrl: string | null;
  linkDays: number;
  salesforce: SalesforceOutcome;
}

export interface ClosingDeps {
  authorizationPdf(data: AuthorizationData): Promise<Uint8Array>;
  authorizationName(data: AuthorizationData): string;
  log: Pick<Console, "log" | "warn" | "error">;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_DEPS: ClosingDeps = {
  authorizationPdf: buildAuthorizationPdf,
  authorizationName: authorizationFileName,
  log: console,
};

/**
 * The prefilled Auskunftsermächtigung (Handover 6: Vollmachtgeber, Objekt, Zweck from the funnel
 * and the documents). A natural person: every Kreditnehmer signs; a company: its signatory.
 */
export function authorizationDataFor(state: StoredFunnelState, lang: Lang, caseNumber: string | null): AuthorizationData {
  const { ans, txt } = state;
  const isJur = ans.kn === "Juristische Person";
  const mail = txt.mail.trim() || null;
  let signers: AuthorizationSigner[];
  if (isJur) {
    const z = splitFullName(txt.zeichner);
    signers = z.first || z.last ? [{ vor: z.first, nach: z.last, email: mail }] : [];
  } else {
    signers = state.borrowers
      .map((b, i) => ({
        vor: (i === 0 ? txt.vor || b.vor : b.vor).trim(),
        nach: (i === 0 ? txt.nach || b.nach : b.nach).trim(),
        email: i === 0 ? mail : null,
      }))
      .filter((s) => s.vor || s.nach);
  }
  return {
    lang,
    signers,
    firma: isJur ? txt.firma.trim() || null : null,
    caseNumber,
    objekt: (state.info?.adresse || "").trim() || placeOf(state) || null,
    zweck: ans.antrag ?? null,
  };
}

export async function buildClosingMails(input: ClosingMailsInput, deps: Partial<ClosingDeps> = {}): Promise<ClosingMail[]> {
  const d: ClosingDeps = { ...DEFAULT_DEPS, ...deps };
  const facts = closingFacts(input.data);
  if (!facts) return [];
  const summaryInput = { data: input.data, lang: input.lang, caseNumber: input.caseNumber, date: input.date };
  const customer = customerEmailOf(input.data);
  const berater = beraterEmailOf(input.data);
  const mails: ClosingMail[] = [];

  if (customer) {
    const summary = buildCaseSummary(summaryInput, "kunde", facts)!;
    const attachments: MailAttachment[] = [];
    let attachmentName: string | null = null;
    if (summary.next.signature) {
      try {
        const auth = authorizationDataFor(facts.state, input.lang, input.caseNumber);
        const bytes = await d.authorizationPdf(auth);
        if (bytes && bytes.length > 0) {
          attachmentName = d.authorizationName(auth);
          attachments.push({ name: attachmentName, contentType: "application/pdf", bytes });
        } else {
          d.log.warn(`[closing mails ${input.inquiryId}] the Auskunftsermächtigung PDF is empty — not attached`);
        }
      } catch (err) {
        d.log.error(`[closing mails ${input.inquiryId}] Auskunftsermächtigung PDF failed (mail goes without it):`, err);
      }
    }
    const { subject, html } = renderClosingMail(summary, { returnUrl: input.returnUrl, linkDays: input.linkDays, attachmentName });
    mails.push({ audience: "kunde", to: customer, subject, html, replyTo: null, attachments, summary });
  }

  if (berater && berater.toLowerCase() !== customer?.toLowerCase()) {
    const summary = buildCaseSummary(summaryInput, "berater", facts)!;
    const { subject, html } = renderClosingMail(summary, { returnUrl: input.returnUrl, linkDays: input.linkDays });
    mails.push({ audience: "berater", to: berater, subject, html, replyTo: null, attachments: [], summary });
  }

  const summary = buildCaseSummary(summaryInput, "intern", facts)!;
  const completion = input.data?.v3Completion;
  const { subject, html } = renderClosingMail(summary, {
    returnUrl: input.returnUrl,
    linkDays: input.linkDays,
    salesforce: input.salesforce,
    inquiryId: input.inquiryId,
    folderUrl: typeof completion?.folderWebUrl === "string" ? completion.folderWebUrl : null,
    dossierUrl: typeof completion?.dossier?.webUrl === "string" ? completion.dossier.webUrl : null,
  });
  mails.push({
    audience: "intern",
    to: internalMailTo(d.env),
    subject,
    html,
    // A reply from the queue goes to the customer, as the old notification did.
    replyTo: customer ? { address: customer, ...(summary.customer.name ? { name: summary.customer.name } : {}) } : null,
    attachments: [],
    summary,
  });
  return mails;
}

export interface ClosingSendResult {
  sent: Audience[];
  /** Withheld by test mode (an example.com address) or no transport. */
  skipped: Audience[];
  failed: Audience[];
}

export async function sendClosingMails(
  mails: ClosingMail[],
  transport: MailTransport | null,
  log: Pick<Console, "log" | "warn" | "error"> = console
): Promise<ClosingSendResult> {
  const out: ClosingSendResult = { sent: [], skipped: [], failed: [] };
  for (const mail of mails) {
    if (!transport) {
      log.warn(`⚠️ Closing mail (${mail.audience}) not sent — no mail transport configured`);
      out.skipped.push(mail.audience);
      continue;
    }
    const routed = routeMail(mail.to, mail.subject);
    if (!routed) {
      out.skipped.push(mail.audience);
      continue;
    }
    try {
      await transport.send({ to: routed.to, subject: routed.subject, html: mail.html, replyTo: mail.replyTo, attachments: mail.attachments });
      out.sent.push(mail.audience);
      log.log(`📨 Closing mail (${mail.audience}) sent to ${routed.to}${mail.attachments.length ? ` with ${mail.attachments.map((a) => a.name).join(", ")}` : ""}`);
    } catch (err) {
      out.failed.push(mail.audience);
      log.error(`⚠️ Closing mail (${mail.audience}) to ${routed.to} failed (continuing):`, err);
    }
  }
  return out;
}
