import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, company, email, phone, inquiryType, message } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !inquiryType || !message) {
      return NextResponse.json(
        { success: false, error: "Alle Pflichtfelder müssen ausgefüllt werden" },
        { status: 400 }
      );
    }

    // Map inquiry types to German
    const inquiryTypeMap: { [key: string]: string } = {
      general: "Allgemeine Anfrage",
      partnership: "Partnerschaft",
      financing: "Finanzierung",
    };

    const inquiryTypeLabel = inquiryTypeMap[inquiryType] || inquiryType;

    // Priority order: Microsoft Graph > Resend > SMTP
    const useGraph = process.env.USE_GRAPH === "true" && 
                     process.env.GRAPH_TENANT_ID && 
                     process.env.GRAPH_CLIENT_ID && 
                     process.env.GRAPH_CLIENT_SECRET;
    
    const useResend = process.env.USE_RESEND === "true" && process.env.RESEND_API_KEY;

    if (useGraph) {
      return await sendWithGraph(firstName, lastName, company, email, phone, inquiryTypeLabel, message);
    } else if (useResend) {
      return await sendWithResend(firstName, lastName, company, email, phone, inquiryTypeLabel, message);
    } else {
      return await sendWithSMTP(firstName, lastName, company, email, phone, inquiryTypeLabel, message);
    }
  } catch (error: any) {
    console.error("❌ Contact form error:", error);
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
  company: string, 
  email: string, 
  phone: string, 
  inquiryTypeLabel: string, 
  message: string
) {
  try {
    console.log("📧 Sending email via Microsoft Graph API");

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

    const emailHTML = generateEmailHTML(firstName, lastName, company, email, phone, inquiryTypeLabel, message);

    // Plain text version
    const emailText = `
Neue Kontaktanfrage - HYPOTEQ

Anfrageart: ${inquiryTypeLabel}
Name: ${firstName} ${lastName}
${company ? `Firmenname: ${company}\n` : ''}
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
        subject: `Neue Kontaktanfrage: ${inquiryTypeLabel} - ${firstName} ${lastName}`,
        body: {
          contentType: "HTML",
          content: emailHTML,
        },
        toRecipients: [
          {
            emailAddress: {
              address: process.env.SMTP_TO || "fisnik.salihu@hypoteq.ch",
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
    const sendAsUser = process.env.SMTP_USER || "fisnik.salihu@hypoteq.ch";
    
    await client
      .api(`/users/${sendAsUser}/sendMail`)
      .post(sendMail);

    console.log("✅ Email sent successfully via Microsoft Graph API");
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
  company: string, 
  email: string, 
  phone: string, 
  inquiryTypeLabel: string, 
  message: string
) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const emailHTML = generateEmailHTML(firstName, lastName, company, email, phone, inquiryTypeLabel, message);

  try {
    console.log("📧 Sending email via Resend");
    
    const { data, error } = await resend.emails.send({
      from: 'HYPOTEQ Kontaktformular <onboarding@resend.dev>',
      to: ['fisnik.salihu@hypoteq.ch'],
      replyTo: email,
      subject: `[HYPOTEQ Web Contact Form] ${inquiryTypeLabel} - ${firstName} ${lastName}`,
      html: emailHTML,
    });

    if (error) {
      console.error("❌ Resend error:", error);
      throw new Error(error.message);
    }

    console.log("✅ Email sent successfully via Resend:", data?.id);
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
  company: string, 
  email: string, 
  phone: string, 
  inquiryTypeLabel: string, 
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

  const emailHTML = generateEmailHTML(firstName, lastName, company, email, phone, inquiryTypeLabel, message);

  // Plain text version
  const emailText = `
Neue Kontaktanfrage - HYPOTEQ

Anfrageart: ${inquiryTypeLabel}
Name: ${firstName} ${lastName}
${company ? `Firmenname: ${company}\n` : ''}
E-Mail: ${email}
Telefon: ${phone}

Nachricht:
${message}

---
Eingegangen am: ${new Date().toLocaleString('de-CH')}
  `;

  // Send email
  try {
    console.log("📧 Sending email via SMTP to: fisnik.salihu@hypoteq.ch");
    console.log("📧 From:", process.env.SMTP_USER);
    
    const info = await transporter.sendMail({
      from: `"HYPOTEQ Kontaktformular" <${process.env.SMTP_USER}>`,
      to: "fisnik.salihu@hypoteq.ch",
      replyTo: email,
      subject: `Neue Kontaktanfrage: ${inquiryTypeLabel} - ${firstName} ${lastName}`,
      text: emailText,
      html: emailHTML,
    });

    console.log("✅ Email sent successfully via SMTP:", info.messageId);
    console.log("📬 Response:", info.response);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ SMTP send error:", error);
    throw error;
  }
}

// Generate HTML email template
function generateEmailHTML(
  firstName: string, 
  lastName: string, 
  company: string, 
  email: string, 
  phone: string, 
  inquiryTypeLabel: string, 
  message: string
): string {
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              line-height: 1.6;
              color: #132219;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #132219;
              color: #CAF476;
              padding: 30px 20px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 500;
            }
            .content {
              background-color: #ffffff;
              padding: 30px;
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .field {
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 1px solid #f0f0f0;
            }
            .field:last-child {
              border-bottom: none;
            }
            .label {
              font-weight: 600;
              color: #132219;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 5px;
            }
            .value {
              font-size: 16px;
              color: #132219;
              margin-top: 5px;
            }
            .message-box {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #CAF476;
              margin-top: 10px;
            }
            .footer {
              text-align: center;
              padding: 20px;
              font-size: 12px;
              color: #666;
              background-color: #f8f9fa;
              border-radius: 0 0 10px 10px;
            }
            .badge {
              display: inline-block;
              background-color: #CAF476;
              color: #132219;
              padding: 6px 16px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 600;
              margin-top: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📩 Neue Kontaktanfrage</h1>
          </div>
          
          <div class="content">
            <div class="field">
              <div class="label">Anfrageart</div>
              <div class="badge">${inquiryTypeLabel}</div>
            </div>

            <div class="field">
              <div class="label">Name</div>
              <div class="value">${firstName} ${lastName}</div>
            </div>

            ${company ? `
            <div class="field">
              <div class="label">Firmenname</div>
              <div class="value">${company}</div>
            </div>
            ` : ''}

            <div class="field">
              <div class="label">E-Mail</div>
              <div class="value">
                <a href="mailto:${email}" style="color: #132219; text-decoration: none;">
                  ${email}
                </a>
              </div>
            </div>

            <div class="field">
              <div class="label">Telefon</div>
              <div class="value">
                <a href="tel:${phone}" style="color: #132219; text-decoration: none;">
                  ${phone}
                </a>
              </div>
            </div>

            <div class="field">
              <div class="label">Nachricht</div>
              <div class="message-box">
                ${message.replace(/\n/g, '<br>')}
              </div>
            </div>

            <div class="field" style="border: none; margin-top: 30px; padding-top: 20px; border-top: 2px solid #CAF476;">
              <div class="label" style="margin-bottom: 10px;">📅 Eingegangen am</div>
              <div class="value">${new Date().toLocaleString('de-CH', {
                dateStyle: 'full',
                timeStyle: 'short'
              })}</div>
            </div>
          </div>

          <div class="footer">
            <p style="margin: 0;">HYPOTEQ AG | Löwenstrasse 29 | 8001 Zürich</p>
            <p style="margin: 5px 0 0 0;">
              <a href="https://hypoteq.ch" style="color: #666; text-decoration: none;">www.hypoteq.ch</a>
            </p>
          </div>
        </body>
      </html>
    `;
}
