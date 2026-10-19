/**
 * The v5 closing mails (Handover 7.1–7.3): one mail per recipient, the blocks that apply and only
 * those, the «aus Dokument» marks for Berater and intern only, the subject, the languages, the
 * Auskunftsermächtigung attached while pending, the Salesforce link. Nothing is sent: the
 * transport is a fake, the PDF builder is injected.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import {
  buildCaseSummary,
  buildClosingMails,
  closingSubject,
  internalMailTo,
  isV5Payload,
  sendClosingMails,
  type ClosingMail,
  type ClosingMailsInput,
  type MailTransport,
  type OutgoingMail,
} from "@/lib/funnel-v3/mail";
import { MAIL_TEXTS } from "@/lib/funnel-v3/mail/texts";
import { authorizationDataFromState } from "@/lib/funnel-v3/authorizationData";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { SIGNATURE_BANK_NOTE_DE } from "@/lib/funnel-v3/signature";
import { translate } from "@/lib/funnel-v3/i18n";
import { EMPTY_AMOUNTS, EMPTY_EM, type FunnelState } from "@/lib/funnel-v3/types";
import { CASE_NO, RETURN_URL, ablState, jurState, kaufState, v5Payload } from "./v5Fixtures";

const PDF = new Uint8Array([37, 80, 68, 70, 45]);

function input(data: any, over: Partial<ClosingMailsInput> = {}): ClosingMailsInput {
  return {
    data,
    lang: data.locale ?? "de",
    caseNumber: CASE_NO,
    date: new Date(Date.UTC(2026, 9, 15, 10, 0)),
    inquiryId: "inq-1",
    returnUrl: RETURN_URL,
    linkDays: 30,
    salesforce: { caseId: "500AA000001xyzQ", url: "https://org.lightning.force.com/lightning/r/Case/500AA000001xyzQ/view", failed: false, testMode: false, dropped: [] },
    ...over,
  };
}

const deps = {
  authorizationPdf: jest.fn(async () => PDF),
  authorizationName: () => `${CASE_NO}_Auskunftsermaechtigung.pdf`,
  log: { log: () => {}, warn: () => {}, error: () => {} },
};

const mails = (data: any, over: Partial<ClosingMailsInput> = {}, d: any = deps) => buildClosingMails(input(data, over), d);
const of = (list: ClosingMail[], audience: string) => list.find((m) => m.audience === audience)!;
/** The visible text of a mail (tags stripped). */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  delete process.env.HYPOTEQ_TEST_MODE;
  delete process.env.HYPOTEQ_TEST_MAIL_TO;
  delete process.env.FUNNEL_INTERNAL_MAIL_TO;
  deps.authorizationPdf.mockClear();
});

describe("who gets which mail (Handover 7.1)", () => {
  it("Kunde entry: one mail to the customer, one to HYPOTEQ intern — no second customer mail", async () => {
    const list = await mails(v5Payload(kaufState()));
    expect(list.map((m) => [m.audience, m.to])).toEqual([
      ["kunde", "lea.muster@kunde.ch"],
      ["intern", "info@hypoteq.ch"],
    ]);
    expect(list.filter((m) => m.to === "lea.muster@kunde.ch")).toHaveLength(1);
  });

  it("Berater entry: customer, Berater and intern each get their own mail", async () => {
    const list = await mails(v5Payload(ablState()));
    expect(list.map((m) => [m.audience, m.to])).toEqual([
      ["kunde", "marco.beispiel@kunde.ch"],
      ["berater", "bea.rater@partner.ch"],
      ["intern", "info@hypoteq.ch"],
    ]);
    for (const addr of ["marco.beispiel@kunde.ch", "bea.rater@partner.ch", "info@hypoteq.ch"]) expect(list.filter((m) => m.to === addr)).toHaveLength(1);
  });

  it("the Berater typed their own address as the customer's: that address gets one mail", async () => {
    const s = ablState();
    const list = await mails(v5Payload({ ...s, txt: { ...s.txt, mail: "Bea.Rater@partner.ch" } }));
    expect(list.map((m) => m.audience)).toEqual(["kunde", "intern"]);
  });

  it("the internal address can be overridden (FUNNEL_INTERNAL_MAIL_TO)", async () => {
    process.env.FUNNEL_INTERNAL_MAIL_TO = "queue@hypoteq.ch";
    expect(internalMailTo()).toBe("queue@hypoteq.ch");
    const list = await mails(v5Payload(kaufState()));
    expect(of(list, "intern").to).toBe("queue@hypoteq.ch");
  });

  it("the internal mail answers to the customer", async () => {
    const list = await mails(v5Payload(kaufState()));
    expect(of(list, "intern").replyTo).toEqual({ address: "lea.muster@kunde.ch", name: "Lea Muster" });
    expect(of(list, "kunde").replyTo).toBeNull();
  });

  it("pre-v5 payloads are not v5: the route keeps their mails", async () => {
    expect(isV5Payload(v5Payload(kaufState()))).toBe(true);
    expect(isV5Payload({ client: { email: "x@y.ch" } })).toBe(false);
    const v3 = v5Payload(kaufState());
    v3.v3.version = 1;
    expect(isV5Payload(v3)).toBe(false);
    expect(await buildClosingMails(input({ client: { email: "x@y.ch" } }), deps)).toEqual([]);
  });
});

describe("subject (Handover 7.2)", () => {
  it("customer: «Deine Finanzierungsanfrage HQ-… – Name, PLZ Ort», localised", async () => {
    const list = await mails(v5Payload(kaufState()));
    expect(of(list, "kunde").subject).toBe("Deine Finanzierungsanfrage HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(closingSubject("kunde", "fr", CASE_NO, "Lea Muster", "8001 Zürich")).toBe("Votre demande de financement HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(closingSubject("kunde", "it", CASE_NO, "Lea Muster", "8001 Zürich")).toBe("La Sua richiesta di finanziamento HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(closingSubject("kunde", "en", CASE_NO, "Lea Muster", "8001 Zürich")).toBe("Your financing request HQ-26-10-123456 – Lea Muster, 8001 Zürich");
  });

  it("Berater: the customer's name, neutral; intern: «Neue …»; a company: the Firma", async () => {
    const list = await mails(v5Payload(ablState()));
    expect(of(list, "berater").subject).toBe("Finanzierungsanfrage HQ-26-10-123456 – Marco Beispiel, 3000 Bern");
    expect(of(list, "intern").subject).toBe("Neue Finanzierungsanfrage HQ-26-10-123456 – Marco Beispiel, 3000 Bern");
    const jur = await mails(v5Payload(jurState()));
    expect(of(jur, "kunde").subject).toBe("Deine Finanzierungsanfrage HQ-26-10-123456 – Immo Beispiel AG, 8400 Winterthur");
  });

  it("no case number, no place: left out, no gaps", () => {
    expect(closingSubject("kunde", "de", null, "Lea Muster", "")).toBe("Deine Finanzierungsanfrage – Lea Muster");
    expect(closingSubject("berater", "de", null, "", "")).toBe("Finanzierungsanfrage");
  });
});

describe("block 2 · next step", () => {
  it("signature pending: the customer mail starts with the signing block, the template attached, the upload link", async () => {
    const s = kaufState({ sig: { choice: "later", at: "2026-10-15T09:00:00.000Z", method: "upload" } });
    const list = await mails(v5Payload(s));
    const kunde = of(list, "kunde");
    expect(deps.authorizationPdf).toHaveBeenCalledTimes(1);
    // authorizationDataFromState (the signature branch) over the payload's `v3`.
    const auth = (deps.authorizationPdf.mock.calls[0] as any)[0];
    expect(auth).toEqual(authorizationDataFromState(normaliseFunnelState(v5Payload(s).v3)!, "de", { caseNumber: CASE_NO }));
    expect(auth).toMatchObject({ lang: "de", caseNumber: CASE_NO, zweck: "Neue Hypothek", objekt: "8001 Zürich", firma: null });
    expect(auth.signers).toHaveLength(1);
    expect(auth.signers[0]).toMatchObject({ vor: "Lea", nach: "Muster", email: "lea.muster@kunde.ch" });
    expect(kunde.attachments).toEqual([{ name: `${CASE_NO}_Auskunftsermaechtigung.pdf`, contentType: "application/pdf", bytes: PDF }]);
    const html = kunde.html;
    const sign = html.indexOf(translate("de", "mail.next.sign"));
    expect(sign).toBeGreaterThan(0);
    // Zuoberst: before the result and every other block.
    expect(sign).toBeLessThan(html.indexOf(translate("de", "mail.section.result")));
    expect(html).toContain(`href="${RETURN_URL}"`);
    expect(text(html)).toContain("Unterzeichnet hochladen");
    expect(text(html)).toContain(`Im Anhang: ${CASE_NO}_Auskunftsermaechtigung.pdf`);
    // Only the customer mail carries the template.
    expect(of(list, "intern").attachments).toEqual([]);
    // signature.ts's note (SIGNATURE_BANK_NOTE_DE), the same sentence as in the Case JSON.
    expect(text(of(list, "intern").html)).toContain(SIGNATURE_BANK_NOTE_DE);
    expect(of(list, "intern").summary.signature).toMatchObject({ status: "pending", note: SIGNATURE_BANK_NOTE_DE });
  });

  it("company: the signatory signs the template", async () => {
    const s = jurState({ sig: { choice: "later", at: "2026-10-15T09:00:00.000Z", method: "upload" } });
    await mails(v5Payload(s));
    const auth = (deps.authorizationPdf.mock.calls[0] as any)[0];
    expect(auth).toMatchObject({ firma: "Immo Beispiel AG", zweck: "Neue Hypothek", objekt: "8400 Winterthur" });
    expect(auth.signers[0]).toMatchObject({ vor: "Petra", nach: "Beispiel" });
  });

  it("signature uploaded: no block, no attachment, no bank note", async () => {
    const list = await mails(v5Payload(kaufState()));
    expect(deps.authorizationPdf).not.toHaveBeenCalled();
    expect(of(list, "intern").summary.signature.status).toBe("uploaded");
    expect(of(list, "intern").summary.signature).not.toHaveProperty("note");
    expect(of(list, "intern").html).not.toContain(SIGNATURE_BANK_NOTE_DE);
    expect(of(list, "kunde").attachments).toEqual([]);
    expect(of(list, "kunde").html).not.toContain(translate("de", "mail.next.sign"));
  });

  it("an empty PDF (the stub) is never attached", async () => {
    const s = kaufState({ sig: { choice: "later", at: "2026-10-15T09:00:00.000Z", method: "upload" } });
    const warn = jest.fn();
    const list = await mails(v5Payload(s), {}, { ...deps, authorizationPdf: async () => new Uint8Array(), log: { log() {}, warn, error() {} } });
    expect(of(list, "kunde").attachments).toEqual([]);
    expect(of(list, "kunde").html).not.toContain("Im Anhang");
    expect(warn).toHaveBeenCalled();
  });

  it("missing documents: listed with the link back; none when complete", async () => {
    const list = await mails(v5Payload(kaufState(), { missing: ["fotos", "steuer"] }));
    const kunde = text(of(list, "kunde").html);
    expect(kunde).toContain("Diese Unterlagen fehlen noch:");
    expect(kunde).toContain(translate("de", "doc.fotos"));
    expect(kunde).toContain("Fehlende Unterlagen hochladen");
    expect(kunde).toContain("Der Link ist 30 Tage gültig");
    expect(of(list, "kunde").summary.next.missing).toHaveLength(2);
    const done = await mails(v5Payload(kaufState()));
    expect(text(of(done, "kunde").html)).not.toContain("Diese Unterlagen fehlen noch");
  });
});

describe("block 3–9 · only what applies (Handover 7.3)", () => {
  const rowsOf = (m: ClosingMail) => m.summary.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows.map((r) => `${r.label}: ${r.value}`)));

  it("result: Gesamtfinanzierung, Belehnung, Tragbarkeit, Urteil — Swiss format", async () => {
    const m = of(await mails(v5Payload(kaufState())), "kunde");
    expect(rowsOf(m)).toEqual(expect.arrayContaining(["Gesamtfinanzierung: CHF 800'000", "Belehnung: 80.0 %", "Urteil: Finanzierung möglich"]));
    expect(text(m.html)).toContain("CHF 1'000'000");
  });

  it("natural person: no Firma, no Kreditnehmer 2 without capture, no Neubau-Art, no Mietertrag when self-occupied", async () => {
    const m = of(await mails(v5Payload(kaufState())), "intern");
    const t = text(m.html);
    expect(t).not.toContain("Firma");
    expect(t).not.toContain("Kreditnehmer 2");
    expect(t).not.toContain("Neubau-Art");
    expect(t).not.toContain("Netto-Mietertrag");
    expect(t).toContain("Kreditnehmer 1");
  });

  it("Kreditnehmer 2 appears once added, with the household income", async () => {
    const s = kaufState({
      borrowers: [
        { id: "b1", vor: "Lea", nach: "Muster", job: "Angestellt", pkSe: "Nein" },
        { id: "b2", vor: "Tom", nach: "Muster", pkSe: "Nein" },
      ],
      fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000, val: 1000000, inc: 120000, inc2: 80000 },
    });
    const rows = rowsOf(of(await mails(v5Payload(s)), "kunde"));
    expect(rows).toEqual(expect.arrayContaining(["Name: Tom Muster", "Bruttoeinkommen pro Jahr: CHF 80'000", "Bruttoeinkommen Haushalt: CHF 200'000"]));
  });

  it("Neubau: the Neubau-Art and the GB/GVZ answer; rented: the Netto-Mietertrag", async () => {
    const s = kaufState({ ans: { ...kaufState().ans, immo: "Neubau", nbDocs: "Ja", nutz: "Vermietet" }, fin: { ...EMPTY_AMOUNTS, kaufpreis: 900000, inc: 200000, miete: 36000 } });
    const rows = rowsOf(of(await mails(v5Payload(s)), "kunde"));
    expect(rows).toEqual(expect.arrayContaining(["Neubau-Art: Bereits erstellt", "Grundbuchauszug und GVZ-Police vorhanden: Ja", "Jährlicher Netto-Mietertrag: CHF 36'000"]));
  });

  it("company: Firma, UID, Sitz, zeichnungsberechtigte Person and contact; no Anrede, no Unterhalt", async () => {
    const s = jurState({ info: { uid: "CHE-123.456.789", sitz: "Winterthur" } });
    const m = of(await mails(v5Payload(s)), "intern");
    const rows = rowsOf(m);
    expect(rows).toEqual(
      expect.arrayContaining([
        "Firmenname gemäss Handelsregister: Immo Beispiel AG",
        "UID: CHE-123.456.789",
        "Sitz: Winterthur",
        "Zeichnungsberechtigte Person: Petra Beispiel",
        "Telefon: 044 555 66 77",
        "Jährlicher Netto-Mietertrag: CHF 120'000",
      ])
    );
    expect(rows.some((r) => r.startsWith("Anrede"))).toBe(false);
    expect(rows.some((r) => r.startsWith("Tragbarkeit"))).toBe(false);
  });

  it("Eigenmittel: only the entered rows, the total with % and hard part; PK-Verpfändung marked as security", async () => {
    const s = kaufState({ em: { ...EMPTY_EM, spar: 150000, pkVor: 50000, pkVerp: 30000, schenk: 20000, erbe: 10000 } });
    const m = of(await mails(v5Payload(s)), "kunde");
    const rows = rowsOf(m);
    expect(rows).toEqual(
      expect.arrayContaining([
        "Ersparnisse / Bankguthaben: CHF 150'000",
        "PK-Vorbezug: CHF 50'000",
        "PK-Verpfändung: CHF 30'000",
        "Schenkung: CHF 20'000",
        "Erbvorbezug: CHF 10'000",
        "Eigenmittel total: CHF 230'000 · 23.0 % · davon hart CHF 180'000",
      ])
    );
    expect(rows.some((r) => r.startsWith("Säule 3a") || r.startsWith("Darlehen"))).toBe(false);
    expect(text(m.html)).toContain("Sicherheit, zählt nicht zu den Eigenmitteln");
  });

  it("Ablösung: Bank, Hypothek, Zins, Ablösedatum from the Zinsabrechnung, Erhöhung + Zweck, Vorsorge", async () => {
    const s = ablState({ info: { bank: "Musterbank", zins: "SARON 0.80 %", abl: "31.03.2028" }, em: { ...EMPTY_EM, s3a: 25000 } });
    const rows = rowsOf(of(await mails(v5Payload(s)), "berater"));
    expect(rows).toEqual(
      expect.arrayContaining([
        "Bestehende Bank: Musterbank",
        "Bestehende Hypothek: CHF 400'000",
        "Zins: SARON 0.80 %",
        "Ablösedatum: 31.03.2028",
        "Gewünschte Erhöhung: CHF 100'000",
        "Verwendungszweck der Erhöhung: Renovation Küche",
        "Säule 3a: CHF 25'000",
        "Gesamtfinanzierung: CHF 500'000",
      ])
    );
    expect(rows.some((r) => r.startsWith("Kaufpreis"))).toBe(false);
  });

  it("chips: only the tapped ones, with the Solidarbürge's name and what their documents say", async () => {
    const s = kaufState({
      ans: { ...kaufState().ans, kredite: "Ja", buerge: "Ja", angebote: "Ja", steuer: "Ja" },
      txt: { ...kaufState().txt, buergeName: "Hans Bürge", kommentar: "Bitte rasch" },
      info: { kreditRest: "CHF 24'000" },
    });
    const rows = rowsOf(of(await mails(v5Payload(s)), "kunde"));
    expect(rows).toEqual(
      expect.arrayContaining([
        "Privatkredit: Ja",
        "Privatkredit · Restschuld: CHF 24'000",
        "Solidarbürgschaft: Hans Bürge",
        "Bestehende Finanzierungsangebote: Ja",
        "Interesse an Steueroptimierung: Ja",
        "Gewünschte Laufzeit: 10 Jahre",
        "Kommentar: Bitte rasch",
      ])
    );
    expect(rows.some((r) => r.startsWith("Leasing") || r.startsWith("Unterhaltszahlungen"))).toBe(false);
  });

  it("values read from the documents appear (Heizungsart, Zivilstand, Geburtsdatum …)", async () => {
    const s = kaufState({ info: { geb: "04.01.1980", nat: "Schweiz", zivil: "verheiratet", ag: "Muster AG", heizung: "Wärmepumpe", baujahr: "1995" } });
    const rows = rowsOf(of(await mails(v5Payload(s)), "kunde"));
    expect(rows).toEqual(
      expect.arrayContaining(["Geburtsdatum: 04.01.1980", "Nationalität: Schweiz", "Zivilstand: verheiratet", "Arbeitgeber: Muster AG", "Heizungsart: Wärmepumpe", "Baujahr: 1995"])
    );
  });

  it("documents: fulfilled / total and every requirement with its state", async () => {
    const m = of(await mails(v5Payload(kaufState(), { missing: ["fotos"] })), "kunde");
    expect(m.summary.docs.line).toBe(`${m.summary.docs.fulfilled} von ${m.summary.docs.total} Anforderungen erfüllt`);
    const fotos = m.summary.docs.groups.flatMap((g) => g.lines).find((l) => l.label === translate("de", "doc.fotos"))!;
    expect(fotos).toMatchObject({ state: "missing", stateLabel: "Fehlt", warn: true });
    expect(text(m.html)).toContain(translate("de", "doc.vollmacht"));
  });
});

describe("«aus Dokument» (Handover 7.3)", () => {
  const s = kaufState({
    info: { zivil: "ledig" },
    src: { "fin.inc": { doc: "Lohnausweis 2025", unsure: false }, "ans.nutz": { doc: "Steuererklärung 2025", unsure: true } },
  });

  it("marked in the Berater and the internal mail, with the document", async () => {
    const list = await mails(v5Payload({ ...s, role: "berater", txt: { ...s.txt, bmail: "bea.rater@partner.ch" } }));
    for (const who of ["berater", "intern"]) {
      const t = text(of(list, who).html);
      expect(t).toContain("aus Dokument · Lohnausweis 2025");
      expect(t).toContain("aus Dokument · bitte prüfen · Steuererklärung 2025");
      const zivil = of(list, who).summary.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows)).find((r) => r.label === "Zivilstand")!;
      expect(zivil.fromDoc).toEqual({ doc: null, unsure: false });
    }
  });

  it("not marked in the customer mail — the value is there all the same", async () => {
    const m = of(await mails(v5Payload(s)), "kunde");
    expect(text(m.html)).not.toContain("aus Dokument");
    expect(m.summary.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows)).some((r) => r.fromDoc)).toBe(false);
    expect(text(m.html)).toContain("Zivilstand ledig");
  });
});

describe("internal mail: the Case (Handover 7.1)", () => {
  it("links the Case in Lightning, the folder and the dossier", async () => {
    const t = of(await mails(v5Payload(kaufState())), "intern").html;
    expect(t).toContain('href="https://org.lightning.force.com/lightning/r/Case/500AA000001xyzQ/view"');
    expect(t).toContain("Case in Salesforce öffnen");
    expect(t).toContain('href="https://sp.example/case"');
    expect(t).toContain('href="https://sp.example/case/dossier.pdf"');
  });

  it("sync failed: says so instead of a link", async () => {
    const m = of(await mails(v5Payload(kaufState()), { salesforce: { caseId: null, url: null, failed: true, testMode: false, dropped: [] } }), "intern");
    expect(text(m.html)).toContain("Salesforce-Sync fehlgeschlagen – der Case muss von Hand angelegt werden (Anfrage-ID inq-1).");
    expect(m.html).not.toContain("lightning");
  });

  it("test mode, dropped fields, a Case without instance URL", async () => {
    const test = of(await mails(v5Payload(kaufState()), { salesforce: { caseId: null, url: null, failed: false, testMode: true, dropped: [] } }), "intern");
    expect(text(test.html)).toContain("Testmodus – in Salesforce wurde kein Case angelegt.");
    const dropped = of(await mails(v5Payload(kaufState()), { salesforce: { caseId: "500AA000001xyzQ", url: null, failed: false, testMode: false, dropped: ["Waermeerzeugung__c"] } }), "intern");
    expect(text(dropped.html)).toContain("Case angelegt (ID 500AA000001xyzQ).");
    expect(text(dropped.html)).toContain("Von Salesforce nicht übernommen (von Hand nachtragen): Waermeerzeugung__c");
  });

  it("the customer and the Berater never see the Salesforce block", async () => {
    const list = await mails(v5Payload(ablState()));
    for (const who of ["kunde", "berater"]) expect(of(list, who).html).not.toContain("lightning");
  });
});

describe("language and address (Handover 7.3, DECISIONS D9)", () => {
  it("DE «du» for the customer, neutral for the Berater", async () => {
    const list = await mails(v5Payload(ablState({ sig: { choice: "later", at: "x", method: "upload" } })));
    expect(text(of(list, "kunde").html)).toContain("Hi Marco,");
    expect(text(of(list, "kunde").html)).toContain("hat deine Finanzierungsanfrage bei HYPOTEQ erfasst");
    const b = text(of(list, "berater").html);
    expect(b).not.toMatch(/\b(du|dein|deine|deinen|dir|dich)\b/i);
    expect(b).toContain("Die Finanzierungsanfrage für Marco Beispiel ist bei HYPOTEQ eingegangen.");
  });

  it("FR «vous», IT «Lei», EN — mail in the funnel language", async () => {
    const fr = await mails(v5Payload(kaufState({ sig: { choice: "later", at: "x", method: "upload" } }), { locale: "fr", missing: ["fotos"] }), { lang: "fr" });
    const frText = text(of(fr, "kunde").html) + JSON.stringify(MAIL_TEXTS.fr);
    expect(frText).not.toMatch(/\b(ta|ton|tes|tu|toi|salut)\b/i);
    expect(frText).toContain("Bonjour Lea,");
    expect(of(fr, "kunde").subject).toBe("Votre demande de financement HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(text(of(fr, "kunde").html)).toContain("Ces documents manquent encore");

    const it_ = await mails(v5Payload(kaufState({ sig: { choice: "later", at: "x", method: "upload" } }), { locale: "it" }), { lang: "it" });
    const itText = text(of(it_, "kunde").html) + JSON.stringify(MAIL_TEXTS.it);
    expect(itText).not.toMatch(/\b(tua|tuo|tuoi|tue|ti|ciao)\b/i);
    expect(itText).toContain("Buongiorno Lea,");
    expect(itText).toContain("La preghiamo");

    const en = await mails(v5Payload(kaufState(), { locale: "en" }), { lang: "en" });
    expect(of(en, "kunde").subject).toBe("Your financing request HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(text(of(en, "kunde").html)).toContain("Total financing");
  });

  it("escapes what was typed", async () => {
    const s = kaufState({ txt: { ...kaufState().txt, kommentar: "<script>x</script>" } });
    const m = of(await mails(v5Payload(s)), "kunde");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("sending: test mode, one transport call per mail, failures isolated", () => {
  const log = { log: () => {}, warn: () => {}, error: () => {} };
  function fakeTransport(failFor?: string) {
    const sent: OutgoingMail[] = [];
    const transport: MailTransport = {
      kind: "graph",
      async send(m) {
        if (failFor && m.to === failFor) throw new Error("boom");
        sent.push(m);
      },
    };
    return { sent, transport };
  }

  it("every mail goes out once, to one recipient, no copies", async () => {
    const list = await mails(v5Payload(ablState()));
    const { sent, transport } = fakeTransport();
    const res = await sendClosingMails(list, transport, log);
    expect(res.sent).toEqual(["kunde", "berater", "intern"]);
    expect(sent.map((m) => m.to)).toEqual(["marco.beispiel@kunde.ch", "bea.rater@partner.ch", "info@hypoteq.ch"]);
    expect(sent.every((m) => !(m as any).cc)).toBe(true);
  });

  it("test mode: «[TEST]» subjects, routed inbox, example addresses skipped", async () => {
    process.env.HYPOTEQ_TEST_MODE = "1";
    const list = await mails(v5Payload(kaufState()));
    const { sent, transport } = fakeTransport();
    await sendClosingMails(list, transport, log);
    expect(sent.map((m) => m.subject.startsWith("[TEST] "))).toEqual([true, true]);

    process.env.HYPOTEQ_TEST_MAIL_TO = "tests@hypoteq.ch";
    const routed = fakeTransport();
    await sendClosingMails(list, routed.transport, log);
    expect(routed.sent.map((m) => m.to)).toEqual(["tests@hypoteq.ch", "tests@hypoteq.ch"]);
    expect(routed.sent[0].subject).toBe("[TEST → lea.muster@kunde.ch] Deine Finanzierungsanfrage HQ-26-10-123456 – Lea Muster, 8001 Zürich");

    delete process.env.HYPOTEQ_TEST_MAIL_TO;
    const s = kaufState({ txt: { ...kaufState().txt, mail: "lea@example.ch" } });
    const example = fakeTransport();
    const res = await sendClosingMails(await mails(v5Payload(s)), example.transport, log);
    expect(res.skipped).toEqual(["kunde"]);
    expect(example.sent.map((m) => m.to)).toEqual(["info@hypoteq.ch"]);
  });

  it("a failing mail does not stop the others; no transport: nothing sent, nothing thrown", async () => {
    const list = await mails(v5Payload(ablState()));
    const { sent, transport } = fakeTransport("bea.rater@partner.ch");
    const res = await sendClosingMails(list, transport, log);
    expect(res).toEqual({ sent: ["kunde", "intern"], skipped: [], failed: ["berater"] });
    expect(sent).toHaveLength(2);
    expect(await sendClosingMails(list, null, log)).toEqual({ sent: [], skipped: ["kunde", "berater", "intern"], failed: [] });
  });
});

describe("buildCaseSummary is pure and audience-aware", () => {
  it("the entry shows for Berater / intern only", () => {
    const data = v5Payload(kaufState({ mode: "schnell" } as Partial<FunnelState>));
    const base = { data, lang: "de" as const, caseNumber: CASE_NO, date: new Date() };
    const rows = (a: "kunde" | "intern") => buildCaseSummary(base, a)!.blocks.find((b) => b.id === "request")!.groups[0].rows.map((r) => `${r.label}: ${r.value}`);
    expect(rows("intern")).toContain("Einstieg: Schnellanmeldung");
    expect(rows("kunde").some((r) => r.startsWith("Einstieg"))).toBe(false);
  });
});
