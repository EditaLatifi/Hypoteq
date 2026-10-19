import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";
import { isPlausibleEmail, mailFromAddress, teamAddress } from "@/lib/portal/config";
import { DICTS, isLocale, type Dict } from "@/lib/portal/i18n/dict";

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

type Outgoing = {
  to: string;
  subject: string;
  html: string;
  /** What a developer without Graph needs from the mail (its link). */
  devLink: string;
  cc?: string[];
  /** Where «Antworten» goes, e.g. the partner who wrote (B22). Ignored unless an e-mail address. */
  replyTo?: string | null;
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

type Transport = { kind: "graph" | "smtp"; send(m: Outgoing, copies: string[], replyTo: string | null): Promise<void> };

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
            ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
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
          from: `"HYPOTEQ Partnerportal" <${user}>`,
          to: m.to,
          ...(copies.length ? { cc: copies } : {}),
          ...(replyTo ? { replyTo } : {}),
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
  const replyTo = m.replyTo && isPlausibleEmail(m.replyTo.trim()) ? m.replyTo.trim() : null;
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
  await send({ to: p.to, subject: t.mail.notifSubject(p.kunde), html, devLink: url });
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
