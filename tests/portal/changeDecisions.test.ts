import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * HYPOTEQ decides change requests in Salesforce (Portal_Meldung__c Entscheid__c and
 * Entscheid_Begruendung__c, 21.10.2026): the portal takes the decision over, shows the reason
 * and mails the partner once (M14). Salesforce and the database are fakes here.
 */

const mockUpdateMany = jest.fn<any>();
const mockFindUser = jest.fn<any>();
jest.mock("@/lib/prisma", () => ({
  prisma: {
    portalChangeRequest: { updateMany: (a: unknown) => mockUpdateMany(a), findMany: jest.fn() },
    portalUser: { findUnique: (a: unknown) => mockFindUser(a) },
  },
}));
jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => unknown) => op() }));

import { decisionFromMeldung, loadMeldungDecisions, syncChangeDecisions } from "@/lib/portal/changeDecisions";

const M1 = "a0LTG000006v4TF2AY";
const M2 = "a0LTG000006v4bJ2AQ";
const sfWith = (records: any[], onQuery?: (soql: string) => void) => ({
  query: async (soql: string) => {
    onQuery?.(soql);
    return { records };
  },
  sobject: () => ({ create: async () => ({}) }),
});
const row = (over: Partial<{ id: string; status: string; sfTaskId: string | null; field: string }> = {}) => ({
  id: "11111111-aaaa-bbbb-cccc-000000000001",
  userId: "user-1",
  field: "phone",
  status: "in_pruefung",
  sfTaskId: M1,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockFindUser.mockResolvedValue({ email: "partner@example.ch", name: "Bea Rater", locale: "fr", status: "active" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("decisionFromMeldung", () => {
  it("maps Entscheid__c and keeps the Begründung", () => {
    expect(decisionFromMeldung({ Entscheid__c: "Angenommen", Entscheid_Begruendung__c: " Neue Nummer übernommen. " })).toEqual({ status: "uebernommen", reason: "Neue Nummer übernommen." });
    expect(decisionFromMeldung({ Entscheid__c: "Abgelehnt", Entscheid_Begruendung__c: "IBAN gehört nicht zur Firma." })).toEqual({ status: "abgelehnt", reason: "IBAN gehört nicht zur Firma." });
    expect(decisionFromMeldung({ Entscheid__c: "Offen", Entscheid_Begruendung__c: "" })).toEqual({ status: null, reason: null });
    expect(decisionFromMeldung({})).toEqual({ status: null, reason: null });
  });
});

describe("loadMeldungDecisions", () => {
  it("asks only for valid Salesforce ids, by Id", async () => {
    let soql = "";
    const map = await loadMeldungDecisions([M1, "not-an-id", M1], sfWith([{ Id: M1, Entscheid__c: "Abgelehnt", Entscheid_Begruendung__c: "Grund" }], (q) => (soql = q)));
    expect(soql).toBe(`SELECT Id, Entscheid__c, Entscheid_Begruendung__c FROM Portal_Meldung__c WHERE Id IN ('${M1}')`);
    expect(map.get(M1)).toEqual({ status: "abgelehnt", reason: "Grund" });
  });
});

describe("syncChangeDecisions", () => {
  it("takes a new decision over, mails it once, and returns the reason for display", async () => {
    const send = jest.fn<any>(async () => {});
    const r = row();
    const out = await syncChangeDecisions([r], { origin: "https://hypoteq.com", sf: sfWith([{ Id: M1, Entscheid__c: "Abgelehnt", Entscheid_Begruendung__c: "IBAN gehört nicht zur Firma." }]), send });
    expect(mockUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: r.id, status: { not: "abgelehnt" } }, data: expect.objectContaining({ status: "abgelehnt", decidedBy: "Salesforce" }) }));
    expect(r.status).toBe("abgelehnt");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "partner@example.ch", locale: "fr", field: "phone", approved: false, nr: "AA-111111" }));
    expect(out.get(r.id)).toEqual({ status: "abgelehnt", reason: "IBAN gehört nicht zur Firma." });
  });

  it("no mail when another caller already took the decision over, or the status is unchanged", async () => {
    const send = jest.fn<any>(async () => {});
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await syncChangeDecisions([row()], { origin: "x", sf: sfWith([{ Id: M1, Entscheid__c: "Angenommen" }]), send });
    expect(send).not.toHaveBeenCalled();
    mockUpdateMany.mockClear();
    await syncChangeDecisions([row({ status: "uebernommen" })], { origin: "x", sf: sfWith([{ Id: M1, Entscheid__c: "Angenommen" }]), send });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("«Offen» in Salesforce leaves the portal's status alone but still shows a reason", async () => {
    const send = jest.fn<any>(async () => {});
    const r = row({ status: "uebernommen", sfTaskId: M2 });
    const out = await syncChangeDecisions([r], { origin: "x", sf: sfWith([{ Id: M2, Entscheid__c: "Offen", Entscheid_Begruendung__c: "Rückfrage beim Partner" }]), send });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(r.status).toBe("uebernommen");
    expect(out.get(r.id)?.reason).toBe("Rückfrage beim Partner");
  });

  it("no mail to a deactivated access; Salesforce down changes nothing", async () => {
    const send = jest.fn<any>(async () => {});
    mockFindUser.mockResolvedValue({ email: "p@example.ch", name: null, locale: null, status: "disabled" });
    await syncChangeDecisions([row()], { origin: "x", sf: sfWith([{ Id: M1, Entscheid__c: "Angenommen" }]), send });
    expect(send).not.toHaveBeenCalled();

    const down = { query: async () => { throw new Error("Salesforce down"); }, sobject: () => ({ create: async () => ({}) }) };
    const out = await syncChangeDecisions([row()], { origin: "x", sf: down, send });
    expect(out.size).toBe(0);
  });

  it("a request without a Portal_Meldung__c is not asked about", async () => {
    let asked = false;
    await syncChangeDecisions([row({ sfTaskId: null })], { origin: "x", sf: sfWith([], () => (asked = true)) });
    expect(asked).toBe(false);
  });
});
