/**
 * The confirmation mail a customer gets right after submitting the funnel (Spezifikation 3
 * Schritt 6; DECISIONS D9, D11, D17, D20). Pure: the subject and the HTML, so the texts and the
 * Fallnummer / return link can be tested without a mailbox. Sent by app/api/inquiry/route.ts.
 *
 * Address (D9): DE «du», FR «vous», IT «Lei», EN neutral. A Funnel v3 submission adds its
 * Fallnummer (subject and body) and a button back to the inquiry — the Nachreich link, where the
 * customer sees the state of the dossier and can add documents (D20).
 */

export type AutoResponseLocale = "de" | "fr" | "it" | "en";

export interface AutoResponseExtras {
  /** `HQ-26-10-123456` — subject suffix and a line in the body. */
  caseNumber?: string | null;
  /** Absolute link back to the inquiry (Nachreich page). */
  returnUrl?: string | null;
}

export const AUTO_RESPONSE_SUBJECT: Record<AutoResponseLocale, string> = {
  de: "Deine Hypothekaranfrage ist eingegangen",
  fr: "Votre demande d'hypothèque a été reçue",
  it: "La Sua richiesta ipotecaria è stata ricevuta",
  en: "Your mortgage request has been received",
};

/** «Fallnummer» as the mails label it; shared with the dossier mails of the route. */
export const CASE_NUMBER_LABEL: Record<AutoResponseLocale, string> = {
  de: "Fallnummer",
  fr: "Numéro de dossier",
  it: "Numero di pratica",
  en: "Case number",
};

export const AUTO_RESPONSE_CONTENT: Record<
  AutoResponseLocale,
  {
    tagline: string;
    greetingFn: (name: string) => string;
    body: string;
    linkIntro: string;
    linkCta: string;
    signoff: string;
    team: string;
    rights: string;
  }
> = {
  de: {
    tagline: "Deine Hypotheken-Experten",
    greetingFn: (n) => `Hi${n ? " " + n : ""},`,
    body: "Danke für deine Anfrage und dein Vertrauen in HYPOTEQ. Wir haben alle Informationen erhalten und melden uns bald (werktags), um die nächsten Schritte zu besprechen.",
    linkIntro: "Deine Anfrage findest du jederzeit über deinen persönlichen Link – dort siehst du den Stand deines Dossiers und kannst jederzeit Unterlagen nachreichen:",
    linkCta: "Zur Anfrage",
    signoff: "Beste Grüsse",
    team: "Dein HYPOTEQ Team",
    rights: "Alle Rechte vorbehalten",
  },
  fr: {
    tagline: "Vos experts hypothécaires",
    greetingFn: (n) => `Bonjour${n ? " " + n : ""},`,
    body: "Merci pour votre demande et votre confiance envers HYPOTEQ. Nous avons bien reçu toutes les informations et vous recontacterons prochainement (jours ouvrables) pour discuter des prochaines étapes.",
    linkIntro: "Vous pouvez revenir à votre demande à tout moment via votre lien personnel – vous y verrez l'état de votre dossier et pourrez ajouter des documents à tout moment :",
    linkCta: "Voir ma demande",
    signoff: "Meilleures salutations",
    team: "Votre équipe HYPOTEQ",
    rights: "Tous droits réservés",
  },
  it: {
    tagline: "I Suoi esperti ipotecari",
    greetingFn: (n) => `Buongiorno${n ? " " + n : ""},`,
    body: "Grazie per la Sua richiesta e per la fiducia in HYPOTEQ. Abbiamo ricevuto tutte le informazioni e La ricontatteremo presto (giorni lavorativi) per discutere i prossimi passi.",
    linkIntro: "Può tornare alla Sua richiesta in qualsiasi momento tramite il Suo link personale – lì vede lo stato del Suo dossier e può aggiungere documenti in qualsiasi momento:",
    linkCta: "Alla mia richiesta",
    signoff: "Cordiali saluti",
    team: "Il Suo team HYPOTEQ",
    rights: "Tutti i diritti riservati",
  },
  en: {
    tagline: "Your mortgage experts",
    greetingFn: (n) => `Hi${n ? " " + n : ""},`,
    body: "Thanks for your request and your trust in HYPOTEQ. We've received all the information and will get back to you soon (business days) to discuss the next steps.",
    linkIntro: "You can return to your request at any time via your personal link – it shows the state of your dossier and lets you add documents at any time:",
    linkCta: "Open my request",
    signoff: "Best regards",
    team: "Your HYPOTEQ team",
    rights: "All rights reserved",
  },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Subject, with «– Fallnummer HQ-…» appended when the inquiry has one. */
export function autoResponseSubject(locale: AutoResponseLocale, caseNumber?: string | null): string {
  const base = AUTO_RESPONSE_SUBJECT[locale];
  return caseNumber ? `${base} – ${CASE_NUMBER_LABEL[locale]} ${caseNumber}` : base;
}

export function generateFunnelAutoResponseHTML(firstName: string, locale: AutoResponseLocale = "de", extras: AutoResponseExtras = {}): string {
  const c = AUTO_RESPONSE_CONTENT[locale];
  const caseNumber = extras.caseNumber?.trim() || null;
  const returnUrl = extras.returnUrl?.trim() || null;
  const caseHTML = caseNumber
    ? `<div class="case">${CASE_NUMBER_LABEL[locale]} <strong>${escapeHtml(caseNumber)}</strong></div>`
    : "";
  const linkHTML = returnUrl
    ? `
    <div class="section">
      <div class="text">${c.linkIntro}</div>
      <p style="margin: 22px 0;">
        <a href="${escapeHtml(returnUrl)}"
           style="background:#132219;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:600;display:inline-block;">${c.linkCta}</a>
      </p>
    </div>`
    : "";
  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      line-height: 1.8;
      color: #132219;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 10px;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #CAF476;
    }
    .logo {
      font-size: 32px;
      font-weight: 700;
      color: #132219;
      margin-bottom: 10px;
    }
    .section {
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e0e0e0;
    }
    .section:last-of-type {
      border-bottom: none;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #132219;
      margin-bottom: 10px;
    }
    .case {
      font-size: 14px;
      color: #555;
      margin-bottom: 12px;
    }
    .text {
      font-size: 15px;
      line-height: 1.8;
      color: #333;
      margin: 10px 0;
    }
    .signature {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #CAF476;
    }
    .team-name {
      font-weight: 600;
      color: #132219;
      margin-top: 15px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      text-align: center;
      font-size: 12px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">HYPOTEQ</div>
      <div style="color: #666; font-size: 14px;">${c.tagline}</div>
    </div>

    <div class="section">
      <div class="greeting">${c.greetingFn(escapeHtml(firstName || ""))}</div>
      ${caseHTML}
      <div class="text">${c.body}</div>
    </div>
    ${linkHTML}

    <!-- Signature -->
    <div class="signature">
      <div class="text">${c.signoff}</div>
      <div class="team-name">${c.team}</div>
      <div style="margin-top: 20px; font-size: 13px; color: #666;">
        <div>Marco Circelli</div>
        <div>HYPOTEQ AG</div>
        <div style="margin-top: 10px;">
          📱 +41 79 815 35 65<br>
          📞 +41 44 554 41 00<br>
          ✉️ marco.circelli@hypoteq.ch<br>
          🌐 www.hypoteq.ch
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>© ${new Date().getFullYear()} HYPOTEQ AG - ${c.rights}</p>
  </div>
</body>
</html>
  `;
}
