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

import type { PartnerResolution } from "@/components/partnerDirectory";
import { routeMail } from "@/components/testMode";
import { authorizationFileName, buildAuthorizationPdf, type AuthorizationData } from "../authorization";
import { authorizationDataFromState } from "../authorizationData";
import type { Lang } from "../i18n";
import type { StoredFunnelState } from "../legacy";
import { renderClosingMail, type SalesforceOutcome } from "./render";
import { beraterEmailOf, buildCaseSummary, closingFacts, customerEmailOf, type CaseSummary, type SummaryInput } from "./summary";
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
  /** The recognised partner (name, company) for a Berater submission; the mails show the address otherwise. */
  partner?: SummaryInput["partner"];
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
 * The prefilled Auskunftsermächtigung attached to the customer mail. The same data as the
 * download in the closing and the reminders (lib/funnel-v3/authorizationData.ts), so the
 * customer gets one form, whichever way it reaches them.
 */
export function authorizationDataFor(state: StoredFunnelState, lang: Lang, caseNumber: string | null): AuthorizationData {
  return authorizationDataFromState(state, lang, { caseNumber });
}

/**
 * The submitting partner as Salesforce knows them, for «Erfasst von» and «Dein Berater»: the
 * lookup the sync just made for the Case (cached in components/partnerDirectory). Null for a
 * customer's own request, an unknown address or no Salesforce — the mails then show the address.
 */
export async function closingPartner(data: any, resolve: (email: string) => Promise<PartnerResolution>): Promise<SummaryInput["partner"]> {
  const email = beraterEmailOf(data);
  if (!email) return null;
  try {
    const r = await resolve(email);
    if (r.status === "partner") return { name: r.name || null, company: r.company };
    if (r.status === "hypoteq") return { name: r.name || null, company: null };
  } catch {
    /* the address stands in */
  }
  return null;
}

export async function buildClosingMails(input: ClosingMailsInput, deps: Partial<ClosingDeps> = {}): Promise<ClosingMail[]> {
  const d: ClosingDeps = { ...DEFAULT_DEPS, ...deps };
  const facts = closingFacts(input.data);
  if (!facts) return [];
  const summaryInput: SummaryInput = { data: input.data, lang: input.lang, caseNumber: input.caseNumber, date: input.date, partner: input.partner ?? null };
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
