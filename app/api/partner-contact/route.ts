import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, message } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !message) {
      return NextResponse.json(
        { success: false, error: "Alle Pflichtfelder müssen ausgefüllt werden" },
        { status: 400 }
      );
    }

    // Priority order: Microsoft Graph > Resend > SMTP
    const useGraph = process.env.USE_GRAPH === "true" && 
                     process.env.GRAPH_TENANT_ID && 
                     process.env.GRAPH_CLIENT_ID && 
                     process.env.GRAPH_CLIENT_SECRET;
    
    const useResend = process.env.USE_RESEND === "true" && process.env.RESEND_API_KEY;

    if (useGraph) {
      const result = await sendWithGraph(firstName, lastName, email, phone, message);
      // Send auto-response to customer
      await sendAutoResponse(email, firstName, true, false, false);
      return result;
    } else if (useResend) {
      const result = await sendWithResend(firstName, lastName, email, phone, message);
      // Send auto-response to customer
      await sendAutoResponse(email, firstName, false, true, false);
      return result;
    } else {
      const result = await sendWithSMTP(firstName, lastName, email, phone, message);
      // Send auto-response to customer
      await sendAutoResponse(email, firstName, false, false, true);
      return result;
    }
  } catch (error: any) {
    console.error("❌ Partner contact form error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Fehler beim Senden der Nachricht" },
      { status: 500 }
    );
  }
}

// Send email using Microsoft Graph API (Best for Microsoft 365)
async function sendWithGraph(
  firstName: string, 
  lastName: string, 
  email: string, 
  phone: string, 
  message: string
) {
  try {
    console.log("📧 Sending partner contact email via Microsoft Graph API");

    // Create Azure AD credential
    const credential = new ClientSecretCredential(
      process.env.GRAPH_TENANT_ID!,
      process.env.GRAPH_CLIENT_ID!,
      process.env.GRAPH_CLIENT_SECRET!
    );

    // Initialize Graph client
    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken("https://graph.microsoft.com/.default");
          return token?.token || "";
        },
      },
    });

    const emailHTML = generateEmailHTML(firstName, lastName, email, phone, message);

    // Plain text version
    const emailText = `
Partner Kontaktanfrage - HYPOTEQ

Name: ${firstName} ${lastName}
E-Mail: ${email}
Telefon: ${phone}

Nachricht:
${message}

---
Eingegangen am: ${new Date().toLocaleString('de-CH')}
    `;

    // Send email using Graph API
    const sendMail = {
      message: {
        subject: `Partner Kontakt Form - ${firstName} ${lastName}`,
        body: {
          contentType: "HTML",
          content: emailHTML,
        },
        toRecipients: [
          {
            emailAddress: {
              address: process.env.SMTP_TO || "info@hypoteq.ch",
            },
          },
        ],
        replyTo: [
          {
            emailAddress: {
              address: email,
              name: `${firstName} ${lastName}`,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    // Send the email from the specified user
    const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
    
    await client
      .api(`/users/${sendAsUser}/sendMail`)
      .post(sendMail);

    console.log("✅ Partner contact email sent successfully via Microsoft Graph API");
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("❌ Microsoft Graph error:", error);
    console.error("Error details:", error.message, error.code);
    throw new Error(`Failed to send email via Microsoft Graph: ${error.message}`);
  }
}

// Send email using Resend (Recommended)
async function sendWithResend(
  firstName: string, 
  lastName: string, 
  email: string, 
  phone: string, 
  message: string
) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const emailHTML = generateEmailHTML(firstName, lastName, email, phone, message);

  try {
    console.log("📧 Sending partner contact email via Resend");
    
    const { data, error } = await resend.emails.send({
      from: 'HYPOTEQ Partner Kontaktformular <onboarding@resend.dev>',
      to: ['info@hypoteq.ch'],
      replyTo: email,
      subject: `Partner Kontakt Form - ${firstName} ${lastName}`,
      html: emailHTML,
    });

    if (error) {
      console.error("❌ Resend error:", error);
      throw new Error(error.message);
    }

    console.log("✅ Partner contact email sent successfully via Resend:", data?.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Resend error:", error);
    throw error;
  }
}

// Send email using SMTP (Fallback)
async function sendWithSMTP(
  firstName: string, 
  lastName: string, 
  email: string, 
  phone: string, 
  message: string
) {
  // Verify SMTP credentials are available
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("❌ Missing SMTP credentials");
    throw new Error("Email service not configured. Please add SMTP credentials or use Resend.");
  }

  // Create transporter (configure with your SMTP settings)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // false for STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    },
    requireTLS: true, // Force STARTTLS
    debug: true, // Enable debug output
    logger: true // Log to console
  });

  // Verify transporter configuration
  try {
    await transporter.verify();
    console.log("✅ SMTP connection verified");
  } catch (verifyError: any) {
    console.error("❌ SMTP verification failed:", verifyError);
    throw new Error(`SMTP configuration error: ${verifyError.message}`);
  }

  const emailHTML = generateEmailHTML(firstName, lastName, email, phone, message);

  // Plain text version
  const emailText = `
Partner Kontaktanfrage - HYPOTEQ

Name: ${firstName} ${lastName}
E-Mail: ${email}
Telefon: ${phone}

Nachricht:
${message}

---
Eingegangen am: ${new Date().toLocaleString('de-CH')}
  `;

  // Send email
  try {
    console.log("📧 Sending partner contact email via SMTP to: info@hypoteq.ch");
    console.log("📧 From:", process.env.SMTP_USER);
    
    const info = await transporter.sendMail({
      from: `"HYPOTEQ Partner Kontaktformular" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_TO || "info@hypoteq.ch",
      replyTo: email,
      subject: `Partner Kontakt Form - ${firstName} ${lastName}`,
      text: emailText,
      html: emailHTML,
    });

    console.log("✅ Partner contact email sent successfully via SMTP:", info.messageId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("❌ SMTP send error:", error);
    throw new Error(`Failed to send email via SMTP: ${error.message}`);
  }
}

// Send auto-response to customer
async function sendAutoResponse(
  customerEmail: string,
  firstName: string,
  useGraph: boolean,
  useResend: boolean,
  useSMTP: boolean
) {
  try {
    console.log("📧 Sending partner auto-response to customer:", customerEmail);

    const autoResponseHTML = generatePartnerAutoResponseHTML(firstName);
    const subject = "Vielen Dank für dein Interesse an einer Partnerschaft · Merci pour ton intérêt pour un partenariat · Grazie per il tuo interesse · Thank you for your interest in a partnership";

    if (useGraph) {
      const credential = new ClientSecretCredential(
        process.env.GRAPH_TENANT_ID!,
        process.env.GRAPH_CLIENT_ID!,
        process.env.GRAPH_CLIENT_SECRET!
      );

      const client = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken("https://graph.microsoft.com/.default");
            return token?.token || "";
          },
        },
      });

      const sendMail = {
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: autoResponseHTML,
          },
          toRecipients: [
            {
              emailAddress: {
                address: customerEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      };

      const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
      await client.api(`/users/${sendAsUser}/sendMail`).post(sendMail);
    } else if (useResend) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'HYPOTEQ <onboarding@resend.dev>',
        to: [customerEmail],
        subject: subject,
        html: autoResponseHTML,
      });
    } else if (useSMTP) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.office365.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        },
        requireTLS: true,
      });

      await transporter.sendMail({
        from: `"HYPOTEQ" <${process.env.SMTP_USER}>`,
        to: customerEmail,
        subject: subject,
        html: autoResponseHTML,
      });
    }

    console.log("✅ Partner auto-response sent successfully to:", customerEmail);
  } catch (error: any) {
    console.error("⚠️ Failed to send partner auto-response (non-critical):", error.message);
    // Don't throw - auto-response failure shouldn't fail the main request
  }
}

// Generate auto-response HTML for partner form
function generatePartnerAutoResponseHTML(firstName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
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
      <div style="color: #666; font-size: 14px;">Deine Hypotheken-Experten</div>
    </div>

    <!-- German -->
    <div class="section">
      <div class="greeting">Hi${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Danke für deine Anfrage und dein Interesse an einer Zusammenarbeit mit HYPOTEQ. Wir prüfen deine Angaben und melden uns in der Regel innerhalb eines Arbeitstages bei dir, um die nächsten Schritte zu besprechen.
      </div>
    </div>

    <!-- French -->
    <div class="section">
      <div class="greeting">Salut${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Merci pour ta demande et pour ton intérêt à collaborer avec HYPOTEQ. Nous examinons tes informations et te recontactons généralement dans un délai d'un jour ouvrable pour discuter des prochaines étapes.
      </div>
    </div>

    <!-- Italian -->
    <div class="section">
      <div class="greeting">Ciao${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Grazie per la tua richiesta e per l'interesse a collaborare con HYPOTEQ. Stiamo verificando i tuoi dati e ti ricontattiamo di solito entro un giorno lavorativo per discutere i prossimi passi.
      </div>
    </div>

    <!-- English -->
    <div class="section">
      <div class="greeting">Hi${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Thanks for your request and your interest in partnering with HYPOTEQ. We're reviewing your information and usually get back to you within one business day to discuss the next steps.
      </div>
    </div>

    <!-- Signature -->
    <div class="signature">
      <div class="text">Beste Grüsse / Meilleures salutations / Cordiali saluti / Best regards</div>
      <div class="team-name">Dein HYPOTEQ Team</div>
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
    <p>© ${new Date().getFullYear()} HYPOTEQ AG - Alle Rechte vorbehalten</p>
  </div>
</body>
</html>
  `;
}

// HTML email template
function generateEmailHTML(
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  message: string
): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Partner Kontaktanfrage</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background-color: #132219; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 500;">Partner Kontaktanfrage</h1>
      <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">HYPOTEQ</p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      
      <!-- Message -->
      <div style="margin-bottom: 30px;">
        <h2 style="color: #132219; font-size: 18px; font-weight: 600; margin: 0 0 20px 0;">Neue Partner Anfrage</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
          Sie haben eine neue Kontaktanfrage von einem potenziellen Partner über das HYPOTEQ Partner-Formular erhalten.
        </p>
      </div>

      <!-- Details -->
      <div style="background-color: #f8f9fa; border-left: 4px solid #132219; padding: 20px; margin-bottom: 30px;">
        
        <div style="margin-bottom: 15px;">
          <strong style="color: #132219; font-size: 14px; display: block; margin-bottom: 5px;">Name:</strong>
          <span style="color: #333; font-size: 16px;">${firstName} ${lastName}</span>
        </div>

        <div style="margin-bottom: 15px;">
          <strong style="color: #132219; font-size: 14px; display: block; margin-bottom: 5px;">E-Mail:</strong>
          <a href="mailto:${email}" style="color: #0066cc; font-size: 16px; text-decoration: none;">${email}</a>
        </div>

        <div style="margin-bottom: 15px;">
          <strong style="color: #132219; font-size: 14px; display: block; margin-bottom: 5px;">Telefon:</strong>
          <a href="tel:${phone}" style="color: #0066cc; font-size: 16px; text-decoration: none;">${phone}</a>
        </div>

      </div>

      <!-- Message Content -->
      <div style="margin-bottom: 30px;">
        <h3 style="color: #132219; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">Nachricht:</h3>
        <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
          <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="mailto:${email}" style="display: inline-block; background-color: #132219; color: #ffffff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-size: 16px; font-weight: 600;">
          Antworten
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e0e0e0;">
      <p style="color: #666; font-size: 13px; margin: 0; text-align: center;">
        Eingegangen am: ${new Date().toLocaleString('de-CH', { 
          dateStyle: 'full', 
          timeStyle: 'short' 
        })}
      </p>
      <p style="color: #999; font-size: 12px; margin: 10px 0 0 0; text-align: center;">
        Diese E-Mail wurde automatisch vom HYPOTEQ Partner-Kontaktformular generiert.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}
