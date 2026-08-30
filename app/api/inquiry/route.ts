import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";
import { randomUUID } from "crypto";
import {
  createNachreichToken,
  nachreichExpiry,
  buildNachreichUrl,
  NACHREICH_TTL_DAYS,
  type NachreichLocale,
} from "@/components/nachreichung";

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

    // === PROJECT FIELD VALIDATION ===
    const project = data.project || {};
    if (project.renovation === "ja") {
      if (!project.renovationsBetrag || isNaN(Number(project.renovationsBetrag)) || Number(project.renovationsBetrag) <= 0) {
        return NextResponse.json({ success: false, error: "Renovationsbetrag ist erforderlich, wenn Renovation 'ja' ist." }, { status: 400 });
      }
    }
    if (project.finanzierungsangebote === "ja") {
      if (!Array.isArray(project.angebote) || project.angebote.length === 0) {
        return NextResponse.json({ success: false, error: "Mindestens ein Finanzierungsangebot ist erforderlich." }, { status: 400 });
      }
      for (const [idx, offer] of project.angebote.entries()) {
        if (!offer.bank || !offer.zins || !offer.laufzeit) {
          return NextResponse.json({ success: false, error: `Alle Felder für Finanzierungsangebot #${idx + 1} sind erforderlich.` }, { status: 400 });
        }
        if (isNaN(Number(offer.zins)) || Number(offer.zins) <= 0) {
          return NextResponse.json({ success: false, error: `Zinssatz für Angebot #${idx + 1} ist ungültig.` }, { status: 400 });
        }
        if (isNaN(Number(offer.laufzeit)) || Number(offer.laufzeit) <= 0) {
          return NextResponse.json({ success: false, error: `Laufzeit für Angebot #${idx + 1} ist ungültig.` }, { status: 400 });
        }
      }
    }

    // === PROPERTY FIELD VALIDATION (if present) ===
    const property = data.property || {};
    if (property.renovation === "ja") {
      if (!property.renovationsBetrag || isNaN(Number(property.renovationsBetrag)) || Number(property.renovationsBetrag) <= 0) {
        return NextResponse.json({ success: false, error: "Renovationsbetrag ist erforderlich, wenn Renovation 'ja' ist (property)." }, { status: 400 });
      }
    }
    if (property.finanzierungsangebote === "ja") {
      if (!Array.isArray(property.angebote) || property.angebote.length === 0) {
        return NextResponse.json({ success: false, error: "Mindestens ein Finanzierungsangebot ist erforderlich (property)." }, { status: 400 });
      }
      for (const [idx, offer] of property.angebote.entries()) {
        if (!offer.bank || !offer.zins || !offer.laufzeit) {
          return NextResponse.json({ success: false, error: `Alle Felder für Finanzierungsangebot #${idx + 1} sind erforderlich (property).` }, { status: 400 });
        }
        if (isNaN(Number(offer.zins)) || Number(offer.zins) <= 0) {
          return NextResponse.json({ success: false, error: `Zinssatz für Angebot #${idx + 1} ist ungültig (property).` }, { status: 400 });
        }
        if (isNaN(Number(offer.laufzeit)) || Number(offer.laufzeit) <= 0) {
          return NextResponse.json({ success: false, error: `Laufzeit für Angebot #${idx + 1} ist ungültig (property).` }, { status: 400 });
        }
      }
    }


    // Resolve locale (from body, then Accept-Language, then default)
    const supportedLocales = ['de', 'fr', 'it', 'en'] as const;
    type Locale = typeof supportedLocales[number];
    const headerLang = (req.headers.get('accept-language') || '').substring(0, 2).toLowerCase();
    const rawLocale = (data.locale || headerLang || 'de').toLowerCase();
    const locale: Locale = (supportedLocales as readonly string[]).includes(rawLocale) ? rawLocale as Locale : 'de';

    // Only send email notification, do not save to database
    try {
      const now = new Date();
      await sendFunnelNotificationEmail(
        data,
        {
          id: data.id || Math.random().toString(36).substring(2, 10), // fallback if no id
          createdAt: now.toISOString(),
        },
        locale
      );
      console.log("✅ Email notification sent successfully");
    } catch (emailError) {
      console.error("⚠️ Email notification failed (continuing):", emailError);
      // Don't fail the request if email fails
    }

    // Store partner email in Salesforce PartnerConsultant__c on first step
    if (data.customerType === 'partner' && data.client?.email) {
      try {
        const { savePartnerConsultantEmailToSalesforce } = await import("@/components/savePartnerConsultantEmailToSalesforce");
        await savePartnerConsultantEmailToSalesforce(data.client.email);
        console.log("✅ PartnerConsultant__c updated in Salesforce for:", data.client.email);
      } catch (err) {
        console.error("❌ Failed to update PartnerConsultant__c in Salesforce:", err);
      }
    }

    // Send auto-response to customer
    try {
      if (data.client?.email) {
        await sendFunnelAutoResponse(data.client.email, data.client.firstName || data.client.vorname || '', locale);
        console.log("✅ Auto-response sent to customer");
      }
    } catch (autoResponseError) {
      console.error("⚠️ Auto-response failed (continuing):", autoResponseError);
      // Don't fail the request if auto-response fails
    }

    // Mail 2a / 2b is NOT sent here. It used to be, but it carries the Nachreich link
    // (spec V2), and a link can only be promised once the row backing it exists — sending
    // first would hand out URLs that 404 whenever the DB write later failed. It is sent
    // right after the inquiry is created instead.
    const documentCompleteness = data.documentCompleteness || null;
    if (!documentCompleteness) {
      console.log("ℹ️ No documentCompleteness in payload — Mail 2a/2b will be skipped");
    }

    // Minted up front so the same value can go into the DB row and the mail. Only an
    // incomplete dossier gets one: there is nothing to come back and supply otherwise.
    const needsNachreich = documentCompleteness?.complete === false;
    const nachreichToken = needsNachreich ? createNachreichToken() : null;
    const nachreichExpiresAt = needsNachreich ? nachreichExpiry() : null;

    // Submission-ID (spec V2). Decided here rather than left to the database default
    // because Salesforce is written BEFORE the row exists — without a value up front, the
    // Case could not carry the id that ties it back to this submission.
    //
    // The funnel's own id wins when it sent one. That is what links a submission's uploads
    // to it: files reach SharePoint before this route ever runs, so they are recorded
    // against the funnel's id and can only be claimed if the Inquiry is created under the
    // same one. Minting a fresh id here is what orphaned every upload — 2738 rows with no
    // inquiry against 27 that had one. It doubles as the SharePoint folder name, so a Case
    // can be traced to its folder.
    //
    // Validated as a UUID before use: it becomes a primary key, and it arrives from the
    // browser.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const clientSubmissionId =
      typeof data.submissionId === 'string' && UUID_RE.test(data.submissionId)
        ? data.submissionId
        : null;
    if (data.submissionId && !clientSubmissionId) {
      console.warn(`[Inquiry] Ignoring malformed submissionId from the funnel: ${String(data.submissionId).slice(0, 60)}`);
    }
    const submissionId = clientSubmissionId || randomUUID();
    data.submissionId = submissionId;

    // Salesforce sync (backend only)
    let salesforceError: unknown = null;
    let salesforceCaseId: string | null = null;
    try {
      // Ensure LastName is present for Salesforce
      if (data.client && data.client.lastName) {
        data.lastName = data.client.lastName;
      }
      // Set korrespondenzsprache from request headers if not provided
      if (!data.korrespondenzsprache) {
        // Try to get from accept-language header, default to 'Deutsch'
        const acceptLanguage = req.headers.get('accept-language') || '';
        const lang = acceptLanguage.substring(0, 2).toLowerCase();
        // Map to Salesforce picklist values
        const langMap: Record<string, string> = {
          'de': 'Deutsch',
          'fr': 'Französisch',
          'it': 'Italienisch',
          'en': 'Englisch'
        };
        data.korrespondenzsprache = langMap[lang] || 'Deutsch';
        console.log(`[Salesforce Sync] Set korrespondenzsprache to: ${data.korrespondenzsprache}`);
      }
      // Set stage to 'Needs Analysis' only if both data.stage and data.Stage__c are missing
      if (!data.stage && !data.Stage__c) {
        data.stage = 'Needs Analysis'; // Valid Salesforce picklist value
        console.log('[Salesforce Sync] Set stage to: Needs Analysis');
      }
      const salesforceApi = (await import("@/components/salesforceApi")).default;
      const { syncFunnelStepsToSalesforce } = await import("@/components/syncFunnelStepsToSalesforce");
      await salesforceApi.login();
      const syncResult = await syncFunnelStepsToSalesforce(data, salesforceApi);
      salesforceCaseId = (syncResult as any)?.case?.id || (syncResult as any)?.case?.Id || null;
      console.log("✅ Salesforce sync successful! Case:", salesforceCaseId);
    } catch (sfError) {
      salesforceError = sfError;
      console.error("❌ Salesforce sync failed:", sfError);
      // Deliberately non-fatal: the lead is still captured in the DB and in the
      // notification email, so the customer must not see an error. What this branch must
      // NOT do is stay quiet — a broken sync went unnoticed for six days and cost 11 leads
      // because the only signal was a console line nobody reads. The alert below is sent
      // after the DB write so it can name the inquiry to replay.
    }

    // === SAVE TO DATABASE ===
    try {
      // Fix: Clear stale Prisma connection before DB write
      console.log("🔄 Clearing stale Prisma connection...");
      await prisma.$disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));
      await prisma.$connect();
      console.log("✅ Prisma reconnected successfully");
      // Save Inquiry and all related data (without documents)
      const inquiry = await prisma.inquiry.create({
        data: {
          // Same value the Salesforce Case carries as its Submission-ID.
          id: submissionId,
          customerType: data.customerType,
          salesforceCaseId,
          salesforceSyncedAt: salesforceError ? null : new Date(),
          salesforceError: salesforceError
            ? (salesforceError instanceof Error ? salesforceError.message : String(salesforceError)).slice(0, 2000)
            : null,
          documentsComplete: documentCompleteness ? documentCompleteness.complete === true : null,
          documentsMissing: documentCompleteness && Array.isArray(documentCompleteness.missing)
            ? documentCompleteness.missing.join(',').slice(0, 4000)
            : null,
          nachreichToken,
          nachreichExpiresAt,
          // Remembered so documents supplied later land in the folder this submission
          // created rather than a new one — the folder name embeds the upload date, so it
          // cannot be re-derived on another day.
          sharepointFolderId: typeof data.sharepointFolderId === 'string' && data.sharepointFolderId
            ? data.sharepointFolderId
            : null,
          client: {
            create: {
              firstName: data.client?.firstName || '',
              lastName: data.client?.lastName || '',
              email: data.client?.email,
              phone: data.client?.phone || '',
              zip: data.client?.zip || '',
              ort: data.client?.ort || '',
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
              zip: data.property.zip || '',
              ort: data.property.ort || '',
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

      // Mail 2a / 2b — now that the row exists, the Nachreich link in 2b is guaranteed to
      // resolve. Non-fatal: the lead is captured either way, and a customer who never gets
      // this mail can still reply to the confirmation one.
      if (documentCompleteness) {
        try {
          await sendDossierCompletenessEmail(data, documentCompleteness, locale, nachreichToken);
        } catch (dossierMailError) {
          console.error("⚠️ Dossier completeness mail failed (continuing):", dossierMailError);
        }
      }

      // === CLAIM THIS SUBMISSION'S UPLOADS ===
      // The files went to SharePoint before this route ran, so they are sitting in
      // HoldingDocument against the submission id the Inquiry was just created with.
      //
      // Non-fatal on purpose: the files are already safe in SharePoint and the lead is
      // already saved, so a failure here must not turn a good submission into an error.
      try {
        const { adoptHoldingDocuments } = await import("@/lib/sharepoint");
        const adopted = await adoptHoldingDocuments(inquiry.id, submissionId);
        if (adopted > 0) {
          console.log(`✅ Linked ${adopted} uploaded document(s) to inquiry ${inquiry.id}`);
        } else {
          console.log(`ℹ️ No held uploads for submission ${submissionId}`);
        }
      } catch (adoptErr) {
        console.error("⚠️ Could not link uploaded documents to the inquiry:", adoptErr);
      }

      // Legacy path: an older client passed tempUserId instead. Kept so an upload made by a
      // browser still running the previous bundle is not stranded during a deploy.
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
              docType: doc.docType,
              originalFileName: doc.originalFileName || doc.fileName,
              uploadedAt: doc.uploadedAt,
            },
          });
          await prisma.holdingDocument.delete({ where: { id: doc.id } });
        }
        if (holdingDocs.length > 0) {
          console.log(`✅ Associated ${holdingDocs.length} holding documents with inquiry ${inquiry.id}`);
        }
      }

      if (salesforceError) {
        await sendSalesforceFailureAlert(inquiry.id, salesforceError);
      }

      return NextResponse.json({ success: true, inquiryId: inquiry.id, salesforceSynced: !salesforceError });
    } catch (dbErr) {
      console.error("❌ Failed to save inquiry to DB:", dbErr);
      // Both sinks failed — the notification email is now the only copy of this lead.
      if (salesforceError) {
        await sendSalesforceFailureAlert(null, salesforceError);
      }
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

/* ==========================================================================
 * DEV-ONLY EMAIL PREVIEW
 * Renders the notification email in the browser without sending anything.
 * Disabled in production. Examples:
 *   /api/inquiry?preview=1                      → German, direct customer, Kauf
 *   /api/inquiry?preview=1&locale=fr            → French
 *   /api/inquiry?preview=1&type=partner         → partner (hides Steueroptimierung)
 *   /api/inquiry?preview=1&projekt=abloesung    → refinancing (shows Erhöhung/Erhöhungsbetrag)
 * ======================================================================== */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available." }, { status: 405 });
  }
  const url = new URL(req.url);
  if (!url.searchParams.get("preview")) {
    return NextResponse.json(
      { error: "Method Not Allowed. Append ?preview=1 to render the email." },
      { status: 405 }
    );
  }

  const supported = ["de", "fr", "it", "en"];
  const rawLocale = (url.searchParams.get("locale") || "de").toLowerCase();
  const locale = (supported.includes(rawLocale) ? rawLocale : "de") as EmailLocale;
  const customerType = url.searchParams.get("type") === "partner" ? "partner" : "direct";
  const projektArt = url.searchParams.get("projekt") === "abloesung" ? "abloesung" : "kauf";

  // Sample data mirroring the ticket example (two borrowers across both arrays)
  const sample = {
    customerType,
    locale,
    client: {
      firstName: "Anna",
      lastName: "Muster",
      email: "anna.muster@example.ch",
      phone: "+41 79 123 45 67",
      zip: "8000",
      ort: "Zürich",
      firma: "",
    },
    project: { projektArt, liegenschaftZip: "8001", kreditnehmerTyp: "nat" },
    property: {
      artImmobilie: "bestehend",
      artLiegenschaft: "Einfamilienhaus",
      nutzung: "Eigenheim",
      renovation: "nein",
      reserviert: "ja",
      finanzierungsangebote: "nein",
      kreditnehmer: [
        { vorname: "Mark", name: "Dedaj", geburtsdatum: "04.05.1998", erwerb: "angestellt", zivilstand: "ledig", type: "nat" },
      ],
    },
    borrowers: [
      { firstName: "Lea", lastName: "Beispiel", type: "nat", geburtsdatum: "12.09.1996", erwerb: "angestellt", zivilstand: "ledig" },
    ],
    financing: {
      kaufpreis: "1500000",
      eigenmittel_bar: "185000",
      eigenmittel_saeule3: "53568",
      eigenmittel_pk: "84762",
      eigenmittel_schenkung: "",
      pkVorbezug: "ja",
      modell: "10",
      brutto: "260000",
      bonus: "",
      steueroptimierung: "ja",
      kaufdatum: "19.05.2026",
      abloesung_betrag: projektArt === "abloesung" ? "900000" : "",
      erhoehung: projektArt === "abloesung" ? "ja" : "",
      erhoehung_betrag: projektArt === "abloesung" ? "100000" : "",
      abloesedatum: projektArt === "abloesung" ? "01.07.2026" : "",
    },
  };

  const html = generateFunnelEmailHTML(
    sample,
    { id: "PREVIEW", createdAt: new Date().toISOString() },
    locale
  );
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

type EmailLocale = 'de' | 'fr' | 'it' | 'en';

/* ==========================================================================
 * DOSSIER COMPLETENESS MAIL (spec: Mail 2a / Mail 2b)
 * Sent right after the existing confirmation mail. 2a when every required document was
 * supplied, 2b listing what is still missing. The verdict is computed in the funnel —
 * only the client knows which document sections were rendered for this case type.
 * Recipient follows the same rule as the confirmation mail (data.client.email), which for
 * partner submissions is the advisor rather than the end customer.
 * ======================================================================== */
const DOSSIER_MAIL = {
  de: {
    subjectComplete: 'HYPOTEQ - Ihr Dossier ist vollständig',
    subjectIncomplete: 'HYPOTEQ - Fehlende Unterlagen zu Ihrem Dossier',
    greeting: (n: string) => `Sehr geehrte/r ${n || 'Kundin/Kunde'}`,
    completeBody: 'Vielen Dank - Ihr Dossier ist vollständig bei uns eingegangen.',
    completeBody2: 'Wir freuen uns, Ihre Unterlagen zu analysieren, und melden uns zeitnah mit einer Rückmeldung bei Ihnen.',
    incompleteBody: 'Vielen Dank für Ihre Einreichung. Ihr Dossier ist bei uns eingegangen, allerdings fehlen noch folgende Unterlagen:',
    incompleteBody2: 'Bitte reichen Sie die fehlenden Dokumente nach, damit wir Ihr Dossier vollständig prüfen können. Sie können die Unterlagen direkt per Antwort auf diese E-Mail senden.',
    uploadCta: "Fehlende Unterlagen jetzt hochladen",
    uploadIntro: "Am einfachsten laden Sie die fehlenden Dokumente über Ihren persönlichen Link hoch - dort sehen Sie nur die Felder, die noch offen sind:",
    uploadNote: (d: number) => `Der Link ist ${d} Tage gültig und ausschliesslich für Ihr Dossier bestimmt. Alternativ können Sie die Unterlagen direkt per Antwort auf diese E-Mail senden.`,
    signoff: 'Freundliche Grüsse',
    team: 'Ihr HYPOTEQ-Team',
  },
  fr: {
    subjectComplete: 'HYPOTEQ - Votre dossier est complet',
    subjectIncomplete: 'HYPOTEQ - Documents manquants dans votre dossier',
    greeting: (n: string) => `Madame, Monsieur ${n || ''}`.trim(),
    completeBody: 'Merci - votre dossier nous est parvenu complet.',
    completeBody2: "Nous nous réjouissons d'analyser vos documents et reviendrons vers vous rapidement.",
    incompleteBody: 'Merci pour votre envoi. Votre dossier nous est parvenu, mais les documents suivants manquent encore:',
    incompleteBody2: "Merci de nous faire parvenir les documents manquants afin que nous puissions examiner votre dossier. Vous pouvez les envoyer directement en réponse à cet e-mail.",
    uploadCta: "Téléverser les documents manquants",
    uploadIntro: "Le plus simple est de téléverser les documents manquants via votre lien personnel - vous n'y verrez que les champs encore ouverts:",
    uploadNote: (d: number) => `Le lien est valable ${d} jours et concerne uniquement votre dossier. Vous pouvez également envoyer les documents en réponse à cet e-mail.`,
    signoff: 'Meilleures salutations',
    team: 'Votre équipe HYPOTEQ',
  },
  it: {
    subjectComplete: 'HYPOTEQ - Il suo dossier è completo',
    subjectIncomplete: 'HYPOTEQ - Documenti mancanti nel suo dossier',
    greeting: (n: string) => `Gentile ${n || 'cliente'}`,
    completeBody: 'Grazie - il suo dossier ci è pervenuto completo.',
    completeBody2: 'Saremo lieti di analizzare la sua documentazione e la contatteremo a breve.',
    incompleteBody: 'Grazie per il suo invio. Il suo dossier ci è pervenuto, tuttavia mancano ancora i seguenti documenti:',
    incompleteBody2: 'La preghiamo di inviarci i documenti mancanti affinché possiamo esaminare il suo dossier. Può inviarli direttamente rispondendo a questa e-mail.',
    uploadCta: "Carica ora i documenti mancanti",
    uploadIntro: "Il modo più semplice è caricare i documenti mancanti tramite il suo link personale - vedrà solo i campi ancora aperti:",
    uploadNote: (d: number) => `Il link è valido ${d} giorni ed è destinato esclusivamente al suo dossier. In alternativa può inviare i documenti rispondendo a questa e-mail.`,
    signoff: 'Cordiali saluti',
    team: 'Il suo team HYPOTEQ',
  },
  en: {
    subjectComplete: 'HYPOTEQ - Your dossier is complete',
    subjectIncomplete: 'HYPOTEQ - Missing documents for your dossier',
    greeting: (n: string) => `Dear ${n || 'customer'}`,
    completeBody: 'Thank you - your dossier has reached us complete.',
    completeBody2: 'We look forward to analysing your documents and will get back to you shortly.',
    incompleteBody: 'Thank you for your submission. Your dossier has reached us, but the following documents are still missing:',
    incompleteBody2: 'Please send us the missing documents so we can review your dossier in full. You can reply directly to this e-mail with them.',
    uploadCta: "Upload the missing documents",
    uploadIntro: "The easiest way is to upload the missing documents through your personal link - it shows only the fields that are still open:",
    uploadNote: (d: number) => `The link is valid for ${d} days and applies to your dossier only. Alternatively you can reply to this e-mail with the documents.`,
    signoff: 'Best regards',
    team: 'Your HYPOTEQ team',
  },
} as const;

/**
 * Resolve document i18n keys ("funnel.salaryStatementBonus") into human labels in the
 * customer's own language. Falls back to German, then to the bare key, so a missing
 * translation degrades to something readable instead of blanking the list.
 */
function resolveDocLabels(keys: string[], locale: EmailLocale): string[] {
  let messages: any = {};
  let fallback: any = {};
  try { messages = require(`@/messages/${locale}.json`); } catch { /* falls through */ }
  try { fallback = require('@/messages/de.json'); } catch { /* falls through */ }
  return keys.map((key) => {
    const [ns, name] = key.split('.');
    return messages?.[ns]?.[name] || fallback?.[ns]?.[name] || key;
  });
}

async function sendDossierCompletenessEmail(
  data: any,
  completeness: any,
  locale: EmailLocale,
  nachreichToken?: string | null
) {
  const client = getGraphMailClient();
  if (!client) {
    console.log('⚠️ Dossier completeness mail skipped — Graph mail disabled');
    return;
  }
  const to = data?.client?.email;
  if (!to) return;

  const L = DOSSIER_MAIL[locale];
  const { getBorrowerDisplayName } = await import('@/components/funnelPersonNames');
  const name =
    getBorrowerDisplayName(data) ||
    `${data.client?.firstName || ''} ${data.client?.lastName || ''}`.trim();

  const complete = completeness?.complete === true;
  const missingLabels: string[] = complete
    ? []
    : resolveDocLabels(completeness?.missing || [], locale);

  const listHTML = missingLabels.length
    ? '<ul style="margin:16px 0 20px 0;padding-left:20px;">' +
      missingLabels.map((m) => `<li style="margin-bottom:6px;">${m}</li>`).join('') +
      '</ul>'
    : '';

  // Nachreich link (spec V2). Only on 2b, and only when a token was actually minted — a
  // complete dossier has nothing to come back for, and an absent token must degrade to the
  // reply-by-mail wording rather than to a broken button.
  const nachreichUrl = !complete && nachreichToken
    ? buildNachreichUrl(nachreichToken, locale as NachreichLocale)
    : null;
  const uploadHTML = nachreichUrl
    ? `
    <p style="font-size:15px;">${L.uploadIntro}</p>
    <p style="margin:22px 0;">
      <a href="${nachreichUrl}"
         style="background:#132219;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:600;display:inline-block;">${L.uploadCta}</a>
    </p>
    <p style="font-size:13px;color:#132219;opacity:0.65;">${L.uploadNote(NACHREICH_TTL_DAYS)}</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8" /></head>
<body style="font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.8;color:#132219;max-width:600px;margin:0 auto;padding:20px;background-color:#f5f5f5;">
  <div style="background:#fff;border-radius:10px;padding:40px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #CAF476;">
      <div style="font-size:32px;font-weight:700;color:#132219;">HYPOTEQ</div>
    </div>
    <p style="font-size:18px;font-weight:600;">${L.greeting(name)}</p>
    <p style="font-size:15px;">${complete ? L.completeBody : L.incompleteBody}</p>
    ${listHTML}
    ${uploadHTML}
    <p style="font-size:15px;">${complete ? L.completeBody2 : L.incompleteBody2}</p>
    <div style="margin-top:30px;padding-top:20px;border-top:2px solid #CAF476;">
      <div style="font-size:15px;">${L.signoff}</div>
      <div style="font-weight:600;margin-top:15px;">${L.team}</div>
    </div>
  </div>
</body>
</html>`;

  const sendAsUser = process.env.SMTP_USER || 'info@hypoteq.ch';
  await client.api(`/users/${sendAsUser}/sendMail`).post({
    message: {
      subject: complete ? L.subjectComplete : L.subjectIncomplete,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  });
  console.log(
    `📨 Dossier ${complete ? 'complete (2a)' : 'incomplete (2b)'} mail sent to ${to}` +
    (complete ? '' : ` — missing ${missingLabels.length}`)
  );
}


// Build an authenticated Graph mail client, or null when Graph mail is not configured.
function getGraphMailClient() {
  const useGraph = process.env.USE_GRAPH === "true" &&
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
        const token = await credential.getToken("https://graph.microsoft.com/.default");
        return token?.token || "";
      },
    },
  });
}

/* ==========================================================================
 * SALESFORCE FAILURE ALERT
 * The sync is intentionally non-fatal for the customer, which means a broken
 * Salesforce connection is invisible unless it is actively reported. This mail is
 * that report: it names the inquiry so the lead can be replayed once the cause is
 * fixed. Never let it throw — it runs on an already-degraded path.
 * ======================================================================== */
async function sendSalesforceFailureAlert(inquiryId: string | null, error: unknown) {
  try {
    const detail = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
    const stack = error instanceof Error && error.stack ? error.stack : '';

    const client = getGraphMailClient();
    if (!client) {
      console.error(
        `🚨 Salesforce sync failed for inquiry ${inquiryId ?? '(not saved)'} and no alert could be sent ` +
        `(Graph mail disabled): ${detail}`
      );
      return;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #132219;">
        <h2 style="color: #c0392b; margin-bottom: 4px;">⚠️ Salesforce-Sync fehlgeschlagen</h2>
        <p>Die Anfrage wurde <strong>gespeichert und per E-Mail zugestellt</strong>, aber
        <strong>nicht</strong> nach Salesforce übertragen. Der Lead muss nachgetragen werden.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; font-weight: 600;">Anfrage-ID (DB):</td>
              <td style="padding: 6px 0;"><code>${inquiryId ?? 'nicht gespeichert – siehe Benachrichtigungs-E-Mail'}</code></td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: 600;">Zeitpunkt:</td>
              <td style="padding: 6px 0;">${new Date().toISOString()}</td></tr>
        </table>
        <p style="font-weight: 600; margin-bottom: 4px;">Fehler:</p>
        <pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px;">${detail}</pre>
        ${stack ? `<details><summary style="cursor:pointer;font-size:12px;color:#666;">Stacktrace</summary>
        <pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:11px;">${stack}</pre></details>` : ''}
      </div>`;

    const sendAsUser = process.env.SMTP_USER || "info@hypoteq.ch";
    await client.api(`/users/${sendAsUser}/sendMail`).post({
      message: {
        subject: `⚠️ Salesforce-Sync fehlgeschlagen – Anfrage ${inquiryId ?? 'unbekannt'}`,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: "info@hypoteq.ch" } }],
      },
      saveToSentItems: true,
    });
    console.log("📨 Salesforce failure alert sent to info@hypoteq.ch");
  } catch (alertError) {
    console.error("⚠️ Could not send Salesforce failure alert:", alertError);
  }
}

// Send email notification for funnel submission
async function sendFunnelNotificationEmail(data: any, saved: any, locale: EmailLocale = 'de') {
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

  const emailHTML = generateFunnelEmailHTML(data, saved, locale);
  const L = EMAIL_LABELS[locale];
  const customerTag = data.customerType === 'partner' ? L.customerType_partner : L.customerType_direct;
  const { getBorrowerDisplayName } = await import("@/components/funnelPersonNames");
  const subjectName = getBorrowerDisplayName(data);
  const subject = subjectName
    ? `${L.subject} (${customerTag}) - ${subjectName}`
    : `${L.subject} (${customerTag}) - ID: ${saved.id}`;

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
            address: "info@hypoteq.ch",
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

/* ==========================================================================
 * EMAIL LOCALIZATION
 * Labels keyed by locale (de | fr | it | en). Every label used by the email
 * must exist in all four locales — keep them in sync.
 * ======================================================================== */
const EMAIL_LABELS = {
  de: {
    subject: 'Neue Hypothekanfrage',
    customerType_partner: 'Partner',
    customerType_direct: 'Direktkunde',
    customerType_unknown: 'Unbekannt',
    inquiryId: 'Anfrage-ID',
    receivedAt: 'Eingegangen am',
    locale: 'de-CH',
    section_summary: 'Übersicht',
    section_client: 'Kundendaten',
    section_project: 'Projektinformationen',
    section_property: 'Immobiliendetails',
    section_financing: 'Finanzierungsdetails',
    section_borrowers: 'Kreditnehmer',
    section_companies: 'Firmen / Juristische Personen',
    section_offers: 'Finanzierungsangebote',
    section_calc: 'Berechnete Werte',
    customerType: 'Kundentyp',
    projectType: 'Projektart',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    zip: 'PLZ',
    ort: 'Ort',
    company: 'Firma',
    partnerEmail: 'Partner E-Mail',
    plzLiegenschaft: 'PLZ Liegenschaft',
    kreditnehmerTyp: 'Kreditnehmer Typ',
    artImmobilie: 'Art der Immobilie',
    neubauArt: 'Neubau Art',
    artLiegenschaft: 'Art der Liegenschaft',
    nutzung: 'Nutzung',
    renovation: 'Renovation',
    renovationsBetrag: 'Renovationsbetrag',
    reserviert: 'Reserviert',
    finanzierungsangebote: 'Finanzierungsangebote',
    offerN: 'Angebot',
    bank: 'Bank',
    interestRate: 'Zinssatz',
    term: 'Laufzeit',
    kaufpreis: 'Kaufpreis',
    abloesungBetrag: 'Ablösungsbetrag',
    eigenmittelBreakdown: 'Eigenmittel Aufschlüsselung',
    eigenmittel_bar: 'Barmittel',
    eigenmittel_saeule3: '3. Säule',
    eigenmittel_pk: 'Pensionskasse',
    eigenmittel_schenkung: 'Schenkung/Andere',
    eigenmittel_total: 'Total Eigenmittel',
    pkVorbezug: 'PK Vorbezug',
    hypoBetrag: 'Hypothekenbetrag',
    modell: 'Hypothekarlaufzeiten',
    einkommen: 'Brutto-Jahreseinkommen',
    brutto: 'Brutto-Einkommen',
    bonus: 'Bonus',
    nettoMietertrag: 'Jährlicher Netto-Mietertrag',
    steueroptimierung: 'Steueroptimierung',
    kaufdatum: 'Kaufdatum',
    erhoehung: 'Erhöhung',
    erhoehungBetrag: 'Erhöhungsbetrag',
    abloesedatum: 'Ablösedatum',
    kommentar: 'Kommentar',
    borrowerN: 'Kreditnehmer',
    companyN: 'Firma',
    companyName: 'Firmenname',
    birthdate: 'Geburtsdatum',
    civilStatus: 'Zivilstand',
    employment: 'Erwerbsstatus',
    type: 'Typ',
    job: 'Beruf',
    typ_nat: 'Natürliche Person',
    typ_jur: 'Juristische Person',
    typ_partner: 'Partner',
    artImmobilie_neubau: 'Neubau',
    artImmobilie_bestehend: 'Bestehende Immobilie',
    artImmobilie_bestandsobjekt: 'Bestandsobjekt',
    artImmobilie_rendite: 'Rendite-Immobilie',
    neubauArt_bereits_erstellt: 'Bereits erstellt',
    neubauArt_im_bau: 'Im Bau',
    neubauArt_geplant: 'Geplant',
    neubauArt_bauprojekt: 'Bauprojekt',
    projektArt_kauf: 'Kauf',
    projektArt_abloesung: 'Ablösung',
    modell_saron: 'SARON',
    modell_mix: 'Mix',
    yearsSingular: 'Jahr',
    yearsPlural: 'Jahre',
    yes: 'Ja',
    no: 'Nein',
    notProvided: '-',
    calc_totalMortgage: 'Geschätzter Hypothekenbetrag',
    calc_ownFunds: 'Eigenmittel',
    calc_equityRatio: 'Eigenmittelquote',
    calc_ltv: 'Belehnung (LTV)',
    calc_affordability: 'Tragbarkeit',
    calc_eligible: 'Finanzierung möglich',
    calc_notEligible: 'Nicht tragbar',
    calc_increase: 'Erhöhung',
    calc_currentMortgage: 'Aktuelle Hypothek',
    footer_disclaimer: 'Diese E-Mail wurde automatisch generiert durch das HYPOTEQ Hypotheken-Formular.',
    footer_rights: 'Alle Rechte vorbehalten',
  },
  fr: {
    subject: 'Nouvelle demande hypothécaire',
    customerType_partner: 'Partenaire',
    customerType_direct: 'Client direct',
    customerType_unknown: 'Inconnu',
    inquiryId: 'ID de la demande',
    receivedAt: 'Reçue le',
    locale: 'fr-CH',
    section_summary: 'Aperçu',
    section_client: 'Données du client',
    section_project: 'Informations du projet',
    section_property: 'Détails du bien',
    section_financing: 'Détails du financement',
    section_borrowers: 'Emprunteurs',
    section_companies: 'Entreprises / Personnes morales',
    section_offers: 'Offres de financement',
    section_calc: 'Valeurs calculées',
    customerType: 'Type de client',
    projectType: 'Type de projet',
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'E-mail',
    phone: 'Téléphone',
    zip: 'NPA',
    ort: 'Localité',
    company: 'Entreprise',
    partnerEmail: 'E-mail partenaire',
    plzLiegenschaft: 'NPA du bien',
    kreditnehmerTyp: "Type d'emprunteur",
    artImmobilie: 'Type de bien',
    neubauArt: 'Type de construction neuve',
    artLiegenschaft: 'Type de propriété',
    nutzung: 'Utilisation',
    renovation: 'Rénovation',
    renovationsBetrag: 'Montant des rénovations',
    reserviert: 'Réservé',
    finanzierungsangebote: 'Offres de financement',
    offerN: 'Offre',
    bank: 'Banque',
    interestRate: "Taux d'intérêt",
    term: 'Durée',
    kaufpreis: "Prix d'achat",
    abloesungBetrag: 'Montant à refinancer',
    eigenmittelBreakdown: 'Détail des fonds propres',
    eigenmittel_bar: '💵 Liquidités',
    eigenmittel_saeule3: '🏦 3e pilier',
    eigenmittel_pk: '💼 Caisse de pension',
    eigenmittel_schenkung: '🎁 Donation/Autre',
    eigenmittel_total: 'Total des fonds propres',
    pkVorbezug: 'Retrait LPP',
    hypoBetrag: 'Montant hypothécaire',
    modell: 'Durées hypothécaires',
    einkommen: 'Revenu annuel brut',
    brutto: 'Revenu brut',
    bonus: 'Bonus',
    nettoMietertrag: 'Revenu locatif net annuel',
    steueroptimierung: 'Optimisation fiscale',
    kaufdatum: "Date d'achat",
    erhoehung: 'Augmentation',
    erhoehungBetrag: "Montant de l'augmentation",
    abloesedatum: 'Date de refinancement',
    kommentar: 'Commentaire',
    borrowerN: 'Emprunteur',
    companyN: 'Entreprise',
    companyName: "Nom de l'entreprise",
    birthdate: 'Date de naissance',
    civilStatus: 'État civil',
    employment: 'Statut professionnel',
    type: 'Type',
    job: 'Profession',
    typ_nat: 'Personne physique',
    typ_jur: 'Personne morale',
    typ_partner: 'Partenaire',
    artImmobilie_neubau: 'Construction neuve',
    artImmobilie_bestehend: 'Bien existant',
    artImmobilie_bestandsobjekt: 'Bien existant',
    artImmobilie_rendite: 'Bien de rendement',
    neubauArt_bereits_erstellt: 'Déjà construit',
    neubauArt_im_bau: 'En construction',
    neubauArt_geplant: 'Planifié',
    neubauArt_bauprojekt: 'Projet de construction',
    projektArt_kauf: 'Achat',
    projektArt_abloesung: 'Refinancement',
    modell_saron: 'SARON',
    modell_mix: 'Mix',
    yearsSingular: 'an',
    yearsPlural: 'ans',
    yes: 'Oui',
    no: 'Non',
    notProvided: '-',
    calc_totalMortgage: 'Montant hypothécaire estimé',
    calc_ownFunds: 'Fonds propres',
    calc_equityRatio: 'Ratio de fonds propres',
    calc_ltv: 'Quotité (LTV)',
    calc_affordability: 'Tenue des charges',
    calc_eligible: 'Financement possible',
    calc_notEligible: 'Non admissible',
    calc_increase: 'Augmentation',
    calc_currentMortgage: 'Hypothèque actuelle',
    footer_disclaimer: "Cet e-mail a été généré automatiquement par le formulaire hypothécaire HYPOTEQ.",
    footer_rights: 'Tous droits réservés',
  },
  it: {
    subject: 'Nuova richiesta ipotecaria',
    customerType_partner: 'Partner',
    customerType_direct: 'Cliente diretto',
    customerType_unknown: 'Sconosciuto',
    inquiryId: 'ID richiesta',
    receivedAt: 'Ricevuta il',
    locale: 'it-CH',
    section_summary: 'Panoramica',
    section_client: 'Dati cliente',
    section_project: 'Informazioni progetto',
    section_property: 'Dettagli immobile',
    section_financing: 'Dettagli finanziamento',
    section_borrowers: 'Mutuatari',
    section_companies: 'Aziende / Persone giuridiche',
    section_offers: 'Offerte di finanziamento',
    section_calc: 'Valori calcolati',
    customerType: 'Tipo di cliente',
    projectType: 'Tipo di progetto',
    firstName: 'Nome',
    lastName: 'Cognome',
    email: 'E-mail',
    phone: 'Telefono',
    zip: 'CAP',
    ort: 'Località',
    company: 'Azienda',
    partnerEmail: 'E-mail partner',
    plzLiegenschaft: 'CAP immobile',
    kreditnehmerTyp: 'Tipo di mutuatario',
    artImmobilie: 'Tipo di immobile',
    neubauArt: 'Tipo di nuova costruzione',
    artLiegenschaft: 'Tipo di proprietà',
    nutzung: 'Utilizzo',
    renovation: 'Ristrutturazione',
    renovationsBetrag: 'Importo ristrutturazione',
    reserviert: 'Riservato',
    finanzierungsangebote: 'Offerte di finanziamento',
    offerN: 'Offerta',
    bank: 'Banca',
    interestRate: 'Tasso di interesse',
    term: 'Durata',
    kaufpreis: "Prezzo d'acquisto",
    abloesungBetrag: 'Importo da rifinanziare',
    eigenmittelBreakdown: 'Dettaglio mezzi propri',
    eigenmittel_bar: '💵 Liquidità',
    eigenmittel_saeule3: '🏦 3° pilastro',
    eigenmittel_pk: '💼 Cassa pensione',
    eigenmittel_schenkung: '🎁 Donazione/Altro',
    eigenmittel_total: 'Totale mezzi propri',
    pkVorbezug: 'Prelievo LPP',
    hypoBetrag: 'Importo ipoteca',
    modell: 'Durate ipotecarie',
    einkommen: 'Reddito annuo lordo',
    brutto: 'Reddito lordo',
    bonus: 'Bonus',
    nettoMietertrag: 'Reddito locativo netto annuo',
    steueroptimierung: 'Ottimizzazione fiscale',
    kaufdatum: "Data d'acquisto",
    erhoehung: 'Aumento',
    erhoehungBetrag: "Importo dell'aumento",
    abloesedatum: 'Data di rifinanziamento',
    kommentar: 'Commento',
    borrowerN: 'Mutuatario',
    companyN: 'Azienda',
    companyName: "Nome dell'azienda",
    birthdate: 'Data di nascita',
    civilStatus: 'Stato civile',
    employment: 'Stato professionale',
    type: 'Tipo',
    job: 'Professione',
    typ_nat: 'Persona fisica',
    typ_jur: 'Persona giuridica',
    typ_partner: 'Partner',
    artImmobilie_neubau: 'Nuova costruzione',
    artImmobilie_bestehend: 'Immobile esistente',
    artImmobilie_bestandsobjekt: 'Immobile esistente',
    artImmobilie_rendite: 'Immobile di reddito',
    neubauArt_bereits_erstellt: 'Già costruito',
    neubauArt_im_bau: 'In costruzione',
    neubauArt_geplant: 'Pianificato',
    neubauArt_bauprojekt: 'Progetto edilizio',
    projektArt_kauf: 'Acquisto',
    projektArt_abloesung: 'Rifinanziamento',
    modell_saron: 'SARON',
    modell_mix: 'Mix',
    yearsSingular: 'anno',
    yearsPlural: 'anni',
    yes: 'Sì',
    no: 'No',
    notProvided: '-',
    calc_totalMortgage: 'Importo ipotecario stimato',
    calc_ownFunds: 'Mezzi propri',
    calc_equityRatio: 'Quota di mezzi propri',
    calc_ltv: 'Rapporto di copertura (LTV)',
    calc_affordability: 'Sostenibilità',
    calc_eligible: 'Finanziamento possibile',
    calc_notEligible: 'Non idoneo',
    calc_increase: 'Aumento',
    calc_currentMortgage: 'Ipoteca attuale',
    footer_disclaimer: "Questa e-mail è stata generata automaticamente dal modulo ipotecario HYPOTEQ.",
    footer_rights: 'Tutti i diritti riservati',
  },
  en: {
    subject: 'New mortgage request',
    customerType_partner: 'Partner',
    customerType_direct: 'Direct customer',
    customerType_unknown: 'Unknown',
    inquiryId: 'Inquiry ID',
    receivedAt: 'Received at',
    locale: 'en-CH',
    section_summary: 'Summary',
    section_client: 'Customer data',
    section_project: 'Project information',
    section_property: 'Property details',
    section_financing: 'Financing details',
    section_borrowers: 'Borrowers',
    section_companies: 'Companies / Legal entities',
    section_offers: 'Financing offers',
    section_calc: 'Calculated values',
    customerType: 'Customer type',
    projectType: 'Project type',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    zip: 'ZIP',
    ort: 'City',
    company: 'Company',
    partnerEmail: 'Partner email',
    plzLiegenschaft: 'Property ZIP',
    kreditnehmerTyp: 'Borrower type',
    artImmobilie: 'Property type',
    neubauArt: 'New build type',
    artLiegenschaft: 'Real-estate type',
    nutzung: 'Usage',
    renovation: 'Renovation',
    renovationsBetrag: 'Renovation amount',
    reserviert: 'Reserved',
    finanzierungsangebote: 'Financing offers',
    offerN: 'Offer',
    bank: 'Bank',
    interestRate: 'Interest rate',
    term: 'Term',
    kaufpreis: 'Purchase price',
    abloesungBetrag: 'Refinancing amount',
    eigenmittelBreakdown: 'Equity breakdown',
    eigenmittel_bar: 'Cash',
    eigenmittel_saeule3: 'Pillar 3a',
    eigenmittel_pk: 'Pension fund',
    eigenmittel_schenkung: 'Gift/Other',
    eigenmittel_total: 'Total equity',
    pkVorbezug: 'Pension-fund withdrawal',
    hypoBetrag: 'Mortgage amount',
    modell: 'Mortgage terms',
    einkommen: 'Gross annual income',
    brutto: 'Gross income',
    bonus: 'Bonus',
    nettoMietertrag: 'Annual net rental income',
    steueroptimierung: 'Tax optimisation',
    kaufdatum: 'Purchase date',
    erhoehung: 'Increase',
    erhoehungBetrag: 'Increase amount',
    abloesedatum: 'Refinancing date',
    kommentar: 'Comment',
    borrowerN: 'Borrower',
    companyN: 'Company',
    companyName: 'Company name',
    birthdate: 'Date of birth',
    civilStatus: 'Civil status',
    employment: 'Employment status',
    type: 'Type',
    job: 'Profession',
    typ_nat: 'Natural person',
    typ_jur: 'Legal entity',
    typ_partner: 'Partner',
    artImmobilie_neubau: 'New build',
    artImmobilie_bestehend: 'Existing property',
    artImmobilie_bestandsobjekt: 'Existing property',
    artImmobilie_rendite: 'Investment property',
    neubauArt_bereits_erstellt: 'Already built',
    neubauArt_im_bau: 'Under construction',
    neubauArt_geplant: 'Planned',
    neubauArt_bauprojekt: 'Building project',
    projektArt_kauf: 'Purchase',
    projektArt_abloesung: 'Refinancing',
    modell_saron: 'SARON',
    modell_mix: 'Mix',
    yearsSingular: 'year',
    yearsPlural: 'years',
    yes: 'Yes',
    no: 'No',
    notProvided: '-',
    calc_totalMortgage: 'Estimated mortgage amount',
    calc_ownFunds: 'Own funds',
    calc_equityRatio: 'Equity ratio',
    calc_ltv: 'Loan-to-value (LTV)',
    calc_affordability: 'Affordability',
    calc_eligible: 'Financing possible',
    calc_notEligible: 'Not eligible',
    calc_increase: 'Increase',
    calc_currentMortgage: 'Current mortgage',
    footer_disclaimer: 'This email was generated automatically by the HYPOTEQ mortgage form.',
    footer_rights: 'All rights reserved',
  },
} as const;

type LabelDict = typeof EMAIL_LABELS[EmailLocale];

// "-" fallback for empty/missing values
function dash(value: any, L: LabelDict): string {
  if (value === null || value === undefined) return L.notProvided;
  const s = String(value).trim();
  return s === '' ? L.notProvided : s;
}

function chf(value: any, L: LabelDict, localeStr: string): string {
  const n = Number(value);
  if (!value || isNaN(n) || n === 0) return L.notProvided;
  return `CHF ${n.toLocaleString(localeStr)}`;
}

function yesNo(value: any, L: LabelDict): string {
  if (value === null || value === undefined || value === '') return L.notProvided;
  const v = String(value).toLowerCase();
  if (v === 'ja' || v === 'oui' || v === 'sì' || v === 'si' || v === 'yes' || v === 'true') return L.yes;
  if (v === 'nein' || v === 'non' || v === 'no' || v === 'false') return L.no;
  return String(value);
}

function modellLabel(value: any, L: LabelDict): string {
  if (!value) return L.notProvided;
  const v = String(value).toLowerCase();
  if (v === 'saron') return L.modell_saron;
  if (v === 'mix') return L.modell_mix;
  const n = Number(v);
  if (!isNaN(n) && n > 0) return `${n} ${n === 1 ? L.yearsSingular : L.yearsPlural}`;
  return String(value);
}

function artImmobilieLabel(value: any, L: LabelDict): string {
  if (!value) return L.notProvided;
  const v = String(value).toLowerCase();
  switch (v) {
    case 'neubau': return L.artImmobilie_neubau;
    case 'bestehend': return L.artImmobilie_bestehend;
    case 'bestandsobjekt': return L.artImmobilie_bestandsobjekt;
    case 'rendite': return L.artImmobilie_rendite;
    default: return String(value);
  }
}

function neubauArtLabel(value: any, L: LabelDict): string {
  if (!value) return L.notProvided;
  const v = String(value).toLowerCase();
  switch (v) {
    case 'bereits_erstellt': return L.neubauArt_bereits_erstellt;
    case 'im_bau': return L.neubauArt_im_bau;
    case 'geplant': return L.neubauArt_geplant;
    case 'bauprojekt': return L.neubauArt_bauprojekt;
    default: return String(value);
  }
}

function typLabel(value: any, L: LabelDict): string {
  if (!value) return L.notProvided;
  const v = String(value).toLowerCase();
  switch (v) {
    case 'nat': return L.typ_nat;
    case 'jur': return L.typ_jur;
    case 'partner': return L.typ_partner;
    default: return String(value);
  }
}

function projektArtLabel(value: any, L: LabelDict): string {
  if (!value) return L.notProvided;
  const v = String(value).toLowerCase();
  if (v === 'kauf') return L.projektArt_kauf;
  if (v === 'abloesung') return L.projektArt_abloesung;
  return String(value);
}

// Build a single-row HTML <tr>. Always renders, using "-" for empty.
function row(label: string, value: string): string {
  return `<tr><td>${label}:</td><td>${value}</td></tr>`;
}

/* ==========================================================================
 * CALCULATOR — server-side replication of components/funnelCalc.tsx
 * Returns a result object or null when calculator should not be shown
 * (e.g. Rendite-Immobilie). Mirrors the formulas exactly.
 * ======================================================================== */
function computeFunnelCalc(data: any): null | {
  type: 'kauf' | 'abloesung';
  isJur: boolean;
  totalMortgage: number;
  ownFunds: number;
  equityRatio: number;
  ltv: number;
  affordability: number;
  eligible: boolean;
} {
  const STRESS_RATE = 0.05;
  const MAINTENANCE_RATE = 0.008;
  const AFFORDABILITY_THRESHOLD = 0.35;

  const projektArt = String(data.project?.projektArt || '').toLowerCase();
  const borrowerType = data.borrowers?.[0]?.type;
  const isJur = borrowerType === 'jur';
  const nutzung = data.property?.nutzung || data.financing?.nutzung || '';

  const isRendite =
    nutzung === 'Rendite-Immobilie' ||
    String(nutzung).toLowerCase().includes('rendite') ||
    String(nutzung).toLowerCase().includes('investment');
  if (isRendite) return null;

  const isZweitwohnsitz =
    String(nutzung).toLowerCase().includes('zweit') ||
    String(nutzung).toLowerCase().includes('ferien') ||
    String(nutzung).toLowerCase().includes('secondary');
  const isPrimaryResidence = !isZweitwohnsitz;

  const ltvLimit = isPrimaryResidence ? 0.8 : 0.65;
  const minEquityPct = isPrimaryResidence ? 0.2 : 0.35;

  const f = data.financing || {};

  if (projektArt === 'kauf') {
    const propertyPrice = Number(f.kaufpreis || 0);
    if (propertyPrice <= 0) return null;
    const ownFunds = isJur
      ? Number(f.eigenmittel_bar || 0)
      : Number(f.eigenmittel_bar || 0) +
        Number(f.eigenmittel_saeule3 || 0) +
        Number(f.eigenmittel_pk || 0) +
        Number(f.eigenmittel_schenkung || 0);
    const totalMortgage = Math.max(0, propertyPrice - ownFunds);
    const ltv = propertyPrice > 0 ? totalMortgage / propertyPrice : 0;
    const equityRatio = propertyPrice > 0 ? ownFunds / propertyPrice : 0;
    const ltvOk = ltv <= ltvLimit;
    const equityOk = equityRatio >= minEquityPct;

    let affordability = 0;
    let affordabilityOk = true;
    if (!isJur) {
      const grossIncome = Number(f.brutto || 0) + Number(f.bonus || 0);
      const affordabilityCHF = isPrimaryResidence
        ? totalMortgage * (STRESS_RATE + MAINTENANCE_RATE + (0.8 - 0.6667) / 15)
        : totalMortgage * (STRESS_RATE + MAINTENANCE_RATE);
      affordability = grossIncome > 0 ? affordabilityCHF / grossIncome : 0;
      affordabilityOk = affordability <= AFFORDABILITY_THRESHOLD;
    }

    return {
      type: 'kauf',
      isJur,
      totalMortgage,
      ownFunds,
      equityRatio,
      ltv,
      affordability,
      eligible: ltvOk && equityOk && affordabilityOk,
    };
  }

  if (projektArt === 'abloesung') {
    const existingMortgage = Number(f.abloesung_betrag || 0);
    const mortgageIncrease = String(f.erhoehung).toLowerCase() === 'ja' || String(f.erhoehung).toLowerCase() === 'yes'
      ? Number(f.erhoehung_betrag || 0)
      : 0;
    const totalMortgage = existingMortgage + mortgageIncrease;
    if (totalMortgage <= 0) return null;
    const propertyValue = Number(f.immobilienwert || 0) || Number(f.kaufpreis || 0);
    const ltv = propertyValue > 0 ? totalMortgage / propertyValue : 0;
    const ltvOk = propertyValue > 0 ? ltv <= ltvLimit : true;

    let affordability = 0;
    let affordabilityOk = true;
    if (!isJur) {
      const grossIncome = Number(f.brutto || 0) + Number(f.bonus || 0);
      const affordabilityCHF = isPrimaryResidence
        ? totalMortgage * (STRESS_RATE + MAINTENANCE_RATE + (0.8 - 0.6667) / 15)
        : totalMortgage * (STRESS_RATE + MAINTENANCE_RATE);
      affordability = grossIncome > 0 ? affordabilityCHF / grossIncome : 0;
      affordabilityOk = affordability <= AFFORDABILITY_THRESHOLD;
    }

    return {
      type: 'abloesung',
      isJur,
      totalMortgage,
      ownFunds: 0,
      equityRatio: 0,
      ltv,
      affordability,
      eligible: ltvOk && affordabilityOk,
    };
  }

  return null;
}

// Generate HTML email template for funnel submission
function generateFunnelEmailHTML(data: any, saved: any, locale: EmailLocale = 'de'): string {
  const L = EMAIL_LABELS[locale];
  const localeStr = L.locale;

  const customerTypeLabel =
    data.customerType === 'partner' ? L.customerType_partner :
    data.customerType === 'direct' ? L.customerType_direct :
    L.customerType_unknown;

  const projektLabel = projektArtLabel(data.project?.projektArt, L);
  const c = data.client || {};
  const p = data.project || {};
  const pr = data.property || {};
  const f = data.financing || {};

  // Borrower/person type (nat | jur | partner) — shown in the project section
  const borrowerTyp =
    data.borrowers?.[0]?.type ||
    (Array.isArray(pr.kreditnehmer) ? pr.kreditnehmer[0]?.type : '') ||
    p.kreditnehmerTyp ||
    data.project?.borrowerType ||
    '';

  // Borrowers/kreditnehmer rows from property.kreditnehmer (no e-mail/phone/type here)
  const kreditnehmerList: any[] = Array.isArray(pr.kreditnehmer) ? pr.kreditnehmer : [];
  const kreditnehmerHTML = kreditnehmerList.map((kn: any, i: number) => `
        <tr><td colspan="2" style="background-color: #f9f9f9; font-weight: 600; padding: 12px;">${L.borrowerN} ${i + 1}</td></tr>
        ${row(`&nbsp;&nbsp;${L.firstName}`, dash(kn.vorname || kn.firstName, L))}
        ${row(`&nbsp;&nbsp;${L.lastName}`, dash(kn.name || kn.lastName, L))}
        ${row(`&nbsp;&nbsp;${L.birthdate}`, dash(kn.geburtsdatum || kn.birthdate, L))}
        ${row(`&nbsp;&nbsp;${L.employment}`, dash(kn.erwerb || kn.job, L))}
        ${row(`&nbsp;&nbsp;${L.civilStatus}`, dash(kn.zivilstand || kn.civil, L))}
      `).join('');

  // Companies (juristische Personen)
  const firmenList: any[] = Array.isArray(pr.firmen) ? pr.firmen : [];
  const firmenHTML = firmenList.length === 0
    ? `<tr><td colspan="2">${L.notProvided}</td></tr>`
    : firmenList.map((firma: any, i: number) => `
        <tr><td colspan="2" style="background-color: #f9f9f9; font-weight: 600; padding: 12px;">${L.companyN} ${i + 1}</td></tr>
        ${row(`&nbsp;&nbsp;${L.companyName}`, dash(firma.firmenname || firma.name, L))}
      `).join('');

  // Financing offers list (property.angeboteListe)
  const angeboteListe: string[] = Array.isArray(pr.angeboteListe) ? pr.angeboteListe : [];
  const angebote: any[] = Array.isArray(pr.angebote) && pr.angebote.length > 0
    ? pr.angebote
    : (Array.isArray(p.angebote) ? p.angebote : []);
  const offerListHTML = angeboteListe.length > 0
    ? angeboteListe.map((offer: string, i: number) => row(`${L.offerN} ${i + 1}`, dash(offer, L))).join('')
    : '';
  const offerStructuredHTML = angebote.length > 0
    ? angebote.map((o: any, i: number) => `
        <tr><td colspan="2" style="background-color: #f9f9f9; font-weight: 600; padding: 10px;">${L.offerN} ${i + 1}</td></tr>
        ${row(`&nbsp;&nbsp;${L.bank}`, dash(o.bank, L))}
        ${row(`&nbsp;&nbsp;${L.interestRate}`, dash(o.zins, L))}
        ${row(`&nbsp;&nbsp;${L.term}`, dash(o.laufzeit, L))}
      `).join('')
    : '';
  const combinedOffersHTML = offerListHTML + offerStructuredHTML;

  // Partner additional borrowers (data.borrowers array) — numbering continues after kreditnehmerList
  const borrowersList: any[] = Array.isArray(data.borrowers) ? data.borrowers : [];
  const additionalBorrowersHTML = borrowersList.map((b: any, i: number) => `
        <tr><td colspan="2" style="background-color: #f9f9f9; font-weight: 600; padding: 12px;">${L.borrowerN} ${kreditnehmerList.length + i + 1}</td></tr>
        ${row(`&nbsp;&nbsp;${L.firstName}`, dash(b.vorname || b.firstName, L))}
        ${row(`&nbsp;&nbsp;${L.lastName}`, dash(b.name || b.lastName, L))}
        ${row(`&nbsp;&nbsp;${L.birthdate}`, dash(b.geburtsdatum || b.birthdate, L))}
        ${row(`&nbsp;&nbsp;${L.employment}`, dash(b.erwerb || b.job, L))}
        ${row(`&nbsp;&nbsp;${L.civilStatus}`, dash(b.zivilstand || b.civil, L))}
      `).join('');

  // Unified borrowers block — single "-" placeholder only when there are no borrowers at all
  const borrowersSectionHTML =
    (kreditnehmerHTML + additionalBorrowersHTML) || `<tr><td colspan="2">${L.notProvided}</td></tr>`;

  // Eigenmittel total
  const totalEigenmittel =
    Number(f.eigenmittel_bar || 0) +
    Number(f.eigenmittel_saeule3 || 0) +
    Number(f.eigenmittel_pk || 0) +
    Number(f.eigenmittel_schenkung || 0);

  // Calculator block
  const calc = computeFunnelCalc(data);

  // Financing display helpers
  const projektArtLower = String(p.projektArt || '').toLowerCase();
  const isAbloesung = projektArtLower === 'abloesung';
  const isKauf = projektArtLower === 'kauf';
  const isDirect = data.customerType === 'direct';
  // Mortgage amount: use entered value, else fall back to the computed estimate
  const hypoBetragValue = f.hypoBetrag || (calc ? calc.totalMortgage : '');
  // Gross annual income = gross income + bonus
  const bruttoJahr = (Number(f.brutto) || 0) + (Number(f.bonus) || 0);
  const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.', localeStr.startsWith('en') ? '.' : ',')}%`;
  const calcHTML = !calc ? '' : `
    <div class="section">
      <div class="section-title">${L.section_calc}</div>
      <table>
        ${row(L.calc_totalMortgage, chf(calc.totalMortgage, L, localeStr))}
        ${calc.type === 'kauf' ? row(L.calc_ownFunds, chf(calc.ownFunds, L, localeStr)) : ''}
        ${calc.type === 'kauf' ? row(L.calc_equityRatio, fmtPct(calc.equityRatio)) : ''}
        ${row(L.calc_ltv, fmtPct(calc.ltv))}
        ${!calc.isJur ? row(L.calc_affordability, fmtPct(calc.affordability)) : ''}
        <tr>
          <td>${L.calc_eligible}:</td>
          <td><strong style="color: ${calc.eligible ? '#0a8a0a' : '#c0392b'};">
            ${calc.eligible ? L.calc_eligible : L.calc_notEligible}
          </strong></td>
        </tr>
      </table>
    </div>
  `;

  const receivedAtFmt = new Date(saved.createdAt).toLocaleString(localeStr, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  });

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #132219; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
    .header { background-color: #ffffff; color: #000000; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; border-bottom: 3px solid #CAF476; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; color: #000000; }
    .header p { color: #000000; }
    .content { background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .section { margin-bottom: 25px; }
    .section-title { background-color: #CAF476; color: #132219; padding: 10px 15px; border-radius: 5px; font-weight: 600; margin-bottom: 15px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    td { padding: 10px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
    td:first-child { font-weight: 500; width: 40%; color: #555; }
    .highlight { background-color: #fff8e6; padding: 15px; border-left: 4px solid #CAF476; margin: 15px 0; border-radius: 5px; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
    .summary-box { background-color: #f0f9ff; border: 2px solid #CAF476; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .summary-box strong { color: #132219; }
    .subhead { background-color: #f0f9ff; padding: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="color:#000000;">${L.subject}</h1>
    <p style="margin: 10px 0 0 0; color:#000000;">${L.inquiryId}: ${saved.id}</p>
  </div>

  <div class="content">
    <div class="highlight">
      <strong>${L.customerType}:</strong> ${customerTypeLabel}<br>
      <strong>${L.projectType}:</strong> ${projektLabel}<br>
      <strong>${L.receivedAt}:</strong> ${receivedAtFmt}
    </div>

    <div class="section">
      <div class="section-title">${L.section_client}</div>
      <table>
        ${row(L.firstName, dash(c.firstName || c.vorname, L))}
        ${row(L.lastName, dash(c.lastName || c.name, L))}
        ${row(L.email, c.email ? `<a href="mailto:${c.email}" style="color:#132219;text-decoration:underline;">${c.email}</a>` : L.notProvided)}
        ${row(L.phone, c.phone ? `<a href="tel:${c.phone}" style="color:#132219;text-decoration:underline;">${c.phone}</a>` : L.notProvided)}
        ${row(L.zip, dash(c.zip || pr.zip, L))}
        ${row(L.ort, dash(c.ort || pr.ort, L))}
        ${row(L.company, dash(c.firma || c.company, L))}
      </table>
    </div>

    <div class="section">
      <div class="section-title">${L.section_project}</div>
      <table>
        ${row(L.projectType, projektLabel)}
        ${row(L.plzLiegenschaft, dash(p.liegenschaftZip, L))}
        ${row(L.type, typLabel(borrowerTyp, L))}
      </table>
    </div>

    <div class="section">
      <div class="section-title">${L.section_property}</div>
      <table>
        ${row(L.artImmobilie, artImmobilieLabel(pr.artImmobilie, L))}
        ${row(L.neubauArt, neubauArtLabel(pr.neubauArt, L))}
        ${row(L.artLiegenschaft, dash(pr.artLiegenschaft, L))}
        ${row(L.nutzung, dash(pr.nutzung, L))}
        ${row(L.renovation, yesNo(pr.renovation, L))}
        ${row(L.renovationsBetrag, chf(pr.renovationsBetrag, L, localeStr))}
        ${row(L.reserviert, yesNo(pr.reserviert, L))}
        ${row(L.finanzierungsangebote, yesNo(pr.finanzierungsangebote, L))}
      </table>
      ${combinedOffersHTML ? `
        <div style="margin-top: 15px; background-color: #f9f9f9; padding: 15px; border-radius: 5px;">
          <strong style="color: #132219;">${L.section_offers}</strong>
          <table style="margin-top: 10px;">${combinedOffersHTML}</table>
        </div>
      ` : ''}
    </div>

    <div class="section">
      <div class="section-title">${L.section_borrowers}</div>
      <table>
        ${borrowersSectionHTML}
      </table>
    </div>

    <div class="section">
      <div class="section-title">${L.section_companies}</div>
      <table>
        ${firmenHTML}
      </table>
    </div>

    <div class="section">
      <div class="section-title">${L.section_financing}</div>

      ${f.kaufpreis ? `
      <div class="summary-box">
        <strong>${L.kaufpreis}:</strong> ${chf(f.kaufpreis, L, localeStr)}<br>
        ${totalEigenmittel > 0 ? `<strong>${L.eigenmittel_total}:</strong> ${chf(totalEigenmittel, L, localeStr)}<br>` : ''}
        ${hypoBetragValue ? `<strong>${L.hypoBetrag}:</strong> ${chf(hypoBetragValue, L, localeStr)}` : ''}
      </div>
      ` : ''}

      <table>
        ${row(L.kaufpreis, chf(f.kaufpreis, L, localeStr))}
        ${isAbloesung ? row(L.abloesungBetrag, chf(f.abloesung_betrag, L, localeStr)) : ''}

        <tr><td colspan="2" class="subhead">${L.eigenmittelBreakdown}</td></tr>
        ${row(`&nbsp;&nbsp;${L.eigenmittel_bar}`, chf(f.eigenmittel_bar, L, localeStr))}
        ${row(`&nbsp;&nbsp;${L.eigenmittel_saeule3}`, chf(f.eigenmittel_saeule3, L, localeStr))}
        ${row(`&nbsp;&nbsp;${L.eigenmittel_pk}`, chf(f.eigenmittel_pk, L, localeStr))}
        ${row(`&nbsp;&nbsp;${L.eigenmittel_schenkung}`, chf(f.eigenmittel_schenkung, L, localeStr))}
        ${row(`&nbsp;&nbsp;${L.eigenmittel_total}`, chf(totalEigenmittel, L, localeStr))}

        ${row(L.pkVorbezug, yesNo(f.pkVorbezug, L))}
        ${row(L.hypoBetrag, chf(hypoBetragValue, L, localeStr))}
        ${row(L.modell, modellLabel(f.modell, L))}
        ${row(L.einkommen, chf(bruttoJahr || f.einkommen, L, localeStr))}
        ${row(L.brutto, chf(f.brutto, L, localeStr))}
        ${row(L.bonus, chf(f.bonus, L, localeStr))}
        ${row(L.nettoMietertrag, chf(f.netto_mietertrag || f.jaehrlicher_netto_mietertrag, L, localeStr))}
        ${isDirect ? row(L.steueroptimierung, yesNo(f.steueroptimierung, L)) : ''}
        ${isKauf ? row(L.kaufdatum, dash(f.kaufdatum, L)) : ''}
        ${isAbloesung ? row(L.erhoehung, yesNo(f.erhoehung, L)) : ''}
        ${isAbloesung ? row(L.erhoehungBetrag, chf(f.erhoehung_betrag, L, localeStr)) : ''}
        ${isAbloesung ? row(L.abloesedatum, dash(f.abloesedatum, L)) : ''}
        <tr>
          <td>${L.kommentar}:</td>
          <td style="white-space: pre-wrap; background-color: #f9f9f9; padding: 10px; border-radius: 5px;">${dash(f.kommentar, L)}</td>
        </tr>
      </table>
    </div>

    ${calcHTML}
  </div>

  <div class="footer">
    <p>${L.footer_disclaimer}</p>
    <p>${L.inquiryId}: <strong>${saved.id}</strong> | ${L.receivedAt}: ${receivedAtFmt}</p>
    <p>© ${new Date().getFullYear()} HYPOTEQ - ${L.footer_rights}</p>
  </div>
</body>
</html>
  `;
}

// Send auto-response to customer after funnel submission
async function sendFunnelAutoResponse(customerEmail: string, firstName: string, locale: EmailLocale = 'de') {
  try {
    console.log("📧 Sending funnel auto-response to customer:", customerEmail, "locale:", locale);

    const useGraph = process.env.USE_GRAPH === "true" &&
                     process.env.GRAPH_TENANT_ID &&
                     process.env.GRAPH_CLIENT_ID &&
                     process.env.GRAPH_CLIENT_SECRET;

    const autoResponseHTML = generateFunnelAutoResponseHTML(firstName, locale);
    const subject = AUTO_RESPONSE_SUBJECT[locale];

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

const AUTO_RESPONSE_SUBJECT: Record<EmailLocale, string> = {
  de: 'Deine Hypothekaranfrage ist eingegangen',
  fr: "Ta demande d'hypothèque a été reçue",
  it: 'La tua richiesta ipotecaria è stata ricevuta',
  en: 'Your mortgage request has been received',
};

const AUTO_RESPONSE_CONTENT: Record<EmailLocale, {
  tagline: string;
  greetingFn: (name: string) => string;
  body: string;
  signoff: string;
  team: string;
}> = {
  de: {
    tagline: 'Deine Hypotheken-Experten',
    greetingFn: (n) => `Hi${n ? ' ' + n : ''},`,
    body: 'Danke für deine Anfrage und dein Vertrauen in HYPOTEQ. Wir haben alle Informationen erhalten und melden uns bald (werktags), um die nächsten Schritte zu besprechen.',
    signoff: 'Beste Grüsse',
    team: 'Dein HYPOTEQ Team',
  },
  fr: {
    tagline: 'Tes experts hypothécaires',
    greetingFn: (n) => `Salut${n ? ' ' + n : ''},`,
    body: "Merci pour ta demande et pour ta confiance envers HYPOTEQ. Nous avons bien reçu toutes les informations et te recontactons bientôt (jours ouvrables) pour discuter des prochaines étapes.",
    signoff: 'Meilleures salutations',
    team: 'Ton équipe HYPOTEQ',
  },
  it: {
    tagline: 'I tuoi esperti ipotecari',
    greetingFn: (n) => `Ciao${n ? ' ' + n : ''},`,
    body: 'Grazie per la tua richiesta e per la fiducia in HYPOTEQ. Abbiamo ricevuto tutte le informazioni e ti ricontatteremo presto (giorni lavorativi) per discutere i prossimi passi.',
    signoff: 'Cordiali saluti',
    team: 'Il tuo team HYPOTEQ',
  },
  en: {
    tagline: 'Your mortgage experts',
    greetingFn: (n) => `Hi${n ? ' ' + n : ''},`,
    body: "Thanks for your request and your trust in HYPOTEQ. We've received all the information and will get back to you soon (business days) to discuss the next steps.",
    signoff: 'Best regards',
    team: 'Your HYPOTEQ team',
  },
};

const AUTO_RESPONSE_RIGHTS: Record<EmailLocale, string> = {
  de: 'Alle Rechte vorbehalten',
  fr: 'Tous droits réservés',
  it: 'Tutti i diritti riservati',
  en: 'All rights reserved',
};

// Generate auto-response HTML for funnel submission (locale-specific)
function generateFunnelAutoResponseHTML(firstName: string, locale: EmailLocale = 'de'): string {
  const c = AUTO_RESPONSE_CONTENT[locale];
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
      <div style="color: #666; font-size: 14px;">${c.tagline}</div>
    </div>

    <div class="section">
      <div class="greeting">${c.greetingFn(firstName)}</div>
      <div class="text">${c.body}</div>
    </div>

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
    <p>© ${new Date().getFullYear()} HYPOTEQ AG - ${AUTO_RESPONSE_RIGHTS[locale]}</p>
  </div>
</body>
</html>
  `;
}