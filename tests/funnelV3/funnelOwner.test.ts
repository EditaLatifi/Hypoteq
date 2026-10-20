/**
 * HYPOTEQ 19.10. D.2 and the mapping row «Owner: Queue Web-Anfragen oder HYPOTEQ-User»
 * (DECISIONS V64): a funnel Case belongs to the queue «Web-Anfragen», unless a HYPOTEQ user is
 * the Berater — then to that User. Fail soft: no queue, no change. The Salesforce API and the
 * jsforce connection are fakes; `fetch` (the OAuth login) throws if anything tried it.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockConn: any = {
  accessToken: "test-session",
  queries: [] as string[],
  answers: [] as ((soql: string) => any)[],
  createErrors: [] as any[],
  creates: [] as any[],
  async query(soql: string) {
    this.queries.push(soql);
    const answer = this.answers.shift();
    return answer ? answer(soql) : { records: [] };
  },
  sobject(type: string) {
    return {
      create: async (fields: any) => {
        const err = mockConn.createErrors.shift();
        if (err) throw err;
        mockConn.creates.push({ type, fields });
        return { id: "500NEW", success: true };
      },
    };
  },
};
jest.mock("jsforce", () => ({ Connection: jest.fn(() => mockConn) }));

jest.mock("@/components/partnerDirectory", () => ({ __esModule: true, resolvePartner: jest.fn() }));

import { resolvePartner } from "@/components/partnerDirectory";
import {
  clearFunnelCaseRecordTypeCache,
  clearFunnelQueueCache,
  createOrUpdateCase,
  findFunnelCaseRecordTypeId,
  findFunnelQueueId,
  takeDroppedFields,
} from "@/components/salesforceApi";
import { applyFunnelOwner, applyFunnelRecordType, syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { ablState, kaufState, v5Payload } from "./v5Fixtures";

const resolve = resolvePartner as unknown as jest.Mock<(...a: any[]) => Promise<any>>;

function fakeApi(queue: () => Promise<string | null>) {
  const cases: any[] = [];
  return {
    cases,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async () => ({ id: "001A" })),
      updatePersonAccount: jest.fn(async () => ({})),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      findFunnelQueueId: jest.fn(queue),
      findFunnelCaseRecordTypeId: jest.fn(async () => "012STANDARD000AAAA"),
      createOrUpdateCase: jest.fn(async (d: any) => {
        cases.push(d);
        return { id: "500CASE" };
      }),
    },
  };
}

beforeEach(() => {
  resolve.mockReset();
  resolve.mockResolvedValue({ status: "unknown" });
  mockConn.queries = [];
  mockConn.answers = [];
  mockConn.createErrors = [];
  mockConn.creates = [];
  clearFunnelQueueCache();
  takeDroppedFields();
  (globalThis as any).fetch = async () => {
    throw new Error("no network in tests");
  };
  delete process.env.SF_FUNNEL_QUEUE_NAME;
  delete process.env.SF_FUNNEL_QUEUE_DEVELOPER_NAME;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("the sync", () => {
  it("a customer's own Case → the queue «Web-Anfragen»", async () => {
    const sf = fakeApi(async () => "00GQUEUE0000000AAA");
    await syncFunnelStepsToSalesforce(v5Payload(kaufState()), sf.api);
    expect(sf.cases[0].OwnerId).toBe("00GQUEUE0000000AAA");
  });

  it("a partner's Case → the queue as well (the partner is Partner_Consultant__c, not the owner)", async () => {
    resolve.mockResolvedValueOnce({ status: "partner", contactId: "003PARTNER", accountId: "001PARTNERCO", name: "Bea Rater" });
    const sf = fakeApi(async () => "00GQUEUE0000000AAA");
    await syncFunnelStepsToSalesforce(v5Payload(ablState()), sf.api);
    expect(sf.cases[0]).toMatchObject({ OwnerId: "00GQUEUE0000000AAA", Partner_Consultant__c: "003PARTNER" });
  });

  it("a HYPOTEQ user as Berater → that User owns it; the queue is not asked", async () => {
    resolve.mockResolvedValueOnce({ status: "hypoteq", userId: "005HYPOUSER000AAAA", name: "Hans Hypo" });
    const sf = fakeApi(async () => "00GQUEUE0000000AAA");
    await syncFunnelStepsToSalesforce(v5Payload(ablState({ txt: { ...ablState().txt, bmail: "hans@hypoteq.ch" } })), sf.api);
    expect(resolve).toHaveBeenCalledWith("hans@hypoteq.ch", { fresh: true });
    expect(sf.cases[0].OwnerId).toBe("005HYPOUSER000AAAA");
    expect(sf.api.findFunnelQueueId).not.toHaveBeenCalled();
  });

  it("no queue, or a failed lookup: the default owner, and the Case is still written", async () => {
    const none = fakeApi(async () => null);
    await syncFunnelStepsToSalesforce(v5Payload(kaufState()), none.api);
    expect(none.cases[0]).not.toHaveProperty("OwnerId");
    const down = fakeApi(async () => {
      throw new Error("Salesforce down");
    });
    const result = await syncFunnelStepsToSalesforce(v5Payload(kaufState()), down.api);
    expect(result.case).toEqual({ id: "500CASE" });
    expect(down.cases[0]).not.toHaveProperty("OwnerId");
  });

  it("an API without the function (older builds, fakes) changes nothing", async () => {
    const caseData: Record<string, any> = {};
    await applyFunnelOwner(caseData, {});
    await applyFunnelRecordType(caseData, {});
    expect(caseData).toEqual({});
  });

  it("every funnel Case gets the record type «Standardfinanzierung» explicitly (HYPOTEQ 20.10.2026)", async () => {
    const sf = fakeApi(async () => "00GQUEUE0000000AAA");
    await syncFunnelStepsToSalesforce(v5Payload(kaufState()), sf.api);
    expect(sf.cases[0].RecordTypeId).toBe("012STANDARD000AAAA");
  });

  it("no such record type, or a failed lookup: the default record type, and the Case is still written", async () => {
    const none = fakeApi(async () => null);
    none.api.findFunnelCaseRecordTypeId.mockImplementation(async () => null as any);
    await syncFunnelStepsToSalesforce(v5Payload(kaufState()), none.api);
    expect(none.cases[0]).not.toHaveProperty("RecordTypeId");
    const down = fakeApi(async () => null);
    down.api.findFunnelCaseRecordTypeId.mockImplementation(async () => {
      throw new Error("Salesforce down");
    });
    await syncFunnelStepsToSalesforce(v5Payload(kaufState()), down.api);
    expect(down.cases[0]).not.toHaveProperty("RecordTypeId");
  });
});

describe("salesforceApi", () => {
  it("findFunnelQueueId: by Name or DeveloperName, a Case queue, cached once found", async () => {
    mockConn.answers.push(() => ({ records: [{ Id: "00GQUEUE0000000AAA" }] }));
    expect(await findFunnelQueueId()).toBe("00GQUEUE0000000AAA");
    expect(await findFunnelQueueId()).toBe("00GQUEUE0000000AAA");
    expect(mockConn.queries).toEqual(["SELECT Id FROM Group WHERE Type = 'Queue' AND (Name = 'Web-Anfragen' OR DeveloperName = 'Web_Anfragen') LIMIT 1"]);
  });

  it("findFunnelCaseRecordTypeId: «Standard» / «Standardfinanzierung», never «Spezialfinanzierung», cached once found", async () => {
    clearFunnelCaseRecordTypeCache();
    mockConn.answers.push(() => ({
      records: [
        { Id: "012SPEZIAL0000AAAA", DeveloperName: "Spezialfinanzierung", Name: "Spezialfinanzierung" },
        { Id: "012STANDARD000AAAA", DeveloperName: "Standard", Name: "Standardfinanzierung" },
      ],
    }));
    expect(await findFunnelCaseRecordTypeId()).toBe("012STANDARD000AAAA");
    expect(await findFunnelCaseRecordTypeId()).toBe("012STANDARD000AAAA");
    expect(mockConn.queries).toEqual(["SELECT Id, DeveloperName, Name FROM RecordType WHERE SobjectType = 'Case' AND IsActive = true"]);
    // None: null, asked again next time.
    clearFunnelCaseRecordTypeCache();
    mockConn.answers.push(() => ({ records: [{ Id: "012SPEZIAL0000AAAA", DeveloperName: "Spezialfinanzierung", Name: "Spezialfinanzierung" }] }));
    expect(await findFunnelCaseRecordTypeId()).toBeNull();
  });

  it("a miss is not cached: a queue created later is found", async () => {
    mockConn.answers.push(
      () => ({ records: [] }),
      () => ({ records: [] }),
      () => ({ records: [{ Id: "00GLATER000000AAA" }] })
    );
    expect(await findFunnelQueueId()).toBeNull();
    expect(await findFunnelQueueId()).toBe("00GLATER000000AAA");
  });

  it("exact names miss: every queue is read and «Web Anfragen» / WebAnfragen / «Web–Anfragen» match", async () => {
    for (const row of [
      { Id: "00GSPACE00000000AA", Name: "Web Anfragen", DeveloperName: "Web_Anfragen_Q" },
      { Id: "00GDEVNAME0000000A", Name: "Eingang Web", DeveloperName: "WebAnfragen" },
      { Id: "00GDASH0000000000A", Name: "Web–Anfragen", DeveloperName: "Eingang" },
    ]) {
      clearFunnelQueueCache();
      mockConn.queries = [];
      mockConn.answers.push(
        () => ({ records: [] }),
        () => ({ records: [{ Id: "00GOTHER000000000A", Name: "Spezialfinanzierung", DeveloperName: "Spezialfinanzierung" }, row] })
      );
      expect(await findFunnelQueueId()).toBe(row.Id);
      expect(mockConn.queries[1]).toBe("SELECT Id, Name, DeveloperName FROM Group WHERE Type = 'Queue' ORDER BY Name LIMIT 500");
    }
  });

  it("no queue under any spelling: null, and the log names the queues the user sees", async () => {
    const warn = console.warn as unknown as jest.Mock;
    mockConn.answers.push(
      () => ({ records: [] }),
      () => ({ records: [{ Id: "00GOTHER000000000A", Name: "Spezialfinanzierung", DeveloperName: "Spezialfinanzierung" }] })
    );
    expect(await findFunnelQueueId()).toBeNull();
    expect(String(warn.mock.calls.at(-1)?.[0])).toContain("Spezialfinanzierung (Spezialfinanzierung)");
  });

  it("a lookup filter refusing the named field costs that link, not the Case", async () => {
    mockConn.createErrors.push(
      Object.assign(new Error("Wert ist nicht vorhanden bzw. stimmt nicht mit Filterkriterien überein."), {
        errorCode: "FIELD_FILTER_VALIDATION_EXCEPTION",
        data: { fields: ["Client__c"] },
      })
    );
    const res = await createOrUpdateCase({ AccountId: "001BUSINESS000AAAA", Client__c: "001BUSINESS000AAAA", ContactId: "003SIGNER00000AAAA" });
    expect(res).toMatchObject({ id: "500NEW" });
    expect(mockConn.creates).toEqual([{ type: "Case", fields: { AccountId: "001BUSINESS000AAAA", ContactId: "003SIGNER00000AAAA" } }]);
    expect(takeDroppedFields()).toEqual(["Case.Client__c (FIELD_FILTER_VALIDATION_EXCEPTION)"]);
  });

  it("a lookup filter naming no field: the client links go first, AccountId stays", async () => {
    const filter = () => Object.assign(new Error("Wert ist nicht vorhanden bzw. stimmt nicht mit Filterkriterien überein."), { errorCode: "FIELD_FILTER_VALIDATION_EXCEPTION", fields: [] });
    mockConn.createErrors.push(filter(), filter());
    const res = await createOrUpdateCase({ AccountId: "001BUSINESS000AAAA", Client__c: "001BUSINESS000AAAA", ContactId: "003SIGNER00000AAAA" });
    expect(res).toMatchObject({ id: "500NEW" });
    expect(mockConn.creates).toEqual([{ type: "Case", fields: { AccountId: "001BUSINESS000AAAA" } }]);
    expect(takeDroppedFields()).toEqual(["Case.Client__c (FIELD_FILTER_VALIDATION_EXCEPTION)", "Case.ContactId (FIELD_FILTER_VALIDATION_EXCEPTION)"]);
  });

  it("an owner Salesforce refuses without naming a field is dropped, not the Case", async () => {
    mockConn.createErrors.push(Object.assign(new Error("invalid cross reference id"), { errorCode: "INVALID_CROSS_REFERENCE_KEY", fields: [] }));
    const res = await createOrUpdateCase({ Case_Name__c: "Muster Lea – 8001 Zürich", OwnerId: "00GQUEUE0000000AAA" });
    expect(res).toMatchObject({ id: "500NEW" });
    expect(mockConn.creates).toEqual([{ type: "Case", fields: { Case_Name__c: "Muster Lea – 8001 Zürich" } }]);
    expect(takeDroppedFields()).toEqual(["Case.OwnerId (INVALID_CROSS_REFERENCE_KEY)"]);
  });
});
