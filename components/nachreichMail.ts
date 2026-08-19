import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";
import type { NachreichLocale } from "@/components/nachreichung";

/**
 * Confirmation sent after a customer uploads through their Nachreich link.
 *
 * The spec does not name this mail, but without it the flow ends in silence: someone who
 * has just sent in their Lohnausweis has no way to tell whether it arrived, and their only
 * recourse is to use the link again or phone in. It mirrors Mail 2a/2b — "everything is
 * here now" or "these are still open" — so the customer always knows the current state.
 */

const COPY: Record<NachreichLocale, {
  subjectComplete: string;
  subjectPartial: string;
  greeting: (n: string) => string;
  completeBody: string;
  completeBody2: string;
  partialBody: string;
  partialBody2: string;
  signoff: string;
  team: string;
}> = {
  de: {
    subjectComplete: "HYPOTEQ - Ihr Dossier ist jetzt vollständig",
    subjectPartial: "HYPOTEQ - Unterlagen erhalten, es fehlt noch etwas",
    greeting: (n) => `Sehr geehrte/r ${n || "Kundin/Kunde"}`,
    completeBody: "Vielen Dank - wir haben Ihre Unterlagen erhalten. Ihr Dossier ist damit vollständig.",
    completeBody2: "Wir freuen uns, Ihre Unterlagen zu analysieren, und melden uns zeitnah mit einer Rückmeldung bei Ihnen.",
    partialBody: "Vielen Dank - wir haben Ihre Unterlagen erhalten. Für ein vollständiges Dossier fehlen uns noch:",
    partialBody2: "Sie können die restlichen Dokumente jederzeit über denselben Link nachreichen.",
    signoff: "Freundliche Grüsse",
    team: "Ihr HYPOTEQ-Team",
  },
  fr: {
    subjectComplete: "HYPOTEQ - Votre dossier est désormais complet",
    subjectPartial: "HYPOTEQ - Documents reçus, il en manque encore",
    greeting: (n) => `Madame, Monsieur ${n || ""}`.trim(),
    completeBody: "Merci - nous avons bien reçu vos documents. Votre dossier est désormais complet.",
    completeBody2: "Nous nous réjouissons d'analyser vos documents et reviendrons vers vous rapidement.",
    partialBody: "Merci - nous avons bien reçu vos documents. Pour un dossier complet, il nous manque encore:",
    partialBody2: "Vous pouvez transmettre les documents restants à tout moment via le même lien.",
    signoff: "Meilleures salutations",
    team: "Votre équipe HYPOTEQ",
  },
  it: {
    subjectComplete: "HYPOTEQ - Il suo dossier è ora completo",
    subjectPartial: "HYPOTEQ - Documenti ricevuti, ne mancano ancora",
    greeting: (n) => `Gentile ${n || "cliente"}`,
    completeBody: "Grazie - abbiamo ricevuto i suoi documenti. Il suo dossier è ora completo.",
    completeBody2: "Saremo lieti di analizzare la sua documentazione e la contatteremo a breve.",
    partialBody: "Grazie - abbiamo ricevuto i suoi documenti. Per un dossier completo ci mancano ancora:",
    partialBody2: "Può inviare i documenti rimanenti in qualsiasi momento tramite lo stesso link.",
    signoff: "Cordiali saluti",
    team: "Il suo team HYPOTEQ",
  },
  en: {
    subjectComplete: "HYPOTEQ - Your dossier is now complete",
    subjectPartial: "HYPOTEQ - Documents received, some still outstanding",
    greeting: (n) => `Dear ${n || "customer"}`,
    completeBody: "Thank you - we have received your documents. Your dossier is now complete.",
    completeBody2: "We look forward to analysing your documents and will get back to you shortly.",
    partialBody: "Thank you - we have received your documents. For a complete dossier we are still missing:",
    partialBody2: "You can supply the remaining documents at any time through the same link.",
    signoff: "Best regards",
    team: "Your HYPOTEQ team",
  },
};

function resolveDocLabels(keys: string[], locale: NachreichLocale): string[] {
  let messages: any = {};
  let fallback: any = {};
  try { messages = require(`@/messages/${locale}.json`); } catch { /* falls through */ }
  try { fallback = require("@/messages/de.json"); } catch { /* falls through */ }
  return keys.map((key) => {
    const [ns, name] = key.split(".");
    return messages?.[ns]?.[name] || fallback?.[ns]?.[name] || key;
  });
}

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

export async function sendNachreichConfirmation(params: {
  to: string;
  name: string;
  locale: NachreichLocale;
  complete: boolean;
  remaining: string[];
}): Promise<void> {
  const client = getGraphMailClient();
  if (!client) {
    console.log("⚠️ Nachreich confirmation skipped — Graph mail disabled");
    return;
  }

  const L = COPY[params.locale] || COPY.de;
  const labels = params.complete ? [] : resolveDocLabels(params.remaining, params.locale);

  const listHTML = labels.length
    ? '<ul style="margin:16px 0 20px 0;padding-left:20px;">' +
      labels.map((m) => `<li style="margin-bottom:6px;">${m}</li>`).join("") +
      "</ul>"
    : "";

  const html = `
<!DOCTYPE html>
<html lang="${params.locale}">
<head><meta charset="UTF-8" /></head>
<body style="font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.8;color:#132219;max-width:600px;margin:0 auto;padding:20px;background-color:#f5f5f5;">
  <div style="background:#fff;border-radius:10px;padding:40px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #CAF476;">
      <div style="font-size:32px;font-weight:700;color:#132219;">HYPOTEQ</div>
    </div>
    <p style="font-size:18px;font-weight:600;">${L.greeting(params.name)}</p>
    <p style="font-size:15px;">${params.complete ? L.completeBody : L.partialBody}</p>
    ${listHTML}
    <p style="font-size:15px;">${params.complete ? L.completeBody2 : L.partialBody2}</p>
    <div style="margin-top:30px;padding-top:20px;border-top:2px solid #CAF476;">
      <div style="font-size:15px;">${L.signoff}</div>
      <div style="font-weight:600;margin-top:15px;">${L.team}</div>
    </div>
  </div>
</body>
</html>`;

  const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
  await client.api(`/users/${sendAsUser}/sendMail`).post({
    message: {
      subject: params.complete ? L.subjectComplete : L.subjectPartial,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: params.to } }],
    },
    saveToSentItems: true,
  });

  console.log(
    `📨 Nachreich confirmation sent to ${params.to} (complete=${params.complete}, remaining=${params.remaining.length})`
  );
}
