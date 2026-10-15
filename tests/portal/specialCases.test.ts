/**
 * A Spezialfinanzierung created by the portal wizard is an ordinary Case in Salesforce. The
 * portal tells it apart by its PortalSpecialRequest row: it shows «Spezialfinanzierung ·
 * <Typ>» as its Art and no standard mortgage document list (HYPOTEQ assesses it
 * individually). Before the table exists, Cases must still load.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const mockSpecials = jest.fn<any>();

jest.mock("@/components/salesforceApi", () => ({
  conn: {
    accessToken: "token",
    query: async (soql: string) => (/FROM Case\b/.test(soql) ? { records: [CASE] } : { records: [] }),
    sobject: () => ({ describe: async () => ({ fields: [] }) }),
  },
  login: async () => {},
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    inquiry: { findMany: async () => [] },
    portalUpload: { findMany: async () => [] },
    portalSpecialRequest: { findMany: (a: any) => mockSpecials(a) },
  },
}));

const CASE = {
  Id: "500000000000001AAA",
  CaseNumber: "00012345",
  Status: "New",
  Stage__c: "Needs Analysis",
  Reason: null,
  Case_Name__c: "Muster Immobilien AG",
  Gesch_tzter_Hypothekenbedarf__c: 2500000,
  CreatedDate: "2026-10-15T08:00:00.000Z",
  LastModifiedDate: "2026-10-15T08:00:00.000Z",
};

import { listPartnerCases } from "@/lib/portal/salesforce";

const scope = { contactId: "003000000000001AAA", accountId: null, companyWide: false };

describe("Spezialfinanzierung Cases in the portal", () => {
  beforeEach(() => mockSpecials.mockReset());

  it("show their Art and no standard document list", async () => {
    mockSpecials.mockResolvedValue([{ sfCaseId: CASE.Id, type: "rendite" }]);
    const [c] = await listPartnerCases(scope, "de");
    expect(c.art).toBe("Spezialfinanzierung · Renditeobjekt");
    expect(c.missingDocs).toEqual([]);
    expect(c.openDocs).toEqual([]);
  });

  it("still load, as ordinary Cases, while the table does not exist", async () => {
    mockSpecials.mockRejectedValue(new Error('relation "PortalSpecialRequest" does not exist'));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const [c] = await listPartnerCases(scope, "de");
    expect(c.id).toBe(CASE.Id);
    expect(c.art).not.toMatch(/Spezialfinanzierung/);
    warn.mockRestore();
  });
});
