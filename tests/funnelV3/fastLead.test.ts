/**
 * Partner Fast Lead in the funnel (DECISIONS P39): the customer's link `?lead=<token>`, the prefill,
 * the token in the submit, the Case credited to the inviting partner, and the closing mails.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({ __esModule: true, resolvePartner: jest.fn() }));

import { resolvePartner } from "@/components/partnerDirectory";
import { applyLeadPartnerToCase, fastLeadNote, syncFunnelStepsToSalesforce, NEW_PARTNER_NOTE } from "@/components/syncFunnelStepsToSalesforce";
import { entryFromParams, normaliseLeadAnswer, roleLine } from "@/components/funnel-v3/logic";
import { buildClosingMails, type ClosingMail, type ClosingMailsInput } from "@/lib/funnel-v3/mail";
import { beraterEmailOf, leadPartnerOf } from "@/lib/funnel-v3/mail/summary";
import { createFunnelV3Store } from "@/lib/funnel-v3/store";
import { buildSubmitPayload } from "@/lib/funnel-v3/submit";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { translate } from "@/lib/funnel-v3/i18n";
import { EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import { CASE_NO, RETURN_URL, SUBMISSION, ablState, kaufState, v5Payload } from "./v5Fixtures";

const resolve = resolvePartner as unknown as jest.Mock<(...a: any[]) => Promise<any>>;
const TOKEN = "L".repeat(43);

const PARTNER_LEAD = {
  leadId: "lead-1",
  email: "anna@muster.ch",
  name: "Anna Muster",
  company: "Muster AG",
  phone: "+41 44 000 00 00",
  contactId: "003PARTNERAAAAAAAA",
  accountId: "001PARTNERAAAAAAAA",
  invitedAt: "2026-11-23T09:00:00.000Z",
};

beforeEach(() => {
  resolve.mockReset();
});

describe("the link", () => {
  it("reads ?lead= as the customer's own request; a malformed token is ignored", () => {
    expect(entryFromParams(`?lead=${TOKEN}`)).toEqual({ role: "kunde", bmail: "", fromPortal: false, lead: TOKEN });
    expect(entryFromParams("?lead=abc")).toEqual({ role: null, bmail: "", fromPortal: false, lead: "" });
    // An explicit Berater link keeps the Berater entry.
    expect(entryFromParams(`?customer=partner&lead=${TOKEN}`).role).toBe("berater");
  });

  it("takes an answer that opens, anything else is the customer's own request", () => {
    const ok = {
      status: "ok",
      locale: "de",
      customer: { anrede: "Frau", firstName: "Lea", lastName: "Beispiel", email: "lea@kunde.ch", phone: "079 111 22 33" },
      partner: { name: "Anna Muster", company: "Muster AG", initials: "AM" },
    };
    expect(normaliseLeadAnswer(ok)).toEqual({
      lead: { partnerName: "Anna Muster", partnerCompany: "Muster AG" },
      customer: { anrede: "Frau", firstName: "Lea", lastName: "Beispiel", email: "lea@kunde.ch", phone: "079 111 22 33" },
    });
    expect(normaliseLeadAnswer({ status: "used" })).toBeNull();
    expect(normaliseLeadAnswer({ status: "ok", customer: {}, partner: { name: "" } })).toBeNull();
    expect(normaliseLeadAnswer(null)).toBeNull();
    expect(normaliseLeadAnswer({ ...ok, customer: { ...ok.customer, email: "nope", anrede: "Dr." } })?.customer).toMatchObject({ email: "", anrede: null });
  });

  it("the sidebar says who invited the customer", () => {
    const t = (key: string, p?: any) => translate("de", key, p);
    const lead = { token: TOKEN, partnerName: "Anna Muster", partnerCompany: "Muster AG" };
    expect(roleLine("kunde", { ...EMPTY_TEXTS }, null, t, lead)).toBe("Eingeladen von Anna Muster · Muster AG");
    expect(roleLine("kunde", { ...EMPTY_TEXTS }, null, t, null)).toBe("Eigene Anfrage");
  });
});

describe("applyLead (store)", () => {
  const lead = { token: TOKEN, partnerName: "Anna Muster", partnerCompany: "Muster AG" };
  const customer = { anrede: "Frau" as const, firstName: "Lea", lastName: "Beispiel", email: "lea@kunde.ch", phone: "079 111 22 33" };

  it("makes it the customer's own request and fills the empty contact fields, not marked touched", () => {
    const store = createFunnelV3Store();
    store.getState().applyLead(lead, customer);
    const s = store.getState();
    expect(s.lead).toEqual(lead);
    expect(s.role).toBe("kunde");
    expect(s.txt).toMatchObject({ vor: "Lea", nach: "Beispiel", mail: "lea@kunde.ch", tel: "079 111 22 33" });
    expect(s.ans.anrede).toBe("Frau");
    expect(s.touched).toEqual({});
  });

  it("Kreditnehmer 1 carries the name too: the Personen screen does not wipe it (E2E 23.11.2026)", () => {
    const store = createFunnelV3Store();
    store.getState().applyLead(lead, customer);
    expect(store.getState().borrowers[0]).toMatchObject({ vor: "Lea", nach: "Beispiel" });
    // «Angestellt» on the Personen screen writes borrower 1 back to the contact.
    store.getState().updateBorrower(store.getState().borrowers[0].id, { job: "Angestellt" });
    expect(store.getState().txt).toMatchObject({ vor: "Lea", nach: "Beispiel" });
  });

  it("never overwrites what the customer typed, and the same invitation again changes nothing", () => {
    const store = createFunnelV3Store();
    store.getState().setTxt("mail", "lea.privat@kunde.ch");
    store.getState().applyLead(lead, customer);
    expect(store.getState().txt.mail).toBe("lea.privat@kunde.ch");
    store.getState().setTxt("tel", "");
    store.getState().applyLead(lead, customer);
    expect(store.getState().txt.tel).toBe("");
  });

  it("a new request (reset) forgets the invitation", () => {
    const store = createFunnelV3Store();
    store.getState().applyLead(lead, customer);
    store.getState().reset();
    expect(store.getState().lead).toBeNull();
  });
});

describe("the submit carries the token, never the partner", () => {
  it("adds lead.token to a customer's request", () => {
    const p: any = buildSubmitPayload({ ...kaufState(), submissionId: SUBMISSION, sharepointFolderId: null, files: [], lead: { token: TOKEN } } as any, "de");
    expect(p.lead).toEqual({ token: TOKEN });
    expect(p.customerType).toBe("direct");
    expect(p.partnerLead).toBeUndefined();
  });

  it("not with the Berater entry, not without an invitation", () => {
    expect((toInquiryPayload(ablState(), { locale: "de", submissionId: SUBMISSION, leadToken: TOKEN }) as any).lead).toBeUndefined();
    expect((toInquiryPayload(kaufState(), { locale: "de", submissionId: SUBMISSION }) as any).lead).toBeUndefined();
  });
});

describe("Salesforce: the Case is the inviting partner's", () => {
  function fakeApi() {
    const api: any = {
      cases: [] as any[],
      findAccountByEmail: jest.fn(async () => null),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQAAAAAAAA" })),
      createAccount: jest.fn(async () => ({ id: "001CUSTOMERAAAAAAA", success: true })),
      createPersonAccount: jest.fn(async () => ({ id: "001CUSTOMERAAAAAAA", success: true })),
      updatePersonAccount: jest.fn(async () => ({ success: true })),
      findContactByEmail: jest.fn(async () => null),
      createContact: jest.fn(async () => ({ id: "003X", success: true })),
      createOrUpdateCase: jest.fn(async (fields: any) => {
        api.cases.push(fields);
        return { id: "500CASEAAAAAAAAAAA", success: true };
      }),
    };
    return api;
  }
  const directPayload = (extra: Record<string, any> = {}) => ({
    customerType: "direct",
    client: { email: "lea@kunde.ch", phone: "0791112233", firstName: "Lea", lastName: "Beispiel" },
    project: { projektArt: "kauf" },
    property: {
      zip: "8001",
      ort: "Zürich",
      kreditnehmer: [{ vorname: "Lea", name: "Beispiel", email: "lea@kunde.ch", telefon: "0791112233" }],
    },
    financing: { kaufpreis: "1000000" },
    ...extra,
  });

  it("Kundenberater and Sales Partner from the invitation, a note in Comments, no lookup, not HYPOTEQ AG", async () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    const api = fakeApi();
    await syncFunnelStepsToSalesforce(directPayload({ partnerLead: PARTNER_LEAD }), api);
    const c = api.cases[0];
    expect(c.Partner_Consultant__c).toBe("003PARTNERAAAAAAAA");
    expect(c.Account__c).toBe("001PARTNERAAAAAAAA");
    expect(String(c.Comments)).toContain("Partner Fast Lead – eingeladen von Anna Muster (Muster AG) am 23.11.2026");
    expect(resolve).not.toHaveBeenCalled();
    expect(api.findAccountByName).not.toHaveBeenCalled();
    // The customer is the Case's client, as in any own request.
    expect(c.Client__c).toBe("001CUSTOMERAAAAAAA");
  });

  it("the customer is still validated in full — a partner on the Case does not make the contact optional", async () => {
    const api = fakeApi();
    await expect(
      syncFunnelStepsToSalesforce(
        directPayload({ partnerLead: PARTNER_LEAD, client: { email: "" }, property: { zip: "8001", kreditnehmer: [{ vorname: "Lea", name: "Beispiel", email: "", telefon: "" }] } }),
        api,
      ),
    ).rejects.toThrow(/Validation failed/);
  });

  it("a Berater submission keeps its own partner; without partnerLead it stays HYPOTEQ AG", async () => {
    resolve.mockResolvedValueOnce({ status: "unknown" });
    const berater = fakeApi();
    await syncFunnelStepsToSalesforce(
      { ...directPayload(), customerType: "partner", client: { email: "neu@makler.ch" }, partner: { email: "neu@makler.ch" }, partnerLead: PARTNER_LEAD },
      berater,
    );
    expect(berater.cases[0].Partner_Consultant__c).toBeUndefined();
    expect(String(berater.cases[0].Comments).startsWith(NEW_PARTNER_NOTE)).toBe(true);

    const own = fakeApi();
    await syncFunnelStepsToSalesforce(directPayload(), own);
    expect(own.cases[0].Account__c).toBe("001HYPOTEQAAAAAAAA");
    expect(own.cases[0].Partner_Consultant__c).toBeUndefined();
  });

  it("applyLeadPartnerToCase puts the note before the customer's comment", () => {
    const caseData: Record<string, any> = { Comments: "Kundenkommentar" };
    applyLeadPartnerToCase(caseData, PARTNER_LEAD);
    expect(caseData.Comments).toBe(`${fastLeadNote(PARTNER_LEAD)}\n\nKundenkommentar`);
    expect(fastLeadNote({ email: "anna@muster.ch" })).toBe("Partner Fast Lead – eingeladen von anna@muster.ch; die Angaben hat der Kunde selbst erfasst.");
  });
});

describe("closing mails of a Partner Fast Lead", () => {
  const deps = {
    authorizationPdf: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
    authorizationName: () => `${CASE_NO}_Auskunftsermaechtigung.pdf`,
    log: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const input = (data: any): ClosingMailsInput => ({
    data,
    lang: "de",
    caseNumber: CASE_NO,
    date: new Date(Date.UTC(2026, 10, 23, 10, 0)),
    inquiryId: "inq-1",
    returnUrl: RETURN_URL,
    linkDays: 30,
    salesforce: { caseId: null, url: null, failed: false, testMode: false, dropped: [] },
  });
  const of = (list: ClosingMail[], audience: string) => list.find((m) => m.audience === audience);
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  const leadData = () => ({ ...v5Payload(kaufState()), partnerLead: PARTNER_LEAD });

  it("the partner gets the neutral summary; the customer reads who invited them and their advisor", async () => {
    const list = await buildClosingMails(input(leadData()), deps);
    expect(list.map((m) => m.audience)).toEqual(["kunde", "berater", "intern"]);
    const k = text(of(list, "kunde")!.html);
    expect(k).toContain("Eingeladen von Anna Muster · Muster AG");
    expect(k).toMatch(/Dein Berater Anna Muster Muster AG anna@muster\.ch/);
    const b = of(list, "berater")!;
    expect(b.to).toBe("anna@muster.ch");
    expect(text(b.html)).toContain("Guten Tag Anna Muster");
    expect(text(b.html)).toContain("Die Bestätigung mit der Zusammenfassung ging an lea.muster@kunde.ch.");
    expect(text(of(list, "intern")!.html)).toContain("vom Kunden selbst erfasst, Partner-Einladung von Anna Muster, Muster AG");
  });

  it("a customer's own request without an invitation has no partner mail", async () => {
    const list = await buildClosingMails(input(v5Payload(kaufState())), deps);
    expect(of(list, "berater")).toBeUndefined();
    expect(text(of(list, "kunde")!.html)).toContain("Eigene Anfrage");
  });

  it("reads the partner only from the server's partnerLead, never with the Berater entry", () => {
    expect(beraterEmailOf(leadData())).toBe("anna@muster.ch");
    expect(leadPartnerOf({ ...v5Payload(ablState()), partnerLead: PARTNER_LEAD })).toBeNull();
    expect(beraterEmailOf({ ...v5Payload(ablState()), partnerLead: PARTNER_LEAD })).toBe("bea.rater@partner.ch");
    expect(leadPartnerOf({ ...leadData(), partnerLead: { email: "nope" } })).toBeNull();
  });
});
