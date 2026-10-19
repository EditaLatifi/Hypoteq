/**
 * Findings of the logged-in portal test on 19.10.2026:
 *  - a funnel Case «Bei der Bank in Prüfung» still listed the funnel's missing documents of the
 *    day it was submitted, each with «Hochladen»; past the document stage nothing is outstanding;
 *  - «Letzte Updates» comes with every Portal_Status__c change from Salesforce's field history.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const mockQuery = jest.fn<any>();
const mockInquiries = jest.fn<any>();

jest.mock("@/components/salesforceApi", () => ({
  conn: {
    accessToken: "token",
    query: (soql: string) => mockQuery(soql),
    sobject: () => ({ describe: async () => ({ fields: [{ name: "Portal_Status__c" }] }) }),
  },
  login: async () => {},
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    inquiry: { findMany: () => mockInquiries() },
    portalUpload: { findMany: async () => [] },
    portalSpecialRequest: { findMany: async () => [] },
  },
}));

import { caseStatusHistory, listPartnerCases } from "@/lib/portal/salesforce";

const CASE_ID = "500000000000002AAA";
const scope = { contactId: "003000000000001AAA", accountId: null, companyWide: false };
const caseRecord = (portalStatus: string) => ({
  Id: CASE_ID,
  CaseNumber: "00012346",
  Status: "New",
  Stage__c: "Needs Analysis",
  Portal_Status__c: portalStatus,
  Case_Name__c: "Mustermann Max – 8000 Zürich",
  Gesch_tzter_Hypothekenbedarf__c: 800000,
  CreatedDate: "2026-09-22T08:00:00.000Z",
  LastModifiedDate: "2026-10-19T08:00:00.000Z",
});

beforeEach(() => {
  mockQuery.mockReset();
  // The funnel's verdict at submit: two documents missing.
  mockInquiries.mockResolvedValue([{ salesforceCaseId: CASE_ID, documentsMissing: "fotos,grundbuch", documentsComplete: false }]);
});

describe("funnel Case documents by stage", () => {
  it("at the bank: nothing is listed as missing, nothing asks for an upload", async () => {
    mockQuery.mockImplementation(async (soql: string) => (/FROM Case\b/.test(soql) ? { records: [caseRecord("Bei der Bank in Prüfung")] } : { records: [] }));
    const [c] = await listPartnerCases(scope, "de");
    expect(c.status).toBe("Bei der Bank in Prüfung");
    expect(c.missingDocs).toEqual([]);
    expect(c.documents.filter((d) => d.status === "fehlt")).toEqual([]);
  });

  it("still at the document stage: the funnel's missing documents are listed", async () => {
    mockQuery.mockImplementation(async (soql: string) => (/FROM Case\b/.test(soql) ? { records: [caseRecord("Unterlagen fehlen noch")] } : { records: [] }));
    const [c] = await listPartnerCases(scope, "de");
    expect(c.missingDocs.length).toBe(2);
  });
});

describe("caseStatusHistory", () => {
  it("returns the tracked Portal_Status__c changes, newest first, and skips unknown values", async () => {
    mockQuery.mockImplementation(async (soql: string) => {
      expect(soql).toMatch(/FROM CaseHistory WHERE CaseId = '500000000000002AAA' AND Field = 'Portal_Status__c'/);
      return {
        records: [
          { CreatedDate: "2026-10-19T08:00:00.000Z", NewValue: "Bei der Bank in Prüfung" },
          { CreatedDate: "2026-10-01T08:00:00.000Z", NewValue: "Not a status" },
          { CreatedDate: "2026-09-25T08:00:00.000Z", NewValue: "Wir prüfen die Unterlagen" },
        ],
      };
    });
    expect(await caseStatusHistory(CASE_ID)).toEqual([
      { at: "2026-10-19T08:00:00.000Z", status: "Bei der Bank in Prüfung" },
      { at: "2026-09-25T08:00:00.000Z", status: "Wir prüfen die Unterlagen" },
    ]);
  });

  it("never fails the Case page: a refused history query gives no entries", async () => {
    mockQuery.mockRejectedValue(Object.assign(new Error("sObject type 'CaseHistory' is not supported."), { errorCode: "INVALID_TYPE" }));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(await caseStatusHistory(CASE_ID)).toEqual([]);
    warn.mockRestore();
  });

  it("ignores ids that are no Salesforce id", async () => {
    expect(await caseStatusHistory("../../etc")).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
