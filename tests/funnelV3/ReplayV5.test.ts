/**
 * app/api/admin/replay-salesforce: a v5 inquiry that never reached Salesforce is replayed with
 * its stored answers (`v3State`) and its documents, so the Case gets the v5 mapping; a legacy
 * row replays as before. Dry run only, Prisma and Salesforce are fakes — the route is never
 * pointed at the real org here.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { v3InquiryColumns } from "@/lib/funnel-v3/nachreich";
import { analysis, kaufState, v5Payload } from "./v5Fixtures";

const mockRows: any[] = [];
const mockSynced: any[] = [];

jest.mock("@/lib/prisma", () => ({
  prisma: {
    inquiry: {
      findMany: async () => mockRows,
      update: async () => ({}),
    },
  },
}));
jest.mock("@/components/salesforceApi", () => ({
  __esModule: true,
  default: { login: async () => {}, getPersonAccountRecordTypeId: async () => "012PA" },
}));
jest.mock("@/components/syncFunnelStepsToSalesforce", () => ({
  syncFunnelStepsToSalesforce: async (payload: any, api: any) => {
    mockSynced.push(payload);
    await api.createOrUpdateCase({ Case_Name__c: "x" });
    return { case: { id: "DRYRUN_CASE_ID" } };
  },
}));

import { GET } from "@/app/api/admin/replay-salesforce/route";

beforeEach(() => {
  mockRows.length = 0;
  mockSynced.length = 0;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const base = {
  id: "inq-1",
  createdAt: new Date("2026-10-15T09:00:00Z"),
  customerType: "direct",
  client: { firstName: "Lea", lastName: "Muster", email: "lea.muster@kunde.ch", phone: "", zip: "8001", partnerEmail: "" },
  project: { projektArt: "kauf" },
  property: { kreditnehmer: [] },
  financing: { kaufpreis: "1000000" },
  borrowers: [{ type: "nat" }],
  documentsComplete: true,
  documentsMissing: "",
};

describe("replay of a v5 inquiry", () => {
  it("sends the stored answers, the language and the documents placed as at the closing", async () => {
    const state = kaufState();
    const { v3State, v3Skipped } = v3InquiryColumns(v5Payload(state, { locale: "fr" }), "fr") as any;
    mockRows.push({
      ...base,
      v3State,
      v3Skipped,
      documents: [
        {
          id: "d1",
          fileName: "HQ_ID.pdf",
          fileUrl: "https://sp.example/HQ_ID.pdf",
          originalFileName: "pass.pdf",
          driveItemId: "item-1",
          uploadedAt: new Date("2026-10-15T08:00:00Z"),
          storedName: "HQ_ID.pdf",
          aiAnalysis: { v3: analysis("id"), v3Submitted: { instanceId: "id#b1", requirementId: "id" } },
        },
      ],
    });
    const res = await GET(new Request("http://localhost/api/admin/replay-salesforce?ids=inq-1"));
    expect(res.status).toBe(200);
    const p = mockSynced[0];
    expect(p.v3).toEqual(v3State);
    expect(p.locale).toBe("fr");
    expect(p.korrespondenzsprache).toBe("Französisch");
    expect(p.v3Completion.files).toEqual([expect.objectContaining({ documentId: "d1", instanceId: "id#b1", storedName: "HQ_ID.pdf" })]);
    expect(p.documentCompleteness).toEqual({ skipped: [] });
  });

  it("a legacy row replays as before", async () => {
    mockRows.push({ ...base, v3State: null, documents: [] });
    await GET(new Request("http://localhost/api/admin/replay-salesforce?ids=inq-1"));
    const p = mockSynced[0];
    expect(p.v3).toBeUndefined();
    expect(p.korrespondenzsprache).toBe("Deutsch");
    expect(p.documentCompleteness).toEqual({ complete: true, missing: [], salesforceFlags: {} });
  });
});
