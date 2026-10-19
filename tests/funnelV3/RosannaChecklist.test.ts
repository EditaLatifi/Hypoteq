/**
 * Handover 9 «Fehler aus Rosannas Test – Checkliste»: one test per mail / Salesforce item. Each
 * failed before (two customer mails, the old notification mail showing every field with «-»,
 * no Mietertrag or Eigenmittel in the v5 payload's mail, the Hypothek from the Objektwert …).
 * The funnel-screen items (Bauprojekt bei Ablösung, Nutzung der JP, Felder in Schritt 1/2) are
 * the funnel's; their Salesforce and mail side is tested here. The route-level count of mails
 * is in InquiryRouteMails.test.ts.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "partner", contactId: "003PARTNER", accountId: "001PARTNERCO" })),
}));

import { buildClosingMails, sendClosingMails, type ClosingMail, type MailTransport, type OutgoingMail } from "@/lib/funnel-v3/mail";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { EMPTY_AMOUNTS, EMPTY_EM, type FunnelState } from "@/lib/funnel-v3/types";
import { CASE_NO, RETURN_URL, ablState, jurState, kaufState, v5Payload } from "./v5Fixtures";

const log = { log() {}, warn() {}, error() {} };
const deps = { authorizationPdf: async () => new Uint8Array([1]), authorizationName: () => "AE.pdf", log };

async function mailsFor(state: FunnelState, opts: Parameters<typeof v5Payload>[1] = {}) {
  const data = v5Payload(state, opts);
  return buildClosingMails(
    {
      data,
      lang: data.locale,
      caseNumber: CASE_NO,
      date: new Date(Date.UTC(2026, 9, 15)),
      inquiryId: "inq",
      returnUrl: RETURN_URL,
      linkDays: 30,
      salesforce: { caseId: "500AA000001xyzQ", url: "https://x.lightning.force.com/lightning/r/Case/500AA000001xyzQ/view", failed: false, testMode: false, dropped: [] },
    },
    deps
  );
}
const rows = (m: ClosingMail) => m.summary.blocks.flatMap((b) => b.groups.flatMap((g) => g.rows));
const rowMap = (m: ClosingMail) => Object.fromEntries(rows(m).map((r) => [r.label, r.value]));
const of = (list: ClosingMail[], a: string) => list.find((m) => m.audience === a)!;

function fakeSalesforce() {
  const calls: { accounts: any[]; cases: any[]; contacts: any[] } = { accounts: [], cases: [], contacts: [] };
  let n = 0;
  return {
    calls,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async (d: any) => {
        calls.accounts.push(d);
        return { id: `001${++n}` };
      }),
      // A company: Business Account + Contact (HYPOTEQ 19.10. B16).
      findBusinessAccount: jest.fn(async () => null),
      createBusinessAccount: jest.fn(async (d: any) => {
        calls.accounts.push({ Name: d.name, Phone: d.phone });
        return { id: `001${++n}` };
      }),
      findContactOnAccount: jest.fn(async () => null),
      createContact: jest.fn(async (d: any) => {
        calls.contacts.push(d);
        return { id: "003SIGNER" };
      }),
      updatePersonAccount: jest.fn(async () => ({})),
      findContactByEmail: jest.fn(async () => null),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      createOrUpdateCase: jest.fn(async (d: any) => {
        calls.cases.push(d);
        return { id: "500CASE" };
      }),
    },
  };
}
async function caseOf(state: FunnelState) {
  const sf = fakeSalesforce();
  await syncFunnelStepsToSalesforce(v5Payload(state), sf.api);
  return { c: sf.calls.cases[0], accounts: sf.calls.accounts, contacts: sf.calls.contacts };
}

beforeEach(() => {
  delete process.env.HYPOTEQ_TEST_MODE;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("Rosanna: «Kunde erhält 2 Mails» → genau eine (7.1)", () => {
  it("per recipient exactly one mail; the customer's carries the missing documents and the signature step", async () => {
    const list = await mailsFor(ablState({ sig: { choice: "later", at: "x", method: "upload" } }), { missing: ["fotos"] });
    const sent: OutgoingMail[] = [];
    const transport: MailTransport = { kind: "graph", send: async (m) => void sent.push(m) };
    await sendClosingMails(list, transport, log);
    const count: Record<string, number> = {};
    for (const m of sent) count[m.to] = (count[m.to] || 0) + 1;
    expect(count).toEqual({ "marco.beispiel@kunde.ch": 1, "bea.rater@partner.ch": 1, "info@hypoteq.ch": 1 });
    const kunde = of(list, "kunde");
    expect(kunde.summary.next).toEqual({ signature: true, missing: ["Fotos der Immobilie (innen und aussen)"] });
    expect(kunde.attachments).toHaveLength(1);
  });
});

describe("Rosanna: «Juristische Person: Nutzung Selbstbewohnt/Zweitwohnsitz» → nur Vermietet/Gewerbe (2)", () => {
  it("Gewerbe reaches Salesforce as «Für eigenes Geschäft» and the mail as «Gewerbe»", async () => {
    const s = jurState({ ans: { ...jurState().ans, nutz: "Gewerbe" } });
    expect((await caseOf(s)).c.Nutzung_der_Immobilie__c).toBe("Für eigenes Geschäft");
    expect(rowMap(of(await mailsFor(s), "kunde"))["Nutzung der Immobilie"]).toBe("Gewerbe");
  });
});

describe("Rosanna: «Mietertrag nicht eingebbar» → Feld bei Vermietet (2)", () => {
  it("the Netto-Mietertrag reaches Salesforce and every mail", async () => {
    const s = kaufState({ ans: { ...kaufState().ans, nutz: "Vermietet" }, fin: { ...kaufState().fin, miete: 42000 } });
    expect((await caseOf(s)).c.J_hrlicher_Netto_Mietertrag__c).toBe(42000);
    for (const m of await mailsFor(s)) expect(rowMap(m)["Jährlicher Netto-Mietertrag"]).toBe("CHF 42'000");
  });
});

describe("Rosanna: «Neubau-Art «Bereits erstellt» nicht wählbar» → «Neubau» = bereits erstellt, «Bauprojekt» separat", () => {
  it("Salesforce: Neubau → Bereits erstellt, Bauprojekt → Bauprojekt; the mail names the Neubau-Art at a Neubau only", async () => {
    const neubau = kaufState({ ans: { ...kaufState().ans, immo: "Neubau" } });
    const projekt = kaufState({ ans: { ...kaufState().ans, immo: "Bauprojekt" } });
    expect((await caseOf(neubau)).c).toMatchObject({ Art_der_Immobilie__c: "Neubau", If_Neubau__c: "Bereits erstellt" });
    expect((await caseOf(projekt)).c).toMatchObject({ Art_der_Immobilie__c: "Neubau", If_Neubau__c: "Bauprojekt" });
    expect(rowMap(of(await mailsFor(neubau), "kunde"))["Neubau-Art"]).toBe("Bereits erstellt");
    expect(rowMap(of(await mailsFor(projekt), "kunde"))).not.toHaveProperty("Neubau-Art");
    expect(rowMap(of(await mailsFor(projekt), "kunde"))["Art der Immobilie"]).toBe("Bauprojekt");
  });
});

describe("Rosanna: «Mail ohne Heizungsart, Angebote, Firma» → alle Antworten in der Mail (7.3)", () => {
  it("Heizungsart from the documents, the Angebote chip, the Firma — in the customer, Berater and internal mail", async () => {
    const s = jurState({ role: "berater", txt: { ...jurState().txt, bmail: "bea.rater@partner.ch" }, ans: { ...jurState().ans, angebote: "Ja" }, info: { heizung: "Fernwärme" } });
    const list = await mailsFor(s);
    expect(list.map((m) => m.audience)).toEqual(["kunde", "berater", "intern"]);
    for (const m of list) {
      expect(rowMap(m)).toMatchObject({
        Heizungsart: "Fernwärme",
        "Bestehende Finanzierungsangebote": "Ja",
        "Firmenname gemäss Handelsregister": "Immo Beispiel AG",
      });
    }
  });
});

describe("Rosanna: «Mail zeigt leere Felder (KN 2, Firma, Neubau-Art, Mietertrag)» → nur zutreffende (7.3)", () => {
  it("none of them for a natural person, existing property, self-occupied, one borrower", async () => {
    for (const m of await mailsFor(kaufState())) {
      const labels = rows(m).map((r) => r.label);
      expect(labels).not.toContain("Firmenname gemäss Handelsregister");
      expect(labels).not.toContain("Neubau-Art");
      expect(labels).not.toContain("Jährlicher Netto-Mietertrag");
      expect(m.summary.blocks.find((b) => b.id === "borrowers")!.groups.map((g) => g.title)).toEqual(["Kreditnehmer 1"]);
    }
  });

  it("no row of any mail is shown empty or as a dash", async () => {
    const states = [kaufState(), ablState(), jurState(), kaufState({ borrowers: [...kaufState().borrowers, { id: "b2", vor: "", nach: "", pkSe: "Nein" }] })];
    for (const s of states)
      for (const m of await mailsFor(s))
        for (const r of rows(m)) {
          expect(r.value.trim()).not.toBe("");
          expect(["-", "–", "CHF 0"]).not.toContain(r.value.trim());
        }
  });
});

describe("Rosanna: «JP: Name/Telefon leer» → Felder in Schritt 1 (2)", () => {
  it("the company's name, signatory and phone reach the mail and Salesforce", async () => {
    const s = jurState();
    const m = rowMap(of(await mailsFor(s), "intern"));
    expect(m).toMatchObject({ "Firmenname gemäss Handelsregister": "Immo Beispiel AG", "Zeichnungsberechtigte Person": "Petra Beispiel", Telefon: "044 555 66 77" });
    const { c, accounts, contacts } = await caseOf(s);
    // HYPOTEQ 19.10. B16: a Business Account for the company, the signatory as its Contact.
    expect(accounts[0]).toMatchObject({ Name: "Immo Beispiel AG", Phone: "044 555 66 77" });
    expect(contacts[0]).toMatchObject({ FirstName: "Petra", LastName: "Beispiel", Phone: "044 555 66 77" });
    expect(c.ContactId).toBe("003SIGNER");
  });
});

describe("Rosanna: «Hypothekarbedarf aus Objektwert» → aus Kaufpreis (5)", () => {
  it("Testfall: Kaufpreis 500'000, Objektwert 1'000'000, Einkommen 150'000 → 400'000 · 80 % · 19.6 % · möglich", async () => {
    const s = kaufState({ fin: { ...EMPTY_AMOUNTS, kaufpreis: 500000, val: 1000000, inc: 150000 } });
    expect((await caseOf(s)).c.Gesch_tzter_Hypothekenbedarf__c).toBe(400000);
    expect(rowMap(of(await mailsFor(s), "kunde"))).toMatchObject({
      Gesamtfinanzierung: "CHF 400'000",
      Belehnung: "80.0 %",
      Tragbarkeit: "19.6 %",
      Urteil: "Finanzierung möglich",
    });
  });
});

describe("Rosanna: «Eigenmittel nicht erfassbar» → Betragstabelle (2)", () => {
  it("each amount reaches its Salesforce field and the mail", async () => {
    const s = kaufState({ em: { ...EMPTY_EM, spar: 120000, s3a: 30000, pkVor: 40000, schenk: 15000 } });
    expect((await caseOf(s)).c).toMatchObject({ Bar__c: 120000, X3_Saeule__c: 30000, PK_Betrag__c: 40000, Schenkung_usw__c: 15000, Eigenmittel__c: 205000 });
    expect(rowMap(of(await mailsFor(s), "kunde"))).toMatchObject({
      "Ersparnisse / Bankguthaben": "CHF 120'000",
      "Säule 3a": "CHF 30'000",
      "PK-Vorbezug": "CHF 40'000",
      Schenkung: "CHF 15'000",
      "Eigenmittel total": "CHF 205'000 · 20.5 % · davon hart CHF 165'000",
    });
  });
});

describe("Rosanna: «Zivilstand, Geburtsdatum, Privatkredit, Schenkung, Solidarbürgschaft fehlen in der Mail» (3.1, 7)", () => {
  it("in the mail from the documents and the chips; Zivilstand and Geburtsdatum also on the Person Account", async () => {
    const s = kaufState({
      ans: { ...kaufState().ans, kredite: "Ja", buerge: "Ja" },
      em: { ...EMPTY_EM, schenk: 50000 },
      txt: { ...kaufState().txt, buergeName: "Hans Bürge" },
      info: { zivil: "verheiratet", geb: "04.01.1980" },
    });
    for (const m of await mailsFor(s)) {
      expect(rowMap(m)).toMatchObject({
        Zivilstand: "verheiratet",
        Geburtsdatum: "04.01.1980",
        Privatkredit: "Ja",
        Schenkung: "CHF 50'000",
        Solidarbürgschaft: "Hans Bürge",
      });
    }
    expect((await caseOf(s)).accounts[0]).toMatchObject({ Zivilstand__c: "Verheiratet", Geburtsdatum__c: "1980-01-04" });
  });
});
