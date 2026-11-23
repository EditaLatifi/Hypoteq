/**
 * Partner Fast Lead in Salesforce (HYPOTEQ 23.11.2026, DECISIONS P40): the Case is created with the
 * invitation, the customer's submit updates that Case — never HYPOTEQ's owner, record type,
 * origin, status or stage — and a Case that cannot be updated any more does not cost the request.
 * Also: the start screen recommends the Begleitete Anmeldung to an invited customer.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({ __esModule: true, resolvePartner: jest.fn() }));

import { createLeadCase, leadCaseDescription } from "@/components/fastLeadSalesforce";
import { LEAD_CASE_KEPT_FIELDS, fastLeadNote, syncFunnelStepsToSalesforce, writeFunnelCase } from "@/components/syncFunnelStepsToSalesforce";
import { recommendedMode } from "@/lib/funnel-v3/steps";

const PARTNER = {
  contactId: "003PARTNERAAAAAAAA",
  accountId: "001PARTNERAAAAAAAA",
  name: "Anna Muster",
  company: "Muster AG",
  email: "anna@muster.ch",
  invitedAt: "2026-11-23T09:00:00.000Z",
};
const CUSTOMER = { anrede: "Frau", firstName: "Lea", lastName: "Beispiel", email: "lea@kunde.ch", phone: "079 111 22 33", locale: "fr" };

function fakeApi(over: Record<string, any> = {}) {
  const api: any = {
    cases: [] as any[],
    updates: [] as any[],
    findAccountByEmail: jest.fn(async () => null),
    findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQAAAAAAAA" })),
    createAccount: jest.fn(async () => ({ id: "001KUNDEAAAAAAAAAA", success: true })),
    createPersonAccount: jest.fn(async () => ({ id: "001KUNDEAAAAAAAAAA", success: true })),
    updatePersonAccount: jest.fn(async () => ({ success: true })),
    findContactByEmail: jest.fn(async () => null),
    createContact: jest.fn(async () => ({ id: "003X", success: true })),
    findFunnelQueueId: jest.fn(async () => "00GQUEUEAAAAAAAAAA"),
    findFunnelCaseRecordTypeId: jest.fn(async () => "012STANDARDAAAAAAA"),
    createOrUpdateCase: jest.fn(async (fields: any) => {
      api.cases.push(fields);
      return { id: "500NEWAAAAAAAAAAAA", success: true };
    }),
    updateCase: jest.fn(async (id: string, fields: any) => {
      api.updates.push({ id, fields });
      return { id, success: true };
    }),
    ...over,
  };
  return api;
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("createLeadCase (at the invitation)", () => {
  const input = { customer: CUSTOMER, partner: PARTNER, expiresAt: new Date("2026-12-23T09:00:00.000Z") };

  it("a Person Account for the customer and a Case for the partner, owned and typed like every funnel Case", async () => {
    const api = fakeApi();
    const res = await createLeadCase(input, api);
    expect(res).toEqual({ caseId: "500NEWAAAAAAAAAAAA", accountId: "001KUNDEAAAAAAAAAA", dropped: [] });
    expect(api.createAccount).toHaveBeenCalledWith({ LastName: "Beispiel", FirstName: "Lea", PersonEmail: "lea@kunde.ch", Phone: "079 111 22 33", Salutation: "Mrs." });
    const c = api.cases[0];
    expect(c).toMatchObject({
      Case_Name__c: "Beispiel Lea",
      Stage__c: "Needs Analysis",
      Korrespondenzsprache__c: "Französisch",
      Client__c: "001KUNDEAAAAAAAAAA",
      Wie_viele_Kunden__c: "1",
      Partner_Consultant__c: "003PARTNERAAAAAAAA",
      Account__c: "001PARTNERAAAAAAAA",
      OwnerId: "00GQUEUEAAAAAAAAAA",
      RecordTypeId: "012STANDARDAAAAAAA",
      Comments: fastLeadNote(PARTNER, "invited"),
    });
    expect(c.Comments).toContain("Der Kunde hat seine Angaben noch nicht erfasst");
    expect(c.Description).toContain("Kunde: Frau Lea Beispiel · lea@kunde.ch · 079 111 22 33 · Sprache FR");
    expect(c.Description).toContain("gültig bis 23.12.2026, Erinnerungen nach 3 und 7 Tagen");
    expect(c.Origin).toBeUndefined();
  });

  it("reuses the Person Account of that address; the Anrede never costs the Account", async () => {
    const found = fakeApi({ findAccountByEmail: jest.fn(async () => ({ Id: "001EXISTINGAAAAAAA" })) });
    await createLeadCase(input, found);
    expect(found.createAccount).not.toHaveBeenCalled();
    expect(found.cases[0].Client__c).toBe("001EXISTINGAAAAAAA");

    const createAccount = jest.fn<any>().mockRejectedValueOnce(new Error("INVALID_FIELD Salutation")).mockResolvedValueOnce({ id: "001RETRYAAAAAAAAAA" });
    const retry = fakeApi({ createAccount });
    await createLeadCase(input, retry);
    expect(createAccount.mock.calls[1][0]).not.toHaveProperty("Salutation");
    expect(retry.cases[0].Client__c).toBe("001RETRYAAAAAAAAAA");
  });

  it("throws when Salesforce refuses the Case (the invitation is kept by the caller)", async () => {
    await expect(createLeadCase(input, fakeApi({ createOrUpdateCase: jest.fn(async () => ({})) }))).rejects.toThrow(/no Case Id/);
  });

  it("the description works without a phone or a company", () => {
    const d = leadCaseDescription({ ...input, customer: { ...CUSTOMER, phone: null, anrede: null }, partner: { contactId: "003X", email: "anna@muster.ch" } });
    expect(d).toContain("Partner Fast Lead: anna@muster.ch hat den Kunden");
    expect(d).toContain("Kunde: Lea Beispiel · lea@kunde.ch · Sprache FR");
  });
});

describe("the submit updates the invitation's Case", () => {
  it("writeFunnelCase leaves owner, record type, origin, status and stage to HYPOTEQ", async () => {
    const api = fakeApi();
    const caseData = { Case_Name__c: "Beispiel Lea – 8001 Zürich", OwnerId: "00GQ", RecordTypeId: "012X", Origin: "Web", Status: "New", Stage__c: "Needs Analysis", Kaufpreis__c: 1000000 };
    const res = await writeFunnelCase(caseData, api, "500LEADAAAAAAAAAAA");
    expect(res).toMatchObject({ id: "500LEADAAAAAAAAAAA", updated: true });
    expect(api.updates).toEqual([{ id: "500LEADAAAAAAAAAAA", fields: { Case_Name__c: "Beispiel Lea – 8001 Zürich", Kaufpreis__c: 1000000 } }]);
    expect(api.createOrUpdateCase).not.toHaveBeenCalled();
    expect([...LEAD_CASE_KEPT_FIELDS]).toEqual(["OwnerId", "RecordTypeId", "Origin", "Status", "Stage__c"]);
  });

  it("a Case that cannot be updated any more: a new one, with a note to merge them", async () => {
    const api = fakeApi({ updateCase: jest.fn(async () => Promise.reject(new Error("ENTITY_IS_DELETED"))) });
    const res = await writeFunnelCase({ Case_Name__c: "Beispiel Lea" }, api, "500GONEAAAAAAAAAAA");
    expect(res.id).toBe("500NEWAAAAAAAAAAAA");
    expect(api.cases[0].Comments).toContain("Der Case der Einladung (500GONEAAAAAAAAAAA) konnte nicht aktualisiert werden – bitte zusammenführen.");
  });

  it("without an invitation's Case it creates as always", async () => {
    const api = fakeApi();
    await writeFunnelCase({ Case_Name__c: "X" }, api, null);
    expect(api.updateCase).not.toHaveBeenCalled();
    expect(api.cases).toHaveLength(1);
  });

  it("through the whole sync: the customer's request lands on the invitation's Case, still the partner's", async () => {
    const api = fakeApi();
    const out: any = await syncFunnelStepsToSalesforce(
      {
        customerType: "direct",
        client: { email: "lea@kunde.ch", phone: "0791112233", firstName: "Lea", lastName: "Beispiel" },
        project: { projektArt: "kauf" },
        property: { zip: "8001", ort: "Zürich", kreditnehmer: [{ vorname: "Lea", name: "Beispiel", email: "lea@kunde.ch", telefon: "0791112233" }] },
        financing: { kaufpreis: "1000000" },
        stage: "Needs Analysis",
        partnerLead: { ...PARTNER, caseId: "500LEADAAAAAAAAAAA" },
      },
      api,
    );
    expect(out.case.id).toBe("500LEADAAAAAAAAAAA");
    expect(api.createOrUpdateCase).not.toHaveBeenCalled();
    const f = api.updates[0].fields;
    expect(f.Partner_Consultant__c).toBe("003PARTNERAAAAAAAA");
    expect(f.Account__c).toBe("001PARTNERAAAAAAAA");
    expect(String(f.Comments)).toContain("die Angaben hat der Kunde selbst erfasst");
    for (const k of LEAD_CASE_KEPT_FIELDS) expect(f).not.toHaveProperty(k);
  });

  it("a Berater submission never touches an invitation's Case", async () => {
    const { resolvePartner } = await import("@/components/partnerDirectory");
    (resolvePartner as any).mockResolvedValueOnce({ status: "unknown" });
    const api = fakeApi();
    await syncFunnelStepsToSalesforce(
      {
        customerType: "partner",
        client: { email: "neu@makler.ch" },
        partner: { email: "neu@makler.ch" },
        project: { projektArt: "kauf" },
        property: { zip: "8001", kreditnehmer: [{ vorname: "Lea", name: "Beispiel" }] },
        financing: {},
        partnerLead: { ...PARTNER, caseId: "500LEADAAAAAAAAAAA" },
      },
      api,
    );
    expect(api.updateCase).not.toHaveBeenCalled();
    expect(api.createOrUpdateCase).toHaveBeenCalled();
  });
});

describe("the start screen of an invited customer", () => {
  it("recommends the Begleitete Anmeldung (HYPOTEQ 23.11.2026); otherwise the Schnellanmeldung as before", () => {
    expect(recommendedMode("kunde", true)).toBe("begleitet");
    expect(recommendedMode(null, true)).toBe("begleitet");
    expect(recommendedMode("berater", true)).toBe("schnell");
    expect(recommendedMode("kunde")).toBe("schnell");
  });
});
