/**
 * The reminder «Unterschrift ausstehend» (Handover 7.1: Kunde, after 2 and 5 days, «Vorlage +
 * Upload-Link, keine Zusammenfassung»; 7.3: funnel language, DE «du»). Copy from
 * messages/funnel-v3 (`sig.reminder.*`), the prefilled PDF attached, the Nachreich link as the
 * one button. Sent through Microsoft Graph like every funnel mail; test mode via routeMail.
 */

import { translate, type Lang } from "./i18n";
import type { SignatureReminderSend } from "./signatureServer";

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface SignatureReminderContent {
  subject: string;
  html: string;
  text: string;
}

/** Subject and body (pure). */
export function signatureReminderContent(m: Omit<SignatureReminderSend, "to">): SignatureReminderContent {
  const lang: Lang = m.lang;
  const t = (k: string, p?: Record<string, string>) => translate(lang, `sig.reminder.${k}`, p);
  const ref = m.caseNumber ? ` ${m.caseNumber}` : "";
  const subject = `${t(m.reminder === 2 ? "subject2" : "subject")}${m.caseNumber ? ` – ${m.caseNumber}` : ""}`;
  const greeting = m.name ? t("greeting", { name: m.name }) : t("greetingNoName");
  const lines = {
    body: t("body", { ref }),
    steps: m.attachment ? t("steps") : t("stepsNoAttachment"),
    button: t("button"),
    already: t("already"),
    signoff: t("signoff"),
    team: t("team"),
  };
  const url = escapeHtml(m.uploadUrl);
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8" /></head>
<body style="font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.7;color:#132219;max-width:600px;margin:0 auto;padding:20px;background-color:#f5f5f5;">
  <div style="background:#fff;border-radius:10px;padding:36px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
    <div style="margin-bottom:26px;padding-bottom:18px;border-bottom:2px solid #CAF476;">
      <div style="font-size:28px;font-weight:700;color:#132219;">HYPOTEQ</div>
      ${m.caseNumber ? `<div style="font-size:13px;color:#132219;opacity:.65;margin-top:4px;">${escapeHtml(m.caseNumber)}</div>` : ""}
    </div>
    <p style="font-size:17px;font-weight:600;margin:0 0 14px 0;">${escapeHtml(greeting)}</p>
    <p style="font-size:15px;margin:0 0 14px 0;">${escapeHtml(lines.body)}</p>
    <p style="font-size:15px;margin:0 0 22px 0;">${escapeHtml(lines.steps)}</p>
    <p style="margin:0 0 26px 0;"><a href="${url}" style="display:inline-block;background:#CAF476;color:#132219;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 26px;">${escapeHtml(lines.button)}</a></p>
    <p style="font-size:13px;color:#132219;opacity:.7;margin:0 0 22px 0;">${escapeHtml(lines.already)}</p>
    <div style="padding-top:18px;border-top:2px solid #CAF476;">
      <div style="font-size:15px;">${escapeHtml(lines.signoff)}</div>
      <div style="font-weight:600;margin-top:10px;">${escapeHtml(lines.team)}</div>
    </div>
  </div>
</body>
</html>`;
  const text = [greeting, "", lines.body, "", lines.steps, "", `${lines.button}: ${m.uploadUrl}`, "", lines.already, "", lines.signoff, lines.team].join("\n");
  return { subject, html, text };
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Send one reminder. True when Graph accepted it; false when mail is off or test mode dropped it. */
export async function sendSignatureReminderMail(m: SignatureReminderSend): Promise<boolean> {
  const { getGraphMailClient } = await import("@/components/nachreichMail");
  const { routeMail } = await import("@/components/testMode");
  const client = getGraphMailClient();
  if (!client) {
    console.log("⚠️ Signature reminder skipped — Graph mail disabled");
    return false;
  }
  const content = signatureReminderContent(m);
  const routed = routeMail(m.to, content.subject);
  if (!routed) return false;
  const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
  await client.api(`/users/${sendAsUser}/sendMail`).post({
    message: {
      subject: routed.subject,
      body: { contentType: "HTML", content: content.html },
      toRecipients: [{ emailAddress: { address: routed.to } }],
      ...(m.attachment
        ? {
            attachments: [
              {
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: m.attachment.name,
                contentType: "application/pdf",
                contentBytes: toBase64(m.attachment.bytes),
              },
            ],
          }
        : {}),
    },
    saveToSentItems: true,
  });
  console.log(`📨 Signature reminder ${m.reminder} sent to ${routed.to}`);
  return true;
}
