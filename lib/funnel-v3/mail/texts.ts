/**
 * Texts of the v5 closing mails (Handover 7) that messages/funnel-v3 does not have
 * (DECISIONS V10: subject and section titles come from `mail.*` there; the body copy, where
 * the package gives none, is the existing v3 confirmation copy, adapted).
 *
 * Address (Handover 7.3, DECISIONS D9): the customer mail is «du» in German, «vous» in French,
 * «Lei» in Italian; the Berater and the internal mail are neutral in every language.
 *
 * `labels` also names the facts read from the documents (Handover 3.1 «Zusätzlich»), so the
 * mail and the Fall-Dossier label them alike.
 */

import type { Lang } from "../i18n";

export type Audience = "kunde" | "berater" | "intern";

export interface MailLabels {
  caseNo: string;
  date: string;
  entry: string;
  name: string;
  birthdate: string;
  nationality: string;
  civil: string;
  children: string;
  address: string;
  plzOrt: string;
  employer: string;
  uid: string;
  seat: string;
  neubauArt: string;
  neubauBuilt: string;
  nbDocs: string;
  yearBuilt: string;
  rooms: string;
  livingArea: string;
  heating: string;
  buildingRight: string;
  valueQuota: string;
  liens: string;
  renewalFund: string;
  cubature: string;
  insuredSum: string;
  existingBank: string;
  rate: string;
  term: string;
  redemptionDate: string;
  pledge3a: string;
  pkAssets: string;
  pkWithdrawal: string;
  reserved: string;
  emTotal: string;
  emHard: string;
  verdict: string;
  amount: string;
  residualDebt: string;
  instalment: string;
  residualValue: string;
  comment: string;
  inquiryId: string;
  folder: string;
  dossier: string;
  salesforceCase: string;
  uploadPage: string;
}

export interface MailTexts {
  /** Berater mail: the subject without «Deine» (mail.subject is the customer's). */
  subjectNeutral: string;
  /** Internal mail. */
  subjectIntern: string;
  tagline: string;
  /** Berater and internal mail. */
  taglineNeutral: string;
  greeting: string;
  introKunde: string;
  /** Customer mail of a case a Berater entered. */
  introKundeByBerater: string;
  summaryIntro: string;
  introBerater: string;
  introIntern: string;
  signKunde: string;
  signBerater: string;
  /** Internal mail: the block title and text (DECISIONS V11 «keine Anfrage an die Bank»). */
  signTitleIntern: string;
  signIntern: string;
  attachment: string;
  signCta: string;
  missingKunde: string;
  missingBerater: string;
  missingCtaKunde: string;
  missingCtaBerater: string;
  linkNote: string;
  linkIntro: string;
  linkCta: string;
  sfOpen: string;
  sfFailed: string;
  sfTest: string;
  sfNoLink: string;
  sfDropped: string;
  questions: string;
  yourAdvisor: string;
  advisorNeutral: string;
  signoff: string;
  team: string;
  teamNeutral: string;
  autoIntern: string;
  rights: string;
  labels: MailLabels;
}

export const MAIL_TEXTS: Record<Lang, MailTexts> = {
  de: {
    subjectNeutral: "Finanzierungsanfrage {id} – {name}, {place}",
    subjectIntern: "Neue Finanzierungsanfrage {id} – {name}, {place}",
    tagline: "Deine Hypotheken-Experten",
    taglineNeutral: "Hypotheken-Experten",
    greeting: "Hi {name},",
    introKunde:
      "Danke für deine Anfrage und dein Vertrauen in HYPOTEQ. Wir haben alle Informationen erhalten und melden uns bald (werktags), um die nächsten Schritte zu besprechen.",
    introKundeByBerater:
      "{berater} hat deine Finanzierungsanfrage bei HYPOTEQ erfasst. Wir haben alle Informationen erhalten und melden uns bald (werktags), um die nächsten Schritte zu besprechen.",
    summaryIntro: "Hier die Zusammenfassung deiner Anfrage.",
    introBerater: "Die Finanzierungsanfrage für {name} ist bei HYPOTEQ eingegangen. Die Bestätigung mit der Zusammenfassung ging an {email}.",
    introIntern: "Neue Finanzierungsanfrage über den Funnel.",
    signKunde:
      "Die Vorlage liegt dieser E-Mail bei und ist mit deinen Angaben vorausgefüllt. Bitte von allen Kreditnehmern unterzeichnen lassen und über deinen persönlichen Link hochladen. Ohne Unterschrift können wir die Anfrage nicht an die Bank weiterleiten.",
    signBerater:
      "Die Auskunftsermächtigung ist noch nicht unterzeichnet. Die vorausgefüllte Vorlage liegt der Bestätigung an {name} bei; unterzeichnet wird sie über den Link der Anfrage hochgeladen. Ohne Unterschrift geht keine Anfrage an die Bank.",
    signTitleIntern: "Auskunftsermächtigung ausstehend",
    signIntern: "Unterschrift ausstehend – ohne unterzeichnete Auskunftsermächtigung keine Anfrage an die Bank.",
    attachment: "Im Anhang: {file}",
    signCta: "Unterzeichnet hochladen",
    missingKunde: "Am einfachsten lädst du sie über deinen persönlichen Link hoch – dort siehst du nur, was noch offen ist.",
    missingBerater: "Fehlende Unterlagen können über den Link der Anfrage nachgereicht werden.",
    missingCtaKunde: "Fehlende Unterlagen hochladen",
    missingCtaBerater: "Unterlagen nachreichen",
    linkNote: "Der Link ist {days} Tage gültig und nur für diese Anfrage bestimmt.",
    linkIntro: "Deine Anfrage findest du jederzeit über deinen persönlichen Link – dort siehst du den Stand deines Dossiers und kannst Unterlagen nachreichen:",
    linkCta: "Zur Anfrage",
    sfOpen: "Case in Salesforce öffnen",
    sfFailed: "Salesforce-Sync fehlgeschlagen – der Case muss von Hand angelegt werden (Anfrage-ID {id}).",
    sfTest: "Testmodus – in Salesforce wurde kein Case angelegt.",
    sfNoLink: "Case angelegt (ID {caseId}).",
    sfDropped: "Von Salesforce nicht übernommen (von Hand nachtragen): {list}",
    questions: "Fragen? Antworte einfach auf diese E-Mail.",
    yourAdvisor: "Dein Berater",
    advisorNeutral: "Berater",
    signoff: "Beste Grüsse",
    team: "Dein HYPOTEQ Team",
    teamNeutral: "HYPOTEQ Team",
    autoIntern: "Automatisch erzeugt durch den HYPOTEQ Funnel.",
    rights: "Alle Rechte vorbehalten",
    labels: {
      caseNo: "Anfrage-Nr.",
      date: "Datum",
      entry: "Einstieg",
      name: "Name",
      birthdate: "Geburtsdatum",
      nationality: "Nationalität",
      civil: "Zivilstand",
      children: "Kinder",
      address: "Adresse",
      plzOrt: "PLZ / Ort",
      employer: "Arbeitgeber",
      uid: "UID",
      seat: "Sitz",
      neubauArt: "Neubau-Art",
      neubauBuilt: "Bereits erstellt",
      nbDocs: "Grundbuchauszug und GVZ-Police vorhanden",
      yearBuilt: "Baujahr",
      rooms: "Zimmer",
      livingArea: "Wohnfläche",
      heating: "Heizungsart",
      buildingRight: "Baurecht",
      valueQuota: "Wertquote",
      liens: "Grundpfandrechte",
      renewalFund: "Erneuerungsfonds",
      cubature: "Kubatur",
      insuredSum: "Versicherungssumme",
      existingBank: "Bestehende Bank",
      rate: "Zins",
      term: "Laufzeit",
      redemptionDate: "Ablösedatum",
      pledge3a: "Verpfändung Säule 3a",
      pkAssets: "PK-Altersguthaben",
      pkWithdrawal: "PK-Vorbezug möglich",
      reserved: "Liegenschaft reserviert",
      emTotal: "Eigenmittel total",
      emHard: "davon hart",
      verdict: "Urteil",
      amount: "Betrag",
      residualDebt: "Restschuld",
      instalment: "Rate",
      residualValue: "Restwert",
      comment: "Kommentar",
      inquiryId: "Anfrage-ID",
      folder: "Fall-Ordner",
      dossier: "Fall-Dossier",
      salesforceCase: "Salesforce-Case",
      uploadPage: "Nachreich-Seite",
    },
  },
  en: {
    subjectNeutral: "Financing request {id} – {name}, {place}",
    subjectIntern: "New financing request {id} – {name}, {place}",
    tagline: "Your mortgage experts",
    taglineNeutral: "Mortgage experts",
    greeting: "Hi {name},",
    introKunde:
      "Thanks for your request and your trust in HYPOTEQ. We've received all the information and will get back to you soon (business days) to discuss the next steps.",
    introKundeByBerater:
      "{berater} has entered your financing request with HYPOTEQ. We've received all the information and will get back to you soon (business days) to discuss the next steps.",
    summaryIntro: "Here is the summary of your request.",
    introBerater: "The financing request for {name} has reached HYPOTEQ. The confirmation with the summary was sent to {email}.",
    introIntern: "New financing request via the funnel.",
    signKunde:
      "The template is attached to this e-mail, prefilled with your details. Please have it signed by all borrowers and upload it via your personal link. Without a signature we cannot pass the request on to the bank.",
    signBerater:
      "The information authorisation is not signed yet. The prefilled template is attached to the confirmation sent to {name}; once signed, it is uploaded via the request's link. Without a signature no request goes to the bank.",
    signTitleIntern: "Information authorisation pending",
    signIntern: "Signature pending – no request to the bank without the signed authorisation.",
    attachment: "Attached: {file}",
    signCta: "Upload signed copy",
    missingKunde: "The easiest way is to upload them via your personal link – it shows only what is still open.",
    missingBerater: "Missing documents can be added via the request's link.",
    missingCtaKunde: "Upload missing documents",
    missingCtaBerater: "Add documents",
    linkNote: "The link is valid for {days} days and applies to this request only.",
    linkIntro: "You can return to your request at any time via your personal link – it shows the state of your dossier and lets you add documents:",
    linkCta: "Open my request",
    sfOpen: "Open the case in Salesforce",
    sfFailed: "Salesforce sync failed – the case must be created by hand (inquiry ID {id}).",
    sfTest: "Test mode – no case was created in Salesforce.",
    sfNoLink: "Case created (ID {caseId}).",
    sfDropped: "Not written by Salesforce (complete by hand): {list}",
    questions: "Questions? Simply reply to this e-mail.",
    yourAdvisor: "Your advisor",
    advisorNeutral: "Advisor",
    signoff: "Best regards",
    team: "Your HYPOTEQ team",
    teamNeutral: "HYPOTEQ team",
    autoIntern: "Generated automatically by the HYPOTEQ funnel.",
    rights: "All rights reserved",
    labels: {
      caseNo: "Request no.",
      date: "Date",
      entry: "Entry",
      name: "Name",
      birthdate: "Date of birth",
      nationality: "Nationality",
      civil: "Civil status",
      children: "Children",
      address: "Address",
      plzOrt: "Postcode / town",
      employer: "Employer",
      uid: "UID",
      seat: "Registered office",
      neubauArt: "New build type",
      neubauBuilt: "Already built",
      nbDocs: "Land register extract and building insurance available",
      yearBuilt: "Year built",
      rooms: "Rooms",
      livingArea: "Living area",
      heating: "Heating",
      buildingRight: "Building right",
      valueQuota: "Value quota",
      liens: "Mortgage liens",
      renewalFund: "Renewal fund",
      cubature: "Cubature",
      insuredSum: "Sum insured",
      existingBank: "Existing bank",
      rate: "Interest rate",
      term: "Term",
      redemptionDate: "Redemption date",
      pledge3a: "Pillar 3a pledge",
      pkAssets: "Pension fund assets",
      pkWithdrawal: "Pension fund withdrawal possible",
      reserved: "Property reserved",
      emTotal: "Total equity",
      emHard: "of which hard",
      verdict: "Assessment",
      amount: "Amount",
      residualDebt: "Outstanding debt",
      instalment: "Instalment",
      residualValue: "Residual value",
      comment: "Comment",
      inquiryId: "Inquiry ID",
      folder: "Case folder",
      dossier: "Case dossier",
      salesforceCase: "Salesforce case",
      uploadPage: "Upload page",
    },
  },
  fr: {
    subjectNeutral: "Demande de financement {id} – {name}, {place}",
    subjectIntern: "Nouvelle demande de financement {id} – {name}, {place}",
    tagline: "Vos experts hypothécaires",
    taglineNeutral: "Experts hypothécaires",
    greeting: "Bonjour {name},",
    introKunde:
      "Merci pour votre demande et votre confiance envers HYPOTEQ. Nous avons bien reçu toutes les informations et vous recontacterons prochainement (jours ouvrables) pour discuter des prochaines étapes.",
    introKundeByBerater:
      "{berater} a saisi votre demande de financement auprès d'HYPOTEQ. Nous avons bien reçu toutes les informations et vous recontacterons prochainement (jours ouvrables) pour discuter des prochaines étapes.",
    summaryIntro: "Voici le récapitulatif de votre demande.",
    introBerater: "La demande de financement pour {name} est parvenue à HYPOTEQ. La confirmation avec le récapitulatif a été envoyée à {email}.",
    introIntern: "Nouvelle demande de financement via le funnel.",
    signKunde:
      "Le modèle est joint à cet e-mail, prérempli avec vos informations. Veuillez le faire signer par tous les emprunteurs et le téléverser via votre lien personnel. Sans signature, nous ne pouvons pas transmettre la demande à la banque.",
    signBerater:
      "L'autorisation de renseignements n'est pas encore signée. Le modèle prérempli est joint à la confirmation envoyée à {name} ; une fois signé, il se téléverse via le lien de la demande. Sans signature, aucune demande n'est transmise à la banque.",
    signTitleIntern: "Autorisation de renseignements en attente",
    signIntern: "Signature en attente – aucune demande à la banque sans autorisation signée.",
    attachment: "En pièce jointe : {file}",
    signCta: "Téléverser le document signé",
    missingKunde: "Le plus simple est de les téléverser via votre lien personnel – vous n'y verrez que ce qui manque encore.",
    missingBerater: "Les documents manquants peuvent être ajoutés via le lien de la demande.",
    missingCtaKunde: "Téléverser les documents manquants",
    missingCtaBerater: "Ajouter des documents",
    linkNote: "Le lien est valable {days} jours et concerne uniquement cette demande.",
    linkIntro: "Vous pouvez revenir à votre demande à tout moment via votre lien personnel – vous y verrez l'état de votre dossier et pourrez ajouter des documents :",
    linkCta: "Voir ma demande",
    sfOpen: "Ouvrir le case dans Salesforce",
    sfFailed: "Échec de la synchronisation Salesforce – le case doit être créé manuellement (ID de la demande {id}).",
    sfTest: "Mode test – aucun case n'a été créé dans Salesforce.",
    sfNoLink: "Case créé (ID {caseId}).",
    sfDropped: "Non repris par Salesforce (à compléter manuellement) : {list}",
    questions: "Des questions ? Répondez simplement à cet e-mail.",
    yourAdvisor: "Votre conseiller",
    advisorNeutral: "Conseiller",
    signoff: "Meilleures salutations",
    team: "Votre équipe HYPOTEQ",
    teamNeutral: "L'équipe HYPOTEQ",
    autoIntern: "Généré automatiquement par le funnel HYPOTEQ.",
    rights: "Tous droits réservés",
    labels: {
      caseNo: "N° de demande",
      date: "Date",
      entry: "Accès",
      name: "Nom",
      birthdate: "Date de naissance",
      nationality: "Nationalité",
      civil: "État civil",
      children: "Enfants",
      address: "Adresse",
      plzOrt: "NPA / localité",
      employer: "Employeur",
      uid: "IDE",
      seat: "Siège",
      neubauArt: "Type de construction neuve",
      neubauBuilt: "Déjà construit",
      nbDocs: "Extrait du registre foncier et police d'assurance disponibles",
      yearBuilt: "Année de construction",
      rooms: "Pièces",
      livingArea: "Surface habitable",
      heating: "Type de chauffage",
      buildingRight: "Droit de superficie",
      valueQuota: "Quote-part",
      liens: "Droits de gage immobilier",
      renewalFund: "Fonds de rénovation",
      cubature: "Cubage",
      insuredSum: "Somme assurée",
      existingBank: "Banque actuelle",
      rate: "Taux d'intérêt",
      term: "Durée",
      redemptionDate: "Date de remboursement",
      pledge3a: "Mise en gage pilier 3a",
      pkAssets: "Avoir de vieillesse LPP",
      pkWithdrawal: "Retrait LPP possible",
      reserved: "Bien réservé",
      emTotal: "Total des fonds propres",
      emHard: "dont fonds propres durs",
      verdict: "Appréciation",
      amount: "Montant",
      residualDebt: "Solde dû",
      instalment: "Mensualité",
      residualValue: "Valeur résiduelle",
      comment: "Commentaire",
      inquiryId: "ID de la demande",
      folder: "Dossier du cas",
      dossier: "Dossier",
      salesforceCase: "Case Salesforce",
      uploadPage: "Page de dépôt",
    },
  },
  it: {
    subjectNeutral: "Richiesta di finanziamento {id} – {name}, {place}",
    subjectIntern: "Nuova richiesta di finanziamento {id} – {name}, {place}",
    tagline: "I Suoi esperti ipotecari",
    taglineNeutral: "Esperti ipotecari",
    greeting: "Buongiorno {name},",
    introKunde:
      "Grazie per la Sua richiesta e per la fiducia in HYPOTEQ. Abbiamo ricevuto tutte le informazioni e La ricontatteremo presto (giorni lavorativi) per discutere i prossimi passi.",
    introKundeByBerater:
      "{berater} ha registrato la Sua richiesta di finanziamento presso HYPOTEQ. Abbiamo ricevuto tutte le informazioni e La ricontatteremo presto (giorni lavorativi) per discutere i prossimi passi.",
    summaryIntro: "Ecco il riepilogo della Sua richiesta.",
    introBerater: "La richiesta di finanziamento per {name} è pervenuta a HYPOTEQ. La conferma con il riepilogo è stata inviata a {email}.",
    introIntern: "Nuova richiesta di finanziamento tramite il funnel.",
    signKunde:
      "Il modello è allegato a questa e-mail, precompilato con i Suoi dati. La preghiamo di farlo firmare da tutti i mutuatari e di caricarlo tramite il Suo link personale. Senza firma non possiamo inoltrare la richiesta alla banca.",
    signBerater:
      "L'autorizzazione non è ancora firmata. Il modello precompilato è allegato alla conferma inviata a {name}; una volta firmato si carica tramite il link della richiesta. Senza firma nessuna richiesta viene inoltrata alla banca.",
    signTitleIntern: "Autorizzazione in sospeso",
    signIntern: "Firma in sospeso – nessuna richiesta alla banca senza autorizzazione firmata.",
    attachment: "In allegato: {file}",
    signCta: "Carica il documento firmato",
    missingKunde: "Il modo più semplice è caricarli tramite il Suo link personale – vedrà solo ciò che manca ancora.",
    missingBerater: "I documenti mancanti possono essere aggiunti tramite il link della richiesta.",
    missingCtaKunde: "Carica i documenti mancanti",
    missingCtaBerater: "Aggiungere documenti",
    linkNote: "Il link è valido {days} giorni ed è destinato esclusivamente a questa richiesta.",
    linkIntro: "Può tornare alla Sua richiesta in qualsiasi momento tramite il Suo link personale – lì vede lo stato del Suo dossier e può aggiungere documenti:",
    linkCta: "Alla mia richiesta",
    sfOpen: "Apri il case in Salesforce",
    sfFailed: "Sincronizzazione Salesforce non riuscita – il case deve essere creato manualmente (ID richiesta {id}).",
    sfTest: "Modalità test – in Salesforce non è stato creato alcun case.",
    sfNoLink: "Case creato (ID {caseId}).",
    sfDropped: "Non ripreso da Salesforce (da completare manualmente): {list}",
    questions: "Domande? Risponda semplicemente a questa e-mail.",
    yourAdvisor: "Il Suo consulente",
    advisorNeutral: "Consulente",
    signoff: "Cordiali saluti",
    team: "Il Suo team HYPOTEQ",
    teamNeutral: "Il team HYPOTEQ",
    autoIntern: "Generato automaticamente dal funnel HYPOTEQ.",
    rights: "Tutti i diritti riservati",
    labels: {
      caseNo: "N. richiesta",
      date: "Data",
      entry: "Accesso",
      name: "Nome",
      birthdate: "Data di nascita",
      nationality: "Nazionalità",
      civil: "Stato civile",
      children: "Figli",
      address: "Indirizzo",
      plzOrt: "NPA / località",
      employer: "Datore di lavoro",
      uid: "IDI",
      seat: "Sede",
      neubauArt: "Tipo di nuova costruzione",
      neubauBuilt: "Già costruito",
      nbDocs: "Estratto del registro fondiario e polizza disponibili",
      yearBuilt: "Anno di costruzione",
      rooms: "Locali",
      livingArea: "Superficie abitabile",
      heating: "Tipo di riscaldamento",
      buildingRight: "Diritto di superficie",
      valueQuota: "Quota di valore",
      liens: "Diritti di pegno immobiliare",
      renewalFund: "Fondo di rinnovamento",
      cubature: "Cubatura",
      insuredSum: "Somma assicurata",
      existingBank: "Banca attuale",
      rate: "Tasso d'interesse",
      term: "Durata",
      redemptionDate: "Data di rimborso",
      pledge3a: "Costituzione in pegno pilastro 3a",
      pkAssets: "Avere di vecchiaia LPP",
      pkWithdrawal: "Prelievo LPP possibile",
      reserved: "Immobile riservato",
      emTotal: "Totale fondi propri",
      emHard: "di cui fondi propri duri",
      verdict: "Valutazione",
      amount: "Importo",
      residualDebt: "Debito residuo",
      instalment: "Rata",
      residualValue: "Valore residuo",
      comment: "Commento",
      inquiryId: "ID richiesta",
      folder: "Cartella del caso",
      dossier: "Dossier",
      salesforceCase: "Case Salesforce",
      uploadPage: "Pagina di caricamento",
    },
  },
};
