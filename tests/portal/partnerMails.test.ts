import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * HYPOTEQ's partner mail texts (Mail-Texte 20.10.2026): the Case mails M6–M13, the change
 * request decision M14, the footer and the sender of every portal mail. Sent against a fake
 * Microsoft Graph and a fake SMTP: nothing leaves the machine.
 */

const mockPost = jest.fn<any>();
const mockApi = jest.fn<any>();
jest.mock("@microsoft/microsoft-graph-client", () => ({
  Client: { initWithMiddleware: () => ({ api: (path: string) => (mockApi(path), { post: (body: unknown) => mockPost(body) }) }) },
}));
jest.mock("@azure/identity", () => ({ ClientSecretCredential: class {} }));
jest.mock("isomorphic-fetch", () => ({}));
const mockSmtpSend = jest.fn<any>();
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (m: unknown) => mockSmtpSend(m) }) },
}));

import { DICTS, LOCALES, CASE_MAILS, type CaseMail } from "@/lib/portal/i18n/dict";
import {
  caseMail,
  firstName,
  sendChangeDecisionMail,
  sendInviteMail,
  sendMagicLinkMail,
  sendNotificationMail,
  sendResetMail,
} from "@/lib/portal/mail";

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({});
  mockSmtpSend.mockResolvedValue({});
  process.env = { ...ENV, USE_GRAPH: "true", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", SMTP_USER: "info@hypoteq.ch" };
  delete process.env.PORTAL_MAIL_FROM;
});
afterEach(() => {
  process.env = { ...ENV };
});

const sent = () => (mockPost.mock.calls[mockPost.mock.calls.length - 1][0] as any).message as { subject: string; body: { content: string } };
// The HTML escapes apostrophes; the assertions compare against HYPOTEQ's plain text.
const plain = (html: string) => html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const K = "Anna Muster";
const NR = "00001350";

// HYPOTEQ's texts verbatim, for {{kunde}} = Anna Muster and {{case_nr}} = 00001350.
const DE: Record<CaseMail, [string, string]> = {
  received: [
    "Anna Muster · Case 00001350: Anfrage eingegangen",
    "die Finanzierungsanfrage für Anna Muster ist bei uns eingegangen und wird jetzt bearbeitet. Alle Details und den Verlauf sehen Sie im Portal.",
  ],
  missing: [
    "Anna Muster · Case 00001350: Unterlagen fehlen",
    "Für Anna Muster fehlen noch 3 Unterlagen. Bitte laden Sie die markierten Dokumente im Portal hoch, damit wir das Dossier vervollständigen können.",
  ],
  lender: [
    "Anna Muster · Case 00001350: bei der Bank in Prüfung",
    "Gute Nachricht: Die Anfrage für Anna Muster liegt beim Kreditgeber. Wir informieren Sie, sobald eine Rückmeldung da ist.",
  ],
  offer: [
    "Anna Muster · Case 00001350: Angebot liegt vor",
    "Für Anna Muster liegt ein Finanzierungsangebot vor. Die Details besprechen wir direkt — melden Sie sich bei Fragen, wir begleiten den Abschluss.",
  ],
  rework: [
    "Anna Muster · Case 00001350: kleine Nacharbeit nötig",
    "Beim Dossier von Anna Muster braucht es eine Ergänzung. Die Details stehen im Case — bitte kurz reinschauen, dann geht es direkt weiter.",
  ],
  confirmed: [
    "Anna Muster · Case 00001350: Finanzierung bestätigt",
    "Die Bank hat die Finanzierung für Anna Muster bestätigt — der Vertrag läuft. Wir halten Sie über den Abschluss auf dem Laufenden.",
  ],
  closed: [
    "Anna Muster · Case 00001350: abgeschlossen",
    "Geschafft: Die Finanzierung für Anna Muster ist erfolgreich abgeschlossen. Danke für die Zusammenarbeit — das Dossier bleibt im Portal einsehbar.",
  ],
  declined: [
    "Anna Muster · Case 00001350: Rückmeldung der Bank",
    "Die Bank hat die Anfrage für Anna Muster leider abgelehnt. Das heisst nicht, dass es keine Lösung gibt: Wir prüfen Alternativen und melden uns bei Ihnen, um das weitere Vorgehen zu besprechen.",
  ],
};

const FR: Record<CaseMail, [string, string]> = {
  received: [
    "Anna Muster · Dossier 00001350 : demande reçue",
    "la demande de financement pour Anna Muster est bien arrivée et est en cours de traitement. Suivez tous les détails dans le portail.",
  ],
  missing: [
    "Anna Muster · Dossier 00001350 : documents manquants",
    "Il manque encore 3 documents pour Anna Muster. Merci de téléverser les documents marqués dans le portail afin que nous puissions compléter le dossier.",
  ],
  lender: [
    "Anna Muster · Dossier 00001350 : en examen auprès de la banque",
    "Bonne nouvelle : la demande pour Anna Muster est chez le prêteur. Nous vous informons dès réception d'un retour.",
  ],
  offer: [
    "Anna Muster · Dossier 00001350 : offre disponible",
    "Une offre de financement est disponible pour Anna Muster. Nous discutons les détails directement — contactez-nous pour toute question, nous accompagnons la conclusion.",
  ],
  rework: [
    "Anna Muster · Dossier 00001350 : petit complément requis",
    "Le dossier de Anna Muster nécessite un complément. Les détails sont dans le dossier — un coup d'œil rapide et nous poursuivons aussitôt.",
  ],
  confirmed: [
    "Anna Muster · Dossier 00001350 : financement confirmé",
    "La banque a confirmé le financement pour Anna Muster — le contrat est en cours. Nous vous tenons informé jusqu'à la finalisation.",
  ],
  closed: [
    "Anna Muster · Dossier 00001350 : finalisé",
    "C'est fait : le financement pour Anna Muster est conclu avec succès. Merci de votre collaboration — le dossier reste consultable dans le portail.",
  ],
  declined: [
    "Anna Muster · Dossier 00001350 : retour de la banque",
    "La banque a malheureusement refusé la demande pour Anna Muster. Cela ne veut pas dire qu'il n'y a pas de solution : nous examinons des alternatives et vous contacterons pour discuter de la suite.",
  ],
};

describe("Case mails M6–M13", () => {
  it.each(CASE_MAILS.map((m) => [m]))("%s: HYPOTEQ's German subject and text", (m) => {
    const mail = caseMail(DICTS.de, { mail: m, kunde: K, caseNr: NR, name: "Daniel Meier", missing: 3 });
    expect(mail.subject).toBe(DE[m][0]);
    expect(mail.paragraphs).toEqual(["Guten Tag Daniel,", DE[m][1]]);
  });

  it.each(CASE_MAILS.map((m) => [m]))("%s: HYPOTEQ's French subject and text", (m) => {
    const mail = caseMail(DICTS.fr, { mail: m, kunde: K, caseNr: NR, name: "Sophie Dubois", missing: 3 });
    expect(mail.subject).toBe(FR[m][0]);
    expect(mail.paragraphs).toEqual(["Bonjour Sophie,", FR[m][1]]);
  });

  it("English and Italian subjects name the Case as HYPOTEQ wrote them", () => {
    expect(caseMail(DICTS.en, { mail: "received", kunde: K, caseNr: NR, name: null }).subject).toBe("Anna Muster · Case 00001350: request received");
    expect(caseMail(DICTS.en, { mail: "declined", kunde: K, caseNr: NR, name: null }).paragraphs[1]).toBe(
      "Unfortunately the bank has declined the request for Anna Muster. This does not mean there is no solution: we are reviewing alternatives and will contact you to discuss the next steps."
    );
    expect(caseMail(DICTS.it, { mail: "offer", kunde: K, caseNr: NR, name: null }).subject).toBe("Anna Muster · Caso 00001350: offerta disponibile");
    expect(caseMail(DICTS.it, { mail: "closed", kunde: K, caseNr: NR, name: null }).paragraphs[1]).toBe(
      "Fatto: il finanziamento per Anna Muster è stato concluso con successo. Grazie per la collaborazione — il dossier resta consultabile nel portale."
    );
  });

  it("greet the partner by first name, or without a name", () => {
    const greet = (locale: (typeof LOCALES)[number], name: string | null) => caseMail(DICTS[locale], { mail: "offer", kunde: K, caseNr: NR, name }).paragraphs[0];
    expect(greet("de", "  Daniel   Meier ")).toBe("Guten Tag Daniel,");
    expect(greet("en", "Daniel Meier")).toBe("Hello Daniel,");
    expect(greet("fr", "Daniel Meier")).toBe("Bonjour Daniel,");
    expect(greet("it", "Daniel Meier")).toBe("Buongiorno Daniel,");
    expect(greet("de", null)).toBe("Guten Tag,");
    expect(greet("en", "")).toBe("Hello,");
    expect(greet("fr", "   ")).toBe("Bonjour,");
    expect(greet("it", null)).toBe("Buongiorno,");
    expect(firstName("Daniel")).toBe("Daniel");
  });

  it("M7 words one, several and an unknown number of missing documents", () => {
    const text = (locale: (typeof LOCALES)[number], missing: number | null) => caseMail(DICTS[locale], { mail: "missing", kunde: K, caseNr: NR, name: null, missing }).paragraphs[1];
    expect(text("de", 1)).toMatch(/^Für Anna Muster fehlt noch 1 Unterlage\. Bitte laden Sie/);
    expect(text("de", 4)).toMatch(/^Für Anna Muster fehlen noch 4 Unterlagen\. Bitte laden Sie/);
    expect(text("de", 0)).toMatch(/^Für Anna Muster fehlen noch Unterlagen\. Bitte laden Sie/);
    expect(text("de", null)).toMatch(/^Für Anna Muster fehlen noch Unterlagen\. Bitte laden Sie/);
    expect(text("en", 1)).toMatch(/^1 document is still missing for Anna Muster\. Please upload/);
    expect(text("en", 2)).toMatch(/^2 documents are still missing for Anna Muster\. Please upload/);
    expect(text("en", null)).toMatch(/^Documents are still missing for Anna Muster\. Please upload/);
    expect(text("fr", 1)).toMatch(/^Il manque encore 1 document pour Anna Muster\. Merci de/);
    expect(text("fr", 0)).toMatch(/^Il manque encore des documents pour Anna Muster\. Merci de/);
    expect(text("it", 1)).toMatch(/^Manca ancora 1 documento per Anna Muster\. La preghiamo/);
    expect(text("it", 5)).toMatch(/^Mancano ancora 5 documenti per Anna Muster\. La preghiamo/);
    expect(text("it", null)).toMatch(/^Mancano ancora dei documenti per Anna Muster\. La preghiamo/);
  });

  it("go out with the status line as heading, HYPOTEQ's text instead of the old generic sentence, and «Case öffnen»", async () => {
    await sendNotificationMail({ to: "d.meier@meier-finanz.ch", name: "Daniel Meier", origin: "https://portal.example", caseId: "500AB", kunde: K, caseNr: NR, mail: "lender", missing: 0, locale: "de" });
    const msg = sent();
    expect(msg.subject).toBe(DE.lender[0]);
    const html = plain(msg.body.content);
    expect(html).toContain(">Bei der Bank in Prüfung</h1>");
    expect(html).toContain(">Guten Tag Daniel,</p>");
    expect(html).toContain(DE.lender[1]);
    expect(html).toContain('href="https://portal.example/portal/cases/500AB"');
    expect(html).toContain("Case öffnen &rarr;");
    expect(html).not.toContain("Die Details finden Sie nach dem Login");
  });

  it("fall back to German for an unknown portal language", async () => {
    await sendNotificationMail({ to: "x@partner.ch", name: null, origin: "https://p", caseId: "1", kunde: K, caseNr: NR, mail: "closed", locale: "xx" });
    expect(sent().subject).toBe(DE.closed[0]);
  });
});

describe("M14 change request decided", () => {
  const BASE = { to: "d.meier@meier-finanz.ch", name: "Daniel Meier", origin: "https://portal.example", nr: "AA-D6D33B", field: "phone" };

  it("German, übernommen", async () => {
    await sendChangeDecisionMail({ ...BASE, locale: "de", approved: true });
    const msg = sent();
    expect(msg.subject).toBe("Ihr Änderungsantrag AA-D6D33B: übernommen");
    const html = plain(msg.body.content);
    expect(html).toContain(">Guten Tag Daniel,</p>");
    expect(html).toContain("Ihr Änderungsantrag zu «Telefon» wurde übernommen. Die Angabe ist ab sofort aktualisiert. Danke für die Meldung.");
    expect(html).toContain('href="https://portal.example/portal/profil"');
    expect(html).toContain("Profil öffnen &rarr;");
  });

  it("German, nicht übernommen", async () => {
    await sendChangeDecisionMail({ ...BASE, field: "iban", locale: null, approved: false });
    const msg = sent();
    expect(msg.subject).toBe("Ihr Änderungsantrag AA-D6D33B: nicht übernommen");
    expect(plain(msg.body.content)).toContain(
      "Ihr Änderungsantrag zu «Bankverbindung (IBAN)» wurde nicht übernommen. Die Details zum Entscheid finden Sie im Portal. Danke für die Meldung."
    );
  });

  it("French, acceptée and refusée", async () => {
    await sendChangeDecisionMail({ ...BASE, name: null, locale: "fr", approved: true });
    let msg = sent();
    expect(msg.subject).toBe("Votre demande de modification AA-D6D33B : acceptée");
    expect(plain(msg.body.content)).toContain(">Bonjour,</p>");
    expect(plain(msg.body.content)).toContain(
      "votre demande de modification concernant « Téléphone » a été acceptée. L'information est mise à jour dès maintenant. Merci pour votre signalement."
    );

    await sendChangeDecisionMail({ ...BASE, locale: "fr", approved: false });
    msg = sent();
    expect(msg.subject).toBe("Votre demande de modification AA-D6D33B : refusée");
    expect(plain(msg.body.content)).toContain(
      "votre demande de modification concernant « Téléphone » a été refusée. Vous trouvez les détails de la décision dans le portail. Merci pour votre signalement."
    );
  });

  it("English and Italian subjects", () => {
    expect(DICTS.en.mail.changeSubject("AA-1", false)).toBe("Your change request AA-1: declined");
    expect(DICTS.it.mail.changeSubject("AA-1", true)).toBe("La Sua richiesta di modifica AA-1: accettata");
  });
});

describe("every portal mail", () => {
  const FOOTER = "HYPOTEQ AG · +41 44 554 41 00 · info@hypoteq.ch · www.hypoteq.ch";

  it("ends with HYPOTEQ's footer line, the same in all four languages", async () => {
    for (const locale of LOCALES) {
      expect(DICTS[locale].mail.footer).toBe(FOOTER);
      const base = { to: "a@partner.ch", name: "Anna", origin: "https://p", token: "tok", locale };
      await sendInviteMail({ ...base, company: null });
      await sendResetMail(base);
      await sendMagicLinkMail(base);
      await sendNotificationMail({ ...base, caseId: "1", kunde: K, caseNr: NR, mail: "offer" });
      await sendChangeDecisionMail({ ...base, nr: "AA-1", field: "name", approved: true });
    }
    expect(mockPost).toHaveBeenCalledTimes(5 * LOCALES.length);
    for (const [body] of mockPost.mock.calls as any[][]) {
      expect(body.message.body.content).toContain(FOOTER);
      expect(body.message.body.content).not.toContain("Winterthur");
      expect(body.message.body.content).not.toContain("text-transform:uppercase");
    }
  });

  it("is sent as «HYPOTEQ AG» over SMTP", async () => {
    process.env = { ...ENV, NODE_ENV: "production", SMTP_USER: "info@hypoteq.ch", SMTP_PASS: "secret" } as NodeJS.ProcessEnv;
    await sendMagicLinkMail({ to: "a@partner.ch", name: null, origin: "https://p", token: "tok", locale: "de" });
    expect(mockSmtpSend).toHaveBeenCalledWith(expect.objectContaining({ from: '"HYPOTEQ AG" <info@hypoteq.ch>' }));
  });
});
