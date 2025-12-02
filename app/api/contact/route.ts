import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

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

    // Create transporter (configure with your SMTP settings)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp-mail.outlook.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      },
      debug: true, // Enable debug output
      logger: true // Log to console
    });

    // Map inquiry types to German
    const inquiryTypeMap: { [key: string]: string } = {
      general: "Allgemeine Anfrage",
      partnership: "Partnerschaft",
      financing: "Finanzierung",
    };

    const inquiryTypeLabel = inquiryTypeMap[inquiryType] || inquiryType;

    // Verify transporter configuration
    try {
      await transporter.verify();
      console.log("✅ SMTP connection verified");
    } catch (verifyError: any) {
      console.error("❌ SMTP verification failed:", verifyError);
      throw new Error(`SMTP configuration error: ${verifyError.message}`);
    }

    // Create email HTML
    const emailHTML = `
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
    console.log("📧 Attempting to send email to:", "info@hypoteq.ch");
    console.log("📧 From:", process.env.SMTP_USER);
    
    const info = await transporter.sendMail({
      from: `"HYPOTEQ Kontaktformular" <${process.env.SMTP_USER}>`,
      to: "info@hypoteq.ch",
      replyTo: email,
      subject: `Neue Kontaktanfrage: ${inquiryTypeLabel} - ${firstName} ${lastName}`,
      text: emailText,
      html: emailHTML,
    });

    console.log("✅ Email sent successfully:", info.messageId);
    console.log("📬 Response:", info.response);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Contact form error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Fehler beim Senden der Nachricht" },
      { status: 500 }
    );
  }
}
