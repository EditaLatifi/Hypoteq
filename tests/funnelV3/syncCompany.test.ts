/**
 * HYPOTEQ 19.10. B16: a juristische Person becomes a Business Account (Name = Firma, UID and Sitz
 * from the Handelsregisterauszug) with its zeichnungsberechtigte Person as a Contact — reused,
 * never duplicated (DECISIONS V63). Natural persons keep their Person Account. The Salesforce API
 * is a fake — nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "unknown" })),
}));

import { syncCompanyAccount, syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { jurState, kaufState, v5Payload } from "./v5Fixtures";

type Existing = { Id: string; matchedBy: "uid" | "name" } | null;

function fakeSalesforce(opts: { existing?: Existing; contactOnAccount?: { Id: string } | null; contactFails?: boolean } = {}) {
  const calls = { persons: [] as any[], companies: [] as any[], contacts: [] as any[], lookups: [] as any[], contactLookups: [] as any[], cases: [] as any[] };
  const api = {
    findAccountByEmail: jest.fn(async () => null),
    createAccount: jest.fn(async (d: any) => {
      calls.persons.push(d);
      return { id: "001PERSON" };
    }),
    updatePersonAccount: jest.fn(async () => ({})),
    findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
    findBusinessAccount: jest.fn(async (q: any) => {
      calls.lookups.push(q);
      return opts.existing ?? null;
    }),
    createBusinessAccount: jest.fn(async (company: any) => {
      calls.companies.push(company);
      return { id: "001NEWCOMPANY" };
    }),
    findContactOnAccount: jest.fn(async (accountId: string, person: any) => {
      calls.contactLookups.push({ accountId, ...person });
      return opts.contactOnAccount ?? null;
    }),
    createContact: jest.fn(async (d: any) => {
      if (opts.contactFails) throw Object.assign(new Error("FIELD_CUSTOM_VALIDATION_EXCEPTION"), { errorCode: "FIELD_CUSTOM_VALIDATION_EXCEPTION" });
      calls.contacts.push(d);
      return { id: "003NEWCONTACT" };
    }),
    createOrUpdateCase: jest.fn(async (d: any) => {
      calls.cases.push(d);
      return { id: "500CASE" };
    }),
  };
  return { calls, api };
}

/** Immo Beispiel AG, Petra Beispiel; the Handelsregisterauszug read UID and Sitz. */
const company = () => jurState({ info: { uid: "CHE-123.456.789", sitz: "Winterthur" } });

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("a new company", () => {
  it("creates a Business Account with UID and Sitz and the signatory as its Contact; the Case points to both", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v5Payload(company()), sf.api);
    expect(sf.calls.lookups).toEqual([{ uid: "CHE-123.456.789", name: "Immo Beispiel AG" }]);
    expect(sf.calls.companies).toEqual([{ name: "Immo Beispiel AG", phone: "044 555 66 77", uid: "CHE-123.456.789", sitz: "Winterthur", street: null }]);
    // A new Account has no Contacts to look through.
    expect(sf.api.findContactOnAccount).not.toHaveBeenCalled();
    expect(sf.calls.contacts).toEqual([{ AccountId: "001NEWCOMPANY", FirstName: "Petra", LastName: "Beispiel", Email: "info@immo-ag.ch", Phone: "044 555 66 77" }]);
    expect(sf.api.createAccount).not.toHaveBeenCalled();
    const c = sf.calls.cases[0];
    expect(c).toMatchObject({ AccountId: "001NEWCOMPANY", Client__c: "001NEWCOMPANY", ContactId: "003NEWCONTACT", Kreditnehmer__c: "Juristische Personen", Wie_viele_Kunden__c: "1" });
    expect(c.Client_2__c).toBeNull();
    expect(c.Kommentar__c ?? null).toBeNull();
  });
});

describe("an existing company is reused, never duplicated", () => {
  it("same UID: the Account is reused unchanged, the signatory added as a Contact there", async () => {
    const sf = fakeSalesforce({ existing: { Id: "001EXISTING", matchedBy: "uid" } });
    await syncFunnelStepsToSalesforce(v5Payload(company()), sf.api);
    expect(sf.api.createBusinessAccount).not.toHaveBeenCalled();
    expect(sf.calls.contactLookups).toEqual([{ accountId: "001EXISTING", email: "info@immo-ag.ch", firstName: "Petra", lastName: "Beispiel" }]);
    expect(sf.calls.contacts).toEqual([{ AccountId: "001EXISTING", FirstName: "Petra", LastName: "Beispiel", Email: "info@immo-ag.ch", Phone: "044 555 66 77" }]);
    expect(sf.calls.cases[0]).toMatchObject({ AccountId: "001EXISTING", Client__c: "001EXISTING", ContactId: "003NEWCONTACT" });
  });

  it("same Name (no UID read): reused as well", async () => {
    const sf = fakeSalesforce({ existing: { Id: "001SAMENAME", matchedBy: "name" } });
    await syncFunnelStepsToSalesforce(v5Payload(jurState()), sf.api);
    expect(sf.calls.lookups).toEqual([{ uid: null, name: "Immo Beispiel AG" }]);
    expect(sf.api.createBusinessAccount).not.toHaveBeenCalled();
    expect(sf.calls.cases[0]).toMatchObject({ AccountId: "001SAMENAME", Client__c: "001SAMENAME" });
  });

  it("the signatory already a Contact of that Account (same e-mail): no second Contact", async () => {
    const sf = fakeSalesforce({ existing: { Id: "001EXISTING", matchedBy: "name" }, contactOnAccount: { Id: "003EXISTING" } });
    await syncFunnelStepsToSalesforce(v5Payload(company()), sf.api);
    expect(sf.api.createContact).not.toHaveBeenCalled();
    expect(sf.calls.cases[0].ContactId).toBe("003EXISTING");
  });
});

describe("what does not stop the Case", () => {
  it("a Contact Salesforce refuses costs only the Contact", async () => {
    const sf = fakeSalesforce({ contactFails: true });
    const result = await syncFunnelStepsToSalesforce(v5Payload(company()), sf.api);
    expect(result.case).toEqual({ id: "500CASE" });
    expect(sf.calls.cases[0].AccountId).toBe("001NEWCOMPANY");
    expect(sf.calls.cases[0]).not.toHaveProperty("ContactId");
  });

  it("no signatory name: the Business Account without a Contact", async () => {
    const r = await syncCompanyAccount(fakeSalesforce().api, { lastName: "Muster AG", email: "a@b.ch" });
    expect(r).toEqual({ account: { id: "001NEWCOMPANY" }, contact: null });
  });
});

describe("other payloads", () => {
  it("the old funnel's company (Vorname / Name of the contact person) gets the same Business Account + Contact", async () => {
    const sf = fakeSalesforce();
    const p = {
      customerType: "direct",
      client: { email: "kontakt@firma.ch", phone: "044 000 00 00" },
      project: { projektArt: "kauf" },
      property: { zip: "8000", ort: "Zürich", kreditnehmer: [{ firmenname: "Firma GmbH", vorname: "Karl", name: "Kontakt", email: "kontakt@firma.ch", telefon: "044 000 00 00", adresse: "Seestrasse 1" }] },
      financing: { kaufpreis: "1000000" },
      borrowers: [{ type: "jur" }],
    };
    await syncFunnelStepsToSalesforce(p, sf.api);
    expect(sf.calls.companies).toEqual([{ name: "Firma GmbH", phone: "044 000 00 00", uid: null, sitz: null, street: "Seestrasse 1" }]);
    expect(sf.calls.contacts[0]).toMatchObject({ FirstName: "Karl", LastName: "Kontakt", Email: "kontakt@firma.ch" });
    expect(sf.api.createAccount).not.toHaveBeenCalled();
  });

  it("a natural person keeps the Person Account and gets no Contact", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v5Payload(kaufState()), sf.api);
    expect(sf.calls.persons).toHaveLength(1);
    expect(sf.api.findBusinessAccount).not.toHaveBeenCalled();
    expect(sf.api.createContact).not.toHaveBeenCalled();
    expect(sf.calls.cases[0]).not.toHaveProperty("ContactId");
  });

  it("an API without the company functions says so instead of a TypeError", async () => {
    const { api } = fakeSalesforce();
    delete (api as any).createBusinessAccount;
    await expect(syncFunnelStepsToSalesforce(v5Payload(jurState()), api)).rejects.toThrow("salesforceApi.createBusinessAccount is not a function");
  });
});
