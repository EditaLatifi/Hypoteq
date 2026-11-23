import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";
import { isPlausibleEmail, mailFromAddress, teamAddress } from "@/lib/portal/config";
import { DICTS, isLocale, type CaseMail, type Dict } from "@/lib/portal/i18n/dict";
import { recipientsOf, routeMail } from "@/components/testMode";

/**
 * Partnerportal e-mails, sent through Microsoft Graph (else SMTP) like the rest of the site,
 * in the recipient's language. Partner e-mails carry no case data beyond the customer's name
 * and the action — the details are behind the login.
 */

function getGraphMailClient(): Client | null {
  const useGraph =
    process.env.USE_GRAPH === "true" &&
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET;
  if (!useGraph) return null;

  const credential = new ClientSecretCredential(
    process.env.GRAPH_TENANT_ID!,
    process.env.GRAPH_CLIENT_ID!,
    process.env.GRAPH_CLIENT_SECRET!
  );
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const t = await credential.getToken("https://graph.microsoft.com/.default");
        return t!.token;
      },
    },
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function dict(locale: string | null | undefined): { t: Dict; lang: string } {
  const lang = isLocale(locale) ? locale : "de";
  return { t: DICTS[lang], lang };
}

// Colours of the portal mails as plain hex: rgba() is not shown by every client (it was
// «text at 75 %» of #132219 on white).
const MAIL = { page: "#F6F8F4", ink: "#132219", text: "#4E5952", muted: "#7D8580", faint: "#959C98", lime: "#CAF476", rule: "#E1E7DC" };
const MAIL_FONT = "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

/** A long link as text that may wrap (after «/», «?», «=», «&» and every 24 characters). */
function breakableUrl(url: string): string {
  return esc(url)
    .replace(/([/?=]|&amp;)/g, "$1<wbr>")
    .replace(/([^<>/?=;\s]{24})(?=[^<>/?=;\s])/g, "$1<wbr>");
}

/*
 * The portal mails' page. Tables with inline styles and bgcolor, no overflow:hidden, no rgba,
 * no unbreakable text wider than the card: the div version showed only its grey background in
 * the new Outlook (the-eksperts mailbox, Partner Fast Lead test of 23.11.2026), while the funnel's
 * closing mails rendered. The look is unchanged. `linkLabel`: the fallback line links a short
 * text instead of printing the link (the customer mails of the Fast Lead).
 *
 * The footer bar is not upper-cased: HYPOTEQ's footer line carries an e-mail address and a
 * web address that should read as written (Mail-Texte 20.10.2026).
 */
function layout(p: { lang: string; t: Dict; origin: string; heading: string; paragraphs: string[]; cta: string; url: string; footnote: string; fallback?: string; linkLabel?: string }) {
  const f = `font-family:${MAIL_FONT};`;
  const href = esc(p.url);
  const link = p.linkLabel
    ? `<a href="${href}" style="color:${MAIL.ink};text-decoration:underline;">${esc(p.linkLabel)}</a>`
    : `<a href="${href}" style="color:${MAIL.muted};text-decoration:underline;word-break:break-all;">${breakableUrl(p.url)}</a>`;
  return `<!DOCTYPE html>
<html lang="${p.lang}">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(p.heading)}</title></head>
<body style="margin:0;padding:0;background-color:${MAIL.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL.page}" style="background-color:${MAIL.page};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;">
      <tr><td style="padding:32px 28px;${f}color:${MAIL.ink};">
        <img src="${p.origin}/images/HYPOTEQ_layout_logo.png" alt="HYPOTEQ" width="120" height="30" style="display:block;width:120px;height:30px;border:0;" />
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" height="3" bgcolor="${MAIL.ink}" style="width:44px;height:3px;background-color:${MAIL.ink};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr></table>
        <h1 style="margin:0 0 20px;${f}font-size:26px;line-height:30px;font-weight:700;color:${MAIL.ink};">${esc(p.heading)}</h1>
        ${p.paragraphs.map((t) => `<p style="margin:0 0 16px;${f}font-size:16px;line-height:24px;color:${MAIL.text};">${esc(t)}</p>`).join("")}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td bgcolor="${MAIL.lime}" style="background-color:${MAIL.lime};border-radius:999px;">
          <a href="${href}" style="display:inline-block;padding:14px 26px;${f}font-size:16px;line-height:20px;font-weight:600;color:${MAIL.ink};text-decoration:none;">${esc(p.cta)} &rarr;</a>
        </td></tr></table>
        <p style="margin:0 0 8px;${f}font-size:13px;line-height:20px;color:${MAIL.muted};">${esc(p.fallback ?? p.t.mail.buttonFallback)}<br />${link}</p>
        <p style="margin:16px 0 0;${f}font-size:13px;line-height:20px;color:${MAIL.faint};">${esc(p.footnote)}</p>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid ${MAIL.rule};${f}font-size:11px;line-height:16px;color:${MAIL.faint};">${esc(p.t.mail.footer)}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

type Outgoing = {
  to: string;
  subject: string;
  html: string;
  /** What a developer without Graph needs from the mail (its link). */
  devLink: string;
  cc?: string[];
  /**
   * Where «Antworten» goes, e.g. the partner who wrote (B22); several for a Partner Fast Lead's
   * customer mails (partner and HYPOTEQ). Addresses that are not e-mail addresses are ignored.
   */
  replyTo?: string | string[] | null;
};

/** «d***@meier-finanz.ch»: enough to tell in a log which mailbox it was, without the address. */
export function maskEmail(email: string): string {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** What went wrong, from a Graph error (status, code, message) or anything else. */
export function mailErrorText(err: any): string {
  const parts = [err?.statusCode, err?.code, err?.body?.error?.message || err?.message || String(err)].filter((p) => p !== undefined && p !== null && p !== "");
  return parts.join(" · ").slice(0, 500);
}

type Transport = { kind: "graph" | "smtp"; send(m: Outgoing, copies: string[], replyTo: string[]): Promise<void> };

/**
 * How portal mails leave: Microsoft Graph when configured (USE_GRAPH=true + GRAPH_*), else
 * SMTP with SMTP_USER / SMTP_PASS — the same two ways the rest of the website sends, so the
 * portal mails wherever the site does (B6 / E.3). Null when neither is set.
 */
function transport(): Transport | null {
  const graph = getGraphMailClient();
  if (graph) {
    return {
      kind: "graph",
      send: async (m, copies, replyTo) => {
        await graph.api(`/users/${mailFromAddress()}/sendMail`).post({
          message: {
            subject: m.subject,
            body: { contentType: "HTML", content: m.html },
            toRecipients: [{ emailAddress: { address: m.to } }],
            ...(copies.length ? { ccRecipients: copies.map((address) => ({ emailAddress: { address } })) } : {}),
            ...(replyTo.length ? { replyTo: replyTo.map((address) => ({ emailAddress: { address } })) } : {}),
          },
          saveToSentItems: true,
        });
      },
    };
  }
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && pass) {
    return {
      kind: "smtp",
      send: async (m, copies, replyTo) => {
        const nodemailer = (await import("nodemailer")).default;
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.office365.com",
          port: parseInt(process.env.SMTP_PORT || "587", 10),
          secure: false,
          requireTLS: true,
          auth: { user, pass },
        });
        await transporter.sendMail({
          // SMTP sends as the authenticated mailbox; PORTAL_MAIL_FROM would need SendAs rights.
          // The sender is always «HYPOTEQ AG» (HYPOTEQ Mail-Texte 20.10.2026).
          from: `"HYPOTEQ AG" <${user}>`,
          to: m.to,
          ...(copies.length ? { cc: copies } : {}),
          ...(replyTo.length ? { replyTo: replyTo.join(", ") } : {}),
          subject: m.subject,
          html: m.html,
        });
      },
    };
  }
  return null;
}

/**
 * Send one portal mail. A mail that cannot go out throws — the caller tells the user — and is
 * logged here with the reason (console.error: production builds strip console.log). Only a
 * developer machine (NODE_ENV=development) without a transport prints the link instead.
 */
async function send(m: Outgoing): Promise<void> {
  const t = transport();
  if (!t) {
    if (process.env.NODE_ENV === "development") {
      // Local development without mail: the link is the only thing a developer needs.
      console.log(`[portal] mail disabled — would send "${m.subject}" to ${m.to}:\n  ${m.devLink}`);
      return;
    }
    const reason = "neither Microsoft Graph (USE_GRAPH=true, GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET) nor SMTP (SMTP_USER, SMTP_PASS) is configured";
    console.error(`[portal] mail «${m.subject}» to ${maskEmail(m.to)} NOT sent: ${reason}`);
    throw new Error(`Portal mail cannot be sent: ${reason}`);
  }
  const copies = (m.cc || []).filter((a) => a && a.toLowerCase() !== m.to.toLowerCase());
  const replyTo = (Array.isArray(m.replyTo) ? m.replyTo : [m.replyTo])
    .map((a) => (a || "").trim())
    .filter((a, i, all) => a && isPlausibleEmail(a) && all.findIndex((b) => (b || "").trim().toLowerCase() === a.toLowerCase()) === i);
  try {
    await t.send(m, copies, replyTo);
  } catch (err) {
    console.error(`[portal] mail «${m.subject}» to ${maskEmail(m.to)} via ${t.kind}${t.kind === "graph" ? ` as ${mailFromAddress()}` : ""} failed: ${mailErrorText(err)}`);
    throw err;
  }
}

export async function sendInviteMail(p: { to: string; name: string | null; company: string | null; origin: string; token: string; locale: string | null }) {
  const { t, lang } = dict(p.locale);
  const url = `${p.origin}/portal/aktivieren/${p.token}`;
  const html = layout({
    lang,
    t,
    origin: p.origin,
    heading: t.mail.inviteHeading,
    paragraphs: [t.mail.hello(p.name), t.mail.inviteBody(p.company), t.mail.inviteBody2],
    cta: t.mail.inviteCta,
    url,
    footnote: t.mail.inviteFoot,
  });
  await send({ to: p.to, subject: t.mail.inviteSubject, html, devLink: url });
}

export async function sendResetMail(p: { to: string; name: string | null; origin: string; token: string; locale: string | null }) {
  const { t, lang } = dict(p.locale);
  const url = `${p.origin}/portal/passwort-neu/${p.token}`;
  const html = layout({
    lang,
    t,
    origin: p.origin,
    heading: t.mail.resetHeading,
    paragraphs: [t.mail.hello(p.name), t.mail.resetBody],
    cta: t.mail.resetCta,
    url,
    footnote: t.mail.resetFoot,
  });
  await send({ to: p.to, subject: t.mail.resetSubject, html, devLink: url });
}

export async function sendMagicLinkMail(p: { to: string; name: string | null; origin: string; token: string; locale: string | null }) {
  const { t, lang } = dict(p.locale);
  const url = `${p.origin}/portal/link/${p.token}`;
  const html = layout({
    lang,
    t,
    origin: p.origin,
    heading: t.mail.magicHeading,
    paragraphs: [t.mail.hello(p.name), t.mail.magicBody],
    cta: t.mail.magicCta,
    url,
    footnote: t.mail.magicFoot,
  });
  await send({ to: p.to, subject: t.mail.magicSubject, html, devLink: url });
}

/**
 * «Kunde einladen» (Partner Fast Lead, DECISIONS P39): HYPOTEQ's invitation to the customer, in
 * the language the partner chose, with the personal link to the funnel. Speaks to the customer
 * («du» in German) and names the partner who invited. Routed through test mode like the funnel's
 * customer mails (components/testMode.ts: «[TEST]», HYPOTEQ_TEST_MAIL_TO); false when test mode
 * withheld it (an example.com address).
 */
export async function sendLeadInviteMail(p: {
  to: string;
  firstName: string;
  partner: string;
  origin: string;
  url: string;
  locale: string | null;
  days: number;
  /** «Antworten» goes to the partner and HYPOTEQ (HYPOTEQ 23.11.2026). */
  replyTo?: string[];
}): Promise<boolean> {
  const { t, lang } = dict(p.locale);
  const m = t.lead.mail;
  return sendToCustomer(p.to, m.subject(p.partner), p.replyTo, p.url, {
    lang,
    t,
    origin: p.origin,
    heading: m.heading,
    paragraphs: [m.hello(p.firstName), m.body(p.partner), m.body2, m.replies(p.partner)],
    cta: m.cta,
    url: p.url,
    footnote: m.foot(p.days),
    fallback: m.buttonFallback,
    linkLabel: m.linkLabel,
  });
}

/**
 * The reminder of a Partner Fast Lead after 3 (n = 1) and 7 (n = 2) days: the customer's
 * invitation is still open. Same link, same routing and reply-to as the invitation.
 */
export async function sendLeadReminderMail(p: {
  to: string;
  firstName: string;
  partner: string;
  origin: string;
  url: string;
  locale: string | null;
  /** dd.mm.yyyy: until when the link works. */
  validUntil: string;
  n: 1 | 2;
  replyTo?: string[];
}): Promise<boolean> {
  const { t, lang } = dict(p.locale);
  const m = t.lead.mail;
  const r = t.lead.reminder;
  return sendToCustomer(p.to, r.subject(p.n), p.replyTo, p.url, {
    lang,
    t,
    origin: p.origin,
    heading: r.heading,
    paragraphs: [m.hello(p.firstName), r.body(p.partner), r.body2],
    cta: m.cta,
    url: p.url,
    footnote: r.foot(p.validUntil),
    fallback: m.buttonFallback,
    linkLabel: m.linkLabel,
  });
}

/** A Fast Lead mail to the customer, through test mode (false when it withheld the mail). */
async function sendToCustomer(address: string, subject: string, replyTo: string[] | undefined, url: string, page: Parameters<typeof layout>[0]): Promise<boolean> {
  const routed = routeMail(address, subject);
  if (!routed) return false;
  // Test mode may route to several inboxes («a@…,b@…»): the first gets it, the others a copy.
  const [to, ...cc] = recipientsOf(routed.to);
  await send({ to, cc, subject: routed.subject, html: layout(page), devLink: url, replyTo: replyTo ?? null });
  return true;
}

/** {{partner_vorname}}: the first word of PortalUser.name (HYPOTEQ Mail-Texte 20.10.2026), else null. */
export function firstName(name: string | null | undefined): string | null {
  return (name || "").trim().split(/\s+/)[0] || null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * HYPOTEQ's mail on a Case change (Mail-Texte 20.10.2026 M6–M13): subject «{{kunde}} · Case
 * {{case_nr}}: <status line>», the status line as heading, greeting, HYPOTEQ's text. Customer
 * name and status only. Also renders the preview at /portal/meldungen/vorschau.
 */
export function caseMail(t: Dict, p: { mail: CaseMail; kunde: string; caseNr: string; name: string | null; missing?: number | null }) {
  const m = t.mail.caseMails[p.mail];
  return {
    subject: t.mail.caseSubject(p.kunde, p.caseNr, m.line),
    heading: capitalize(m.line),
    paragraphs: [t.mail.greeting(firstName(p.name)), m.text(p.kunde, p.missing || null)],
  };
}

/** Case update to a partner (M6–M13); the button opens the Case in the portal. */
export async function sendNotificationMail(p: {
  to: string;
  name: string | null;
  origin: string;
  caseId: string;
  kunde: string;
  caseNr: string;
  mail: CaseMail;
  /** {{n_fehlend}} for M7: the documents missing now. */
  missing?: number | null;
  locale: string | null;
}) {
  const { t, lang } = dict(p.locale);
  const url = `${p.origin}/portal/cases/${p.caseId}`;
  const { subject, heading, paragraphs } = caseMail(t, p);
  const html = layout({ lang, t, origin: p.origin, heading, paragraphs, cta: t.mail.notifCta, url, footnote: t.mail.notifFoot });
  await send({ to: p.to, subject, html, devLink: url });
}

/**
 * M14 (HYPOTEQ Mail-Texte 20.10.2026): HYPOTEQ decided the partner's change request. The field
 * is worded as the partner saw it in their profile; the button leads there, to the list of
 * their requests.
 */
export async function sendChangeDecisionMail(p: { to: string; name: string | null; origin: string; locale: string | null; nr: string; field: string; approved: boolean }) {
  const { t, lang } = dict(p.locale);
  const url = `${p.origin}/portal/profil`;
  const subject = t.mail.changeSubject(p.nr, p.approved);
  const feld = t.profileExtra.change.fields[p.field] || p.field;
  const html = layout({
    lang,
    t,
    origin: p.origin,
    heading: subject,
    paragraphs: [t.mail.greeting(firstName(p.name)), t.mail.changeText(feld, p.approved)],
    cta: t.mail.changeCta,
    url,
    footnote: t.mail.notifFoot,
  });
  await send({ to: p.to, subject, html, devLink: url });
}

/**
 * Internal mail to the HYPOTEQ team (info@hypoteq.ch unless `to` says otherwise). Always German.
 * `replyTo`: the partner, so «Antworten» reaches them directly.
 */
export async function sendTeamMail(p: { to: string | null; cc?: string[]; replyTo?: string | null; subject: string; lines: string[]; origin: string; link?: string }) {
  const to = p.to || teamAddress();
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#132219;padding:16px;">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7BA228;margin:0 0 12px;">Partnerportal</p>
  ${p.lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px;white-space:pre-wrap;">${esc(l)}</p>`).join("")}
  ${p.link ? `<p style="margin-top:16px;"><a href="${esc(p.link)}">${esc(p.link)}</a></p>` : ""}
</body></html>`;
  await send({ to, subject: p.subject, html, devLink: p.link || "", cc: p.cc, replyTo: p.replyTo });
}
