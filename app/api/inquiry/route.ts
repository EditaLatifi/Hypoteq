import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";

export async function POST(req: Request) {
  try {
    // Parse the incoming request body (JSON)
    const data = await req.json();
    console.log('📥 Received data:', JSON.stringify(data, null, 2)); // Debugging step to ensure proper structure

    // === EMAIL VALIDATION ===
    const email = data?.client?.email;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: "Valid email is required." }, { status: 400 });
    }

    // Only send email notification, do not save to database
    try {
      const now = new Date();
      await sendFunnelNotificationEmail(
        data,
        {
          id: data.id || Math.random().toString(36).substring(2, 10), // fallback if no id
          createdAt: now.toISOString(),
        }
      );
      console.log("✅ Email notification sent successfully");
    } catch (emailError) {
      console.error("⚠️ Email notification failed (continuing):", emailError);
      // Don't fail the request if email fails
    }

    // Send auto-response to customer
    try {
      if (data.client?.email) {
        await sendFunnelAutoResponse(data.client.email, data.client.firstName || data.client.vorname || '');
        console.log("✅ Auto-response sent to customer");
      }
    } catch (autoResponseError) {
      console.error("⚠️ Auto-response failed (continuing):", autoResponseError);
      // Don't fail the request if auto-response fails
    }

    // Salesforce sync (backend only)
    try {
      // Ensure LastName is present for Salesforce
      if (data.client && data.client.lastName) {
        data.lastName = data.client.lastName;
      }
      const salesforceApi = (await import("@/components/salesforceApi")).default;
      const { syncFunnelStepsToSalesforce } = await import("@/components/syncFunnelStepsToSalesforce");
      await salesforceApi.login();
      await syncFunnelStepsToSalesforce(data, salesforceApi);
      console.log("✅ Salesforce sync successful!");
    } catch (sfError) {
      console.error("❌ Salesforce sync failed:", sfError);
      // Don't fail the request if Salesforce fails
    }

    // === SAVE TO DATABASE ===
    try {
      // Save Inquiry and all related data (without documents)
      const inquiry = await prisma.inquiry.create({
        data: {
          customerType: data.customerType,
          client: {
            create: {
              firstName: data.client?.firstName || '',
              lastName: data.client?.lastName || '',
              email: data.client?.email,
              phone: data.client?.phone || '',
              zip: data.client?.zip || '',
              partnerEmail: data.client?.partnerEmail || '',
            },
          },
          project: data.project ? {
            create: {
              projektArt: data.project.projektArt || '',
              kreditnehmerTyp: data.project.kreditnehmerTyp || '',
              liegenschaftZip: data.project.liegenschaftZip || '',
              borrowerType: data.project.borrowerType || '',
              artImmobilie: data.project.artImmobilie || '',
              neubauArt: data.project.neubauArt || '',
              artLiegenschaft: data.project.artLiegenschaft || '',
              nutzung: data.project.nutzung || '',
              renovation: data.project.renovation || '',
              renovationsBetrag: data.project.renovationsBetrag || '',
              reserviert: data.project.reserviert || '',
              finanzierungsangebote: data.project.finanzierungsangebote || '',
              angebote: data.project.angebote ? data.project.angebote : undefined,
            },
          } : undefined,
          property: data.property ? {
            create: {
              artLiegenschaft: data.property.artLiegenschaft || '',
              artImmobilie: data.property.artImmobilie || '',
              nutzung: data.property.nutzung || '',
              renovation: data.property.renovation || '',
              renovationsBetrag: data.property.renovationsBetrag || '',
              finanzierungsangebote: data.property.finanzierungsangebote || '',
              reserviert: data.property.reserviert || '',
              angeboteListe: data.property.angeboteListe || [],
              angebote: data.property.angebote ? data.property.angebote : undefined,
              kreditnehmer: data.property.kreditnehmer ? data.property.kreditnehmer : undefined,
              firmen: data.property.firmen ? data.property.firmen : undefined,
            },
          } : undefined,
          financing: data.financing ? {
            create: {
              kaufpreis: data.financing.kaufpreis || '',
              eigenmittel_bar: data.financing.eigenmittel_bar || '',
              eigenmittel_saeule3: data.financing.eigenmittel_saeule3 || '',
              eigenmittel_pk: data.financing.eigenmittel_pk || '',
              eigenmittel_schenkung: data.financing.eigenmittel_schenkung || '',
              pkVorbezug: data.financing.pkVorbezug || '',
              hypoBetrag: data.financing.hypoBetrag || '',
              modell: data.financing.modell || '',
              einkommen: data.financing.einkommen || '',
              steueroptimierung: data.financing.steueroptimierung || '',
              kaufdatum: data.financing.kaufdatum || '',
              kommentar: data.financing.kommentar || '',
              abloesung_betrag: data.financing.abloesung_betrag || '',
              erhoehung: data.financing.erhoehung || '',
              erhoehung_betrag: data.financing.erhoehung_betrag || '',
              abloesedatum: data.financing.abloesedatum || '',
              brutto: data.financing.brutto || '',
            },
          } : undefined,
          borrowers: data.borrowers && Array.isArray(data.borrowers) ? {
            create: data.borrowers.map((b: any) => ({
              firstName: b.firstName || '',
              lastName: b.lastName || '',
              birthdate: b.birthdate || '',
              job: b.job || '',
              type: b.type || '',
              civil: b.civil || '',
              firmaName: b.firmaName || '',
              firmaUID: b.firmaUID || '',
              email: b.email || '',
              telefon: b.telefon || '',
              geburtsdatum: b.geburtsdatum || '',
              erwerb: b.erwerb || '',
              zivilstand: b.zivilstand || '',
            })),
          } : undefined,
          // documents removed from inquiry creation
        },
      });
      console.log("✅ Inquiry and all data saved to DB:", inquiry.id);

      // === ASSOCIATE HOLDING DOCUMENTS ===
      // If tempUserId is provided in the request, move holding documents to Document table
      const tempUserId = data.tempUserId || null;
      if (tempUserId) {
        const holdingDocs = await prisma.holdingDocument.findMany({
          where: {
            email: data.client?.email,
            tempUserId: tempUserId,
          },
        });
        for (const doc of holdingDocs) {
          await prisma.document.create({
            data: {
              inquiryId: inquiry.id,
              email: doc.email,
              fileName: doc.fileName,
              fileUrl: doc.fileUrl,
              uploadedAt: doc.uploadedAt,
            },
          });
          await prisma.holdingDocument.delete({ where: { id: doc.id } });
        }
        if (holdingDocs.length > 0) {
          console.log(`✅ Associated ${holdingDocs.length} holding documents with inquiry ${inquiry.id}`);
        }
      }

      return NextResponse.json({ success: true, inquiryId: inquiry.id });
    } catch (dbErr) {
      console.error("❌ Failed to save inquiry to DB:", dbErr);
      let errorMsg = 'Failed to save inquiry';
      if (dbErr instanceof Error) errorMsg = dbErr.message;
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
  } catch (err: unknown) {
    // Type assertion to ensure 'err' is treated as an Error
    if (err instanceof Error) {
      console.error("❌ Failed to save inquiry:", err);
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
    // In case it's not an instance of Error (fallback case)
    console.error("❌ Unknown error:", err);
    return NextResponse.json({ success: false, error: "An unknown error occurred." }, { status: 500 });
  }
}

// Send email notification for funnel submission
async function sendFunnelNotificationEmail(data: any, saved: any) {
  const useGraph = process.env.USE_GRAPH === "true" && 
                   process.env.GRAPH_TENANT_ID && 
                   process.env.GRAPH_CLIENT_ID && 
                   process.env.GRAPH_CLIENT_SECRET;

  if (!useGraph) {
    console.log("⚠️ Email notifications disabled - set USE_GRAPH=true in .env");
    return;
  }

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

  const emailHTML = generateFunnelEmailHTML(data, saved);
  const subject = `Neue Hypothekanfrage ${data.customerType === 'partner' ? '(Partner)' : '(Direkt)'} - ID: ${saved.id}`;

  const sendMail = {
    message: {
      subject: subject,
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
      replyTo: data.client?.email ? [
        {
          emailAddress: {
            address: data.client.email,
            name: `${data.client.vorname || ''} ${data.client.name || ''}`.trim(),
          },
        },
      ] : undefined,
    },
    saveToSentItems: true,
  };

  const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
  await client.api(`/users/${sendAsUser}/sendMail`).post(sendMail);
}

// Generate HTML email template for funnel submission
function generateFunnelEmailHTML(data: any, saved: any): string {
      // Mapping for borrower type
      const typLabels: Record<string, string> = {
        nat: 'Natürliche Person',
        jur: 'Juristische Person',
        partner: 'Partner',
      };
      // Mapping for finanzierungsmodell
      const finanzierungsmodellLabels: Record<string, string> = {
        saron: 'SARON',
        mix: 'Mix',
        '1': '1 Jahr',
        '2': '2 Jahre',
        '3': '3 Jahre',
        '4': '4 Jahre',
        '5': '5 Jahre',
        '6': '6 Jahre',
        '7': '7 Jahre',
        '8': '8 Jahre',
        '9': '9 Jahre',
        '10': '10 Jahre',
      };
    // Mapping for property fields
    const artImmobilieLabels: Record<string, string> = {
      neubau: 'Neubau',
      bestandsobjekt: 'Bestandsobjekt',
      rendite: 'Rendite-Immobilie',
      bestehend: 'Bestehende Immobilie',
      // add more as needed
    };
    const neubauArtLabels: Record<string, string> = {
      bereits_erstellt: 'Bereits erstellt',
      im_bau: 'Im Bau',
      geplant: 'Geplant',
      // add more as needed
    };

  const customerTypeLabel = data.customerType === 'partner' ? 'Partner' : data.customerType === 'direct' ? 'Direktkunde' : 'Unbekannt';
  const projektArtLabel = data.project?.projektArt === 'kauf' ? 'Kauf' : data.project?.projektArt === 'abloesung' ? 'Ablösung' : 'Nicht angegeben';
  
  // Format borrowers/kreditnehmer from property
  const kreditnehmerHTML = (data.property?.kreditnehmer || []).map((kn: any, index: number) => `
    <tr>
      <td style="padding: 8px; background-color: #f9f9f9;"><strong>Kreditnehmer ${index + 1}:</strong></td>
      <td style="padding: 8px; background-color: #f9f9f9;">${kn.vorname || ''} ${kn.name || ''}</td>
    </tr>
    ${kn.id ? `<tr><td style="padding: 8px; padding-left: 20px;">ID:</td><td style="padding: 8px;">${kn.id}</td></tr>` : ''}
    ${kn.geburtsdatum ? `<tr><td style="padding: 8px; padding-left: 20px;">Geburtsdatum:</td><td style="padding: 8px;">${kn.geburtsdatum}</td></tr>` : ''}
    ${kn.erwerb ? `<tr><td style="padding: 8px; padding-left: 20px;">Erwerbsstatus:</td><td style="padding: 8px;">${kn.erwerb}</td></tr>` : ''}
    ${kn.status ? `<tr><td style="padding: 8px; padding-left: 20px;">Status:</td><td style="padding: 8px;">${kn.status}</td></tr>` : ''}
  `).join('');

  // Format firmen (for Juristische Person)
  const firmenHTML = (data.property?.firmen || []).filter((f: any) => f.firmenname).map((firma: any, index: number) => `
    <tr>
      <td style="padding: 8px; background-color: #f9f9f9;"><strong>Firma ${index + 1}:</strong></td>
      <td style="padding: 8px; background-color: #f9f9f9;">${firma.firmenname}</td>
    </tr>
  `).join('');

  // Format financing offers from angeboteListe
  const angeboteHTML = (data.property?.angeboteListe || []).map((offer: string, index: number) => `
    <tr>
      <td style="padding: 8px; padding-left: 20px;">Angebot ${index + 1}:</td>
      <td style="padding: 8px;">${offer}</td>
    </tr>
  `).join('');

  // Calculate total Eigenmittel
  const totalEigenmittel = 
    Number(data.financing?.eigenmittel_bar || 0) +
    Number(data.financing?.eigenmittel_saeule3 || 0) +
    Number(data.financing?.eigenmittel_pk || 0) +
    Number(data.financing?.eigenmittel_schenkung || 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      line-height: 1.6;
      color: #132219;
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #132219 0%, #1a2d22 100%);
      color: #CAF476;
      padding: 30px 20px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      background-color: white;
      padding: 30px;
      border-radius: 0 0 10px 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      background-color: #CAF476;
      color: #132219;
      padding: 10px 15px;
      border-radius: 5px;
      font-weight: 600;
      margin-bottom: 15px;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    td:first-child {
      font-weight: 500;
      width: 40%;
      color: #555;
    }
    .highlight {
      background-color: #fff8e6;
      padding: 15px;
      border-left: 4px solid #CAF476;
      margin: 15px 0;
      border-radius: 5px;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #888;
      font-size: 12px;
    }
    .summary-box {
      background-color: #f0f9ff;
      border: 2px solid #CAF476;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .summary-box strong {
      color: #132219;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 Neue Hypothekanfrage</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">Anfrage-ID: ${saved.id}</p>
  </div>

  <div class="content">
    <div class="highlight">
      <strong>Kundentyp:</strong> ${customerTypeLabel}<br>
      <strong>Projekt:</strong> ${projektArtLabel}<br>
      <strong>Eingegangen am:</strong> ${new Date(saved.createdAt).toLocaleString('de-CH', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}
    </div>

    ${data.client ? `
    <div class="section">
      <div class="section-title">👤 Kundendaten</div>
      <table>
        ${data.client.firstName ? `<tr><td>Vorname:</td><td>${data.client.firstName}</td></tr>` : ''}
        ${data.client.lastName ? `<tr><td>Nachname:</td><td>${data.client.lastName}</td></tr>` : ''}
        ${data.client.vorname ? `<tr><td>Vorname:</td><td>${data.client.vorname}</td></tr>` : ''}
        ${data.client.name ? `<tr><td>Nachname:</td><td>${data.client.name}</td></tr>` : ''}
        ${data.client.email ? `<tr><td>E-Mail:</td><td><a href="mailto:${data.client.email}" style="color: #132219; text-decoration: underline;">${data.client.email}</a></td></tr>` : ''}
        ${data.client.phone ? `<tr><td>Telefon:</td><td><a href="tel:${data.client.phone}" style="color: #132219; text-decoration: underline;">${data.client.phone}</a></td></tr>` : ''}
        ${data.client.phone ? `<tr><td>Telefon:</td><td><a href="tel:${data.client.phone}" style="color: #132219; text-decoration: underline;">${data.client.phone}</a></td></tr>` : ''}
        ${data.client.firma ? `<tr><td>Firma:</td><td>${data.client.firma}</td></tr>` : ''}
        ${data.client.partnerEmail ? `<tr><td>Partner E-Mail:</td><td><a href="mailto:${data.client.partnerEmail}" style="color: #132219; text-decoration: underline;">${data.client.partnerEmail}</a></td></tr>` : ''}
      </table>
    </div>
    ` : ''}

    ${data.project ? `
    <div class="section">
      <div class="section-title">🏗️ Projektinformationen</div>
      <table>
        <tr><td>Projektart:</td><td><strong>${projektArtLabel}</strong></td></tr>
        ${data.project.liegenschaftZip ? `<tr><td>PLZ Liegenschaft:</td><td>${data.project.liegenschaftZip}</td></tr>` : ''}
        ${data.project.kreditnehmerTyp ? `<tr><td>Kreditnehmer Typ:</td><td>${data.project.kreditnehmerTyp}</td></tr>` : ''}
      </table>
    </div>
    ` : ''}

    ${data.property ? `
    <div class="section">
      <div class="section-title">🏠 Immobiliendetails</div>
      <table>
        ${data.property.artImmobilie ? `<tr><td>Art der Immobilie:</td><td><strong>${artImmobilieLabels[data.property.artImmobilie] || data.property.artImmobilie}</strong></td></tr>` : ''}
        ${data.property.neubauArt ? `<tr><td>Neubau Art:</td><td>${neubauArtLabels[data.property.neubauArt] || data.property.neubauArt}</td></tr>` : ''}
        ${data.property.artLiegenschaft ? `<tr><td>Art der Liegenschaft:</td><td>${data.property.artLiegenschaft}</td></tr>` : ''}
        ${data.property.nutzung ? `<tr><td>Nutzung:</td><td>${data.property.nutzung}</td></tr>` : ''}
        ${data.property.renovation ? `<tr><td>Renovation:</td><td><strong>${data.property.renovation === 'ja' ? 'Ja' : 'Nein'}</strong></td></tr>` : ''}
        ${data.property.renovationsBetrag && Number(data.property.renovationsBetrag) > 0 ? `<tr><td>Renovationsbetrag:</td><td><strong>CHF ${Number(data.property.renovationsBetrag).toLocaleString('de-CH')}</strong></td></tr>` : ''}
        ${data.property.reserviert ? `<tr><td>Reserviert:</td><td><strong>${data.property.reserviert === 'ja' ? 'Ja' : 'Nein'}</strong></td></tr>` : ''}
        ${data.property.finanzierungsangebote ? `<tr><td>Finanzierungsangebote:</td><td>${data.property.finanzierungsangebote}</td></tr>` : ''}
      </table>
      ${angeboteHTML ? `
        <div style="margin-top: 15px; background-color: #f9f9f9; padding: 15px; border-radius: 5px;">
          <strong style="color: #132219;">📊 Finanzierungsangebote:</strong>
          <table style="margin-top: 10px;">${angeboteHTML}</table>
        </div>
      ` : ''}
    </div>
    ` : ''}

    ${kreditnehmerHTML ? `
    <div class="section">
      <div class="section-title">👥 Kreditnehmer</div>
      <table>
        ${kreditnehmerHTML}
      </table>
    </div>
    ` : ''}

    ${firmenHTML ? `
    <div class="section">
      <div class="section-title">🏢 Firmen / Juristische Personen</div>
      <table>
        ${firmenHTML}
      </table>
    </div>
    ` : ''}

    ${data.financing ? `
    <div class="section">
      <div class="section-title">💰 Finanzierungsdetails</div>
      
      ${data.financing.kaufpreis ? `
      <div class="summary-box">
        <strong>Gesamtübersicht:</strong><br>
        Kaufpreis: <strong>CHF ${Number(data.financing.kaufpreis).toLocaleString('de-CH')}</strong><br>
        ${totalEigenmittel > 0 ? `Eigenmittel Total: <strong>CHF ${totalEigenmittel.toLocaleString('de-CH')}</strong><br>` : ''}
        ${data.financing.hypoBetrag ? `Hypothekenbetrag: <strong>CHF ${Number(data.financing.hypoBetrag).toLocaleString('de-CH')}</strong>` : ''}
      </div>
      ` : ''}
      
      <table>
        ${data.financing.kaufpreis ? `<tr><td>Kaufpreis:</td><td><strong>CHF ${Number(data.financing.kaufpreis).toLocaleString('de-CH')}</strong></td></tr>` : ''}
        ${data.financing.abloesung_betrag ? `<tr><td>Ablösungsbetrag:</td><td><strong>CHF ${Number(data.financing.abloesung_betrag).toLocaleString('de-CH')}</strong></td></tr>` : ''}
        
        ${data.financing.eigenmittel_bar || data.financing.eigenmittel_saeule3 || data.financing.eigenmittel_pk || data.financing.eigenmittel_schenkung ? `
        <tr><td colspan="2" style="background-color: #f0f9ff; padding: 12px; font-weight: 600;">Eigenmittel Aufschlüsselung:</td></tr>
        ` : ''}
        ${data.financing.eigenmittel_bar && Number(data.financing.eigenmittel_bar) > 0 ? `<tr><td style="padding-left: 20px;">💵 Barmittel:</td><td>CHF ${Number(data.financing.eigenmittel_bar).toLocaleString('de-CH')}</td></tr>` : ''}
        ${data.financing.eigenmittel_saeule3 && Number(data.financing.eigenmittel_saeule3) > 0 ? `<tr><td style="padding-left: 20px;">🏦 3. Säule:</td><td>CHF ${Number(data.financing.eigenmittel_saeule3).toLocaleString('de-CH')}</td></tr>` : ''}
        ${data.financing.eigenmittel_pk && Number(data.financing.eigenmittel_pk) > 0 ? `<tr><td style="padding-left: 20px;">💼 Pensionskasse:</td><td>CHF ${Number(data.financing.eigenmittel_pk).toLocaleString('de-CH')}</td></tr>` : ''}
        ${data.financing.eigenmittel_schenkung && Number(data.financing.eigenmittel_schenkung) > 0 ? `<tr><td style="padding-left: 20px;">🎁 Schenkung/Andere:</td><td>CHF ${Number(data.financing.eigenmittel_schenkung).toLocaleString('de-CH')}</td></tr>` : ''}
        ${totalEigenmittel > 0 ? `<tr><td style="padding-left: 20px; font-weight: 600;">Total Eigenmittel:</td><td style="font-weight: 600;">CHF ${totalEigenmittel.toLocaleString('de-CH')}</td></tr>` : ''}
        
        ${data.financing.pkVorbezug ? `<tr><td>PK Vorbezug:</td><td>${data.financing.pkVorbezug}</td></tr>` : ''}
        ${data.financing.hypoBetrag ? `<tr><td>Hypothekenbetrag:</td><td><strong>CHF ${Number(data.financing.hypoBetrag).toLocaleString('de-CH')}</strong></td></tr>` : ''}
        ${data.financing.modell ? `<tr><td>Hypothekarlaufzeiten:</td><td>${finanzierungsmodellLabels[data.financing.modell] || data.financing.modell}</td></tr>` : ''}
        ${data.financing.einkommen ? `<tr><td>Brutto-Jahreseinkommen:</td><td>CHF ${Number(data.financing.einkommen).toLocaleString('de-CH')}</td></tr>` : ''}
        ${data.financing.steueroptimierung ? `<tr><td>Steueroptimierung:</td><td>${data.financing.steueroptimierung}</td></tr>` : ''}
        ${data.financing.kaufdatum ? `<tr><td>Kaufdatum:</td><td>${data.financing.kaufdatum}</td></tr>` : ''}
        ${data.financing.erhoehung ? `<tr><td>Erhöhung:</td><td>${data.financing.erhoehung}</td></tr>` : ''}
        ${data.financing.erhoehung_betrag && Number(data.financing.erhoehung_betrag) > 0 ? `<tr><td>Erhöhungsbetrag:</td><td>CHF ${Number(data.financing.erhoehung_betrag).toLocaleString('de-CH')}</td></tr>` : ''}
        ${data.financing.abloesedatum ? `<tr><td>Ablösedatum:</td><td>${data.financing.abloesedatum}</td></tr>` : ''}
        ${data.financing.kommentar ? `
        <tr>
          <td style="vertical-align: top;">Kommentar:</td>
          <td style="white-space: pre-wrap; background-color: #f9f9f9; padding: 10px; border-radius: 5px;">${data.financing.kommentar}</td>
        </tr>` : ''}
      </table>
    </div>
    ` : ''}

    ${data.borrowers && data.borrowers.length > 0 ? `
    <div class="section">
      <div class="section-title">📝 Partner Kreditnehmer (Zusätzliche)</div>
      <table>
        ${data.borrowers.map((b: any, i: number) => `
          <tr>
            <td colspan="2" style="background-color: #f9f9f9; font-weight: 600; padding: 12px;">Kreditnehmer ${i + 1}</td>
          </tr>
          ${b.vorname ? `<tr><td style="padding-left: 20px;">Vorname:</td><td>${b.vorname}</td></tr>` : ''}
          ${b.name ? `<tr><td style="padding-left: 20px;">Nachname:</td><td>${b.name}</td></tr>` : ''}
          ${b.geburtsdatum ? `<tr><td style="padding-left: 20px;">Geburtsdatum:</td><td>${b.geburtsdatum}</td></tr>` : ''}
          ${b.erwerb ? `<tr><td style="padding-left: 20px;">Erwerbsstatus:</td><td>${b.erwerb}</td></tr>` : ''}
          ${b.type ? `<tr><td style="padding-left: 20px;">Typ:</td><td>${typLabels[b.type] || b.type}</td></tr>` : ''}
        `).join('')}
      </table>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <p>Diese E-Mail wurde automatisch generiert durch das HYPOTEQ Hypotheken-Formular.</p>
    <p>Anfrage-ID: <strong>${saved.id}</strong> | Eingegangen: ${new Date(saved.createdAt).toLocaleString('de-CH')}</p>
    <p>© ${new Date().getFullYear()} HYPOTEQ - Alle Rechte vorbehalten</p>
  </div>
</body>
</html>
  `;
}

// Send auto-response to customer after funnel submission
async function sendFunnelAutoResponse(customerEmail: string, firstName: string) {
  try {
    console.log("📧 Sending funnel auto-response to customer:", customerEmail);

    const useGraph = process.env.USE_GRAPH === "true" && 
                     process.env.GRAPH_TENANT_ID && 
                     process.env.GRAPH_CLIENT_ID && 
                     process.env.GRAPH_CLIENT_SECRET;

    const autoResponseHTML = generateFunnelAutoResponseHTML(firstName);
    const subject = "Deine Hypothekaranfrage ist eingegangen · Ta demande d'hypothèque a été reçue · La tua richiesta ipotecaria è stata ricevuta · Your mortgage request has been received";

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
    } else {
      // Fallback to SMTP if Graph API is not configured
      const nodemailer = require("nodemailer");
      
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log("⚠️ SMTP not configured, skipping auto-response");
        return;
      }

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

    console.log("✅ Funnel auto-response sent successfully to:", customerEmail);
  } catch (error: any) {
    console.error("⚠️ Failed to send funnel auto-response (non-critical):", error.message);
    // Don't throw - auto-response failure shouldn't fail the main request
  }
}

// Generate auto-response HTML for funnel submission
function generateFunnelAutoResponseHTML(firstName: string): string {
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
        Danke für deine Anfrage und dein Vertrauen in HYPOTEQ. Wir haben alle Informationen erhalten und melden uns bald (werktags), um die nächsten Schritte zu besprechen.
      </div>
    </div>

    <!-- French -->
    <div class="section">
      <div class="greeting">Salut${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Merci pour ta demande et pour ta confiance envers HYPOTEQ. Nous avons bien reçu toutes les informations et te recontactons bientôt (jours ouvrables) pour discuter des prochaines étapes.
      </div>
    </div>

    <!-- Italian -->
    <div class="section">
      <div class="greeting">Ciao${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Grazie per la tua richiesta e per la fiducia in HYPOTEQ. Abbiamo ricevuto tutte le informazioni e ti ricontatteremo presto (giorni lavorativi) per discutere i prossimi passi.
      </div>
    </div>

    <!-- English -->
    <div class="section">
      <div class="greeting">Hi${firstName ? ' ' + firstName : ''},</div>
      <div class="text">
        Thanks for your request and your trust in HYPOTEQ. We've received all the information and will get back to you soon (business days) to discuss the next steps.
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