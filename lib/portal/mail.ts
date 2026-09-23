import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";
import { DICTS, isLocale, type Dict } from "@/lib/portal/i18n/dict";

/**
 * Partnerportal e-mails, sent through Microsoft Graph like the rest of the site, in the
 * recipient's language. Partner e-mails carry no case data beyond the customer's name
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

function layout(p: { lang: string; t: Dict; origin: string; heading: string; paragraphs: string[]; cta: string; url: string; footnote: string }) {
  return `<!DOCTYPE html>
<html lang="${p.lang}"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:24px 12px;background:#F6F8F4;font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#132219;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="padding:32px 28px;">
      <img src="${p.origin}/images/HYPOTEQ_layout_logo.png" alt="HYPOTEQ" width="120" style="display:block;width:120px;height:auto;" />
      <div style="width:44px;height:3px;background:#132219;margin:20px 0;"></div>
      <h1 style="margin:0 0 20px;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;">${esc(p.heading)}</h1>
      ${p.paragraphs.map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:rgba(19,34,25,.75);">${esc(t)}</p>`).join("")}
      <p style="margin:24px 0;">
        <a href="${p.url}" style="display:inline-block;background:#CAF476;color:#132219;text-decoration:none;font-weight:600;font-size:16px;padding:14px 26px;border-radius:999px;">${esc(p.cta)} &rarr;</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:rgba(19,34,25,.55);">${esc(p.t.mail.buttonFallback)}<br /><span style="word-break:break-all;">${p.url}</span></p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:rgba(19,34,25,.45);">${esc(p.footnote)}</p>
    </div>
    <div style="padding:14px 28px;border-top:1px solid #E1E7DC;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(19,34,25,.45);">${esc(p.t.mail.footer)}</div>
  </div>
</body></html>`;
}

async function send(to: string, subject: string, html: string, devLink: string): Promise<void> {
  const client = getGraphMailClient();
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      // Local development without Graph: the link is the only thing a developer needs.
      console.log(`[portal] Graph mail disabled — would send "${subject}" to ${to}:\n  ${devLink}`);
      return;
    }
    throw new Error("Portal mail cannot be sent: Microsoft Graph is not configured");
  }
  const sendAsUser = process.env.PORTAL_MAIL_FROM || process.env.SMTP_USER || "info@hypoteq.ch";
  await client.api(`/users/${sendAsUser}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  });
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
  await send(p.to, t.mail.inviteSubject, html, url);
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
  await send(p.to, t.mail.resetSubject, html, url);
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
  await send(p.to, t.mail.magicSubject, html, url);
}

/** Case update to a partner: customer name and action only, details behind the login. */
export async function sendNotificationMail(p: {
  to: string;
  name: string | null;
  origin: string;
  caseId: string;
  kunde: string;
  caseNr: string;
  title: string;
  text: string;
  locale: string | null;
}) {
  const { t, lang } = dict(p.locale);
  const url = `${p.origin}/portal/cases/${p.caseId}`;
  const html = layout({
    lang,
    t,
    origin: p.origin,
    heading: p.title,
    paragraphs: [t.mail.hello(p.name), t.mail.notifBody(p.text.replace(/\.$/, ""), p.caseNr)],
    cta: t.mail.notifCta,
    url,
    footnote: t.mail.notifFoot,
  });
  await send(p.to, t.mail.notifSubject(p.kunde), html, url);
}

/** Internal mail to the HYPOTEQ team (the Case owner, or PORTAL_TEAM_EMAIL). Always German. */
export async function sendTeamMail(p: { to: string | null; subject: string; lines: string[]; origin: string; link?: string }) {
  const to = p.to || process.env.PORTAL_TEAM_EMAIL || process.env.SMTP_TO || "info@hypoteq.ch";
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#132219;padding:16px;">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7BA228;margin:0 0 12px;">Partnerportal</p>
  ${p.lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px;white-space:pre-wrap;">${esc(l)}</p>`).join("")}
  ${p.link ? `<p style="margin-top:16px;"><a href="${esc(p.link)}">${esc(p.link)}</a></p>` : ""}
</body></html>`;
  await send(to, p.subject, html, p.link || "");
}
