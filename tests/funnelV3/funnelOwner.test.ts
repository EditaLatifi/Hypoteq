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
import { clearFunnelQueueCache, createOrUpdateCase, findFunnelQueueId, takeDroppedFields } from "@/components/salesforceApi";
import { applyFunnelOwner, syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
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
    expect(caseData).toEqual({});
  });
});

describe("salesforceApi", () => {
  it("findFunnelQueueId: by Name or DeveloperName, a Case queue, cached once found", async () => {
    mockConn.answers.push(() => ({ records: [{ Id: "00GQUEUE0000000AAA" }] }));
    expect(await findFunnelQueueId()).toBe("00GQUEUE0000000AAA");
    expect(await findFunnelQueueId()).toBe("00GQUEUE0000000AAA");
    expect(mockConn.queries).toEqual(["SELECT Id FROM Group WHERE Type = 'Queue' AND (Name = 'Web-Anfragen' OR DeveloperName = 'Web_Anfragen') LIMIT 1"]);
  });

  it("a miss is not cached: a queue created later is found", async () => {
    mockConn.answers.push(() => ({ records: [] }), () => ({ records: [{ Id: "00GLATER000000AAA" }] }));
    expect(await findFunnelQueueId()).toBeNull();
    expect(await findFunnelQueueId()).toBe("00GLATER000000AAA");
  });

  it("an owner Salesforce refuses without naming a field is dropped, not the Case", async () => {
    mockConn.createErrors.push(Object.assign(new Error("invalid cross reference id"), { errorCode: "INVALID_CROSS_REFERENCE_KEY", fields: [] }));
    const res = await createOrUpdateCase({ Case_Name__c: "Muster Lea – 8001 Zürich", OwnerId: "00GQUEUE0000000AAA" });
    expect(res).toMatchObject({ id: "500NEW" });
    expect(mockConn.creates).toEqual([{ type: "Case", fields: { Case_Name__c: "Muster Lea – 8001 Zürich" } }]);
    expect(takeDroppedFields()).toEqual(["Case.OwnerId (INVALID_CROSS_REFERENCE_KEY)"]);
  });
});
