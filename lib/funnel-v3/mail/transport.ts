/**
 * How a closing mail leaves the server: Microsoft Graph (`/users/{SMTP_USER}/sendMail`, the
 * route's existing client) when configured, else SMTP (nodemailer, as the confirmation mail's
 * fallback did), else nothing. Attachments ride along in both (the Auskunftsermächtigung,
 * Handover 6). The transports are thin so a test can fake the Graph client or nodemailer.
 */

import type { MailAttachment } from "./closing";

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  replyTo?: { address: string; name?: string } | null;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  readonly kind: "graph" | "smtp";
  send(mail: OutgoingMail): Promise<void>;
}

/** The part of the Graph client the transport uses. */
export interface GraphMailClient {
  api(path: string): { post(body: unknown): Promise<unknown> };
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export function graphTransport(client: GraphMailClient, sendAs: string): MailTransport {
  return {
    kind: "graph",
    async send(mail) {
      const attachments = (mail.attachments ?? []).map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.name,
        contentType: a.contentType,
        contentBytes: base64(a.bytes),
      }));
      await client.api(`/users/${sendAs}/sendMail`).post({
        message: {
          subject: mail.subject,
          body: { contentType: "HTML", content: mail.html },
          toRecipients: [{ emailAddress: { address: mail.to } }],
          ...(mail.replyTo ? { replyTo: [{ emailAddress: { address: mail.replyTo.address, ...(mail.replyTo.name ? { name: mail.replyTo.name } : {}) } }] } : {}),
          ...(attachments.length ? { attachments } : {}),
        },
        saveToSentItems: true,
      });
    },
  };
}

/** The part of nodemailer the transport uses. */
export interface NodemailerLike {
  createTransport(options: unknown): { sendMail(message: unknown): Promise<unknown> };
}

export function smtpTransport(nodemailer: NodemailerLike, env: NodeJS.ProcessEnv = process.env): MailTransport {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.office365.com",
    port: parseInt(env.SMTP_PORT || "587", 10),
    secure: false,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    requireTLS: true,
  });
  return {
    kind: "smtp",
    async send(mail) {
      await transporter.sendMail({
        from: `"HYPOTEQ" <${env.SMTP_USER}>`,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        ...(mail.replyTo ? { replyTo: mail.replyTo.name ? `"${mail.replyTo.name.replace(/"/g, "")}" <${mail.replyTo.address}>` : mail.replyTo.address } : {}),
        ...(mail.attachments?.length
          ? { attachments: mail.attachments.map((a) => ({ filename: a.name, content: Buffer.from(a.bytes), contentType: a.contentType })) }
          : {}),
      });
    },
  };
}

/** Graph when the route has a client, else SMTP when SMTP_USER / SMTP_PASS are set, else null. */
export function closingMailTransport(
  graphClient: GraphMailClient | null,
  opts: { env?: NodeJS.ProcessEnv; nodemailer?: () => NodemailerLike } = {}
): MailTransport | null {
  const env = opts.env ?? process.env;
  if (graphClient) return graphTransport(graphClient, env.SMTP_USER || "info@hypoteq.ch");
  if (env.SMTP_USER && env.SMTP_PASS) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nm = opts.nodemailer ? opts.nodemailer() : (require("nodemailer") as NodemailerLike);
    return smtpTransport(nm, env);
  }
  return null;
}
