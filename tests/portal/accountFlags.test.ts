import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * Partner control on the Account (HYPOTEQ 19.10.2026 B25 / D.1): Portal_Access__c,
 * Portal_Visible__c and Send_Notification__c are read defensively and only enforced with
 * PORTAL_ENFORCE_ACCOUNT_FLAGS=on (DECISIONS P26). Salesforce is a fake here.
 */

const mockQuery = jest.fn<any>();
const mockDescribe = jest.fn<any>();
jest.mock("@/components/salesforceApi", () => ({
  conn: { accessToken: "token", query: (soql: string) => mockQuery(soql), sobject: (name: string) => ({ describe: () => mockDescribe(name) }) },
  login: async () => {},
}));
const mockDb = {
  inquiry: { findMany: jest.fn<any>() },
  portalUpload: { findMany: jest.fn<any>() },
  portalSpecialRequest: { findMany: jest.fn<any>() },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import { accountPortalFlags, listPartnerCases, portalAccessRefused, portalFieldReport, resetSalesforceCaches } from "@/lib/portal/salesforce";

const ACCOUNT = "001BBBBBBBBBBBBBBB";
const CONTACT = "003AAAAAAAAAAAAAAA";
const SCOPE = { contactId: CONTACT, accountId: ACCOUNT, companyWide: false };

const ACCOUNT_FIELDS = ["Id", "Name", "Portal_Access__c", "Portal_Visible__c", "Send_Notification__c"];
const CASE_FIELDS = ["Id", "CaseNumber", "Portal_Status__c", "Partner_Action_Required__c"];

let account: Record<string, unknown> = {};
let queries: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  resetSalesforceCaches();
  queries = [];
  account = { Portal_Access__c: false, Portal_Visible__c: false, Send_Notification__c: true };
  delete process.env.PORTAL_ENFORCE_ACCOUNT_FLAGS;
  mockDescribe.mockImplementation(async (name: string) => ({ fields: (name === "Account" ? ACCOUNT_FIELDS : name === "Case" ? CASE_FIELDS : ["Id"]).map((n) => ({ name: n })) }));
  mockQuery.mockImplementation(async (soql: string) => {
    queries.push(soql);
    if (soql.includes("FROM Account WHERE Name")) return { records: [] }; // HYPOTEQ AG
    if (soql.includes("FROM Account")) return { records: [account] };
    if (soql.includes("FROM Case")) return { records: [{ Id: "500CCCCCCCCCCCCCCC", CaseNumber: "1", Portal_Status__c: "Angebot liegt vor", Partner_Action_Required__c: true }] };
    return { records: [] };
  });
  mockDb.inquiry.findMany.mockResolvedValue([]);
  mockDb.portalUpload.findMany.mockResolvedValue([]);
  mockDb.portalSpecialRequest.findMany.mockResolvedValue([]);
});
afterEach(() => {
  delete process.env.PORTAL_ENFORCE_ACCOUNT_FLAGS;
});

describe("accountPortalFlags", () => {
  it("reads the three checkboxes of the partner's Account", async () => {
    expect(await accountPortalFlags(ACCOUNT)).toEqual({ access: false, visible: false, notify: true });
    expect(queries.find((q) => q.includes("FROM Account WHERE Id"))).toContain("Portal_Access__c, Portal_Visible__c, Send_Notification__c");
  });
  it("leaves out a field the org does not have, and asks nothing without an Account", async () => {
    mockDescribe.mockImplementation(async () => ({ fields: [{ name: "Id" }, { name: "Send_Notification__c" }] }));
    expect(await accountPortalFlags(ACCOUNT)).toEqual({ access: null, visible: null, notify: true });
    expect(await accountPortalFlags(null)).toEqual({ access: null, visible: null, notify: null });
  });
  it("never throws: Salesforce down means no flags", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error("REQUEST_LIMIT_EXCEEDED"));
    expect(await accountPortalFlags(ACCOUNT)).toEqual({ access: null, visible: null, notify: null });
  });
});

describe("enforcement is opt-in (a fresh checkbox is false for every partner)", () => {
  const partner = { role: "partner", sfAccountId: ACCOUNT };

  it("by default an unticked Portal_Access__c refuses nobody and hides nothing", async () => {
    expect(await portalAccessRefused(partner)).toBe(false);
    expect(await listPartnerCases(SCOPE)).toHaveLength(1);
  });

  it("with PORTAL_ENFORCE_ACCOUNT_FLAGS=on: no login, no Cases", async () => {
    process.env.PORTAL_ENFORCE_ACCOUNT_FLAGS = "on";
    expect(await portalAccessRefused(partner)).toBe(true);
    expect(await listPartnerCases(SCOPE)).toEqual([]);
    expect(queries.some((q) => q.includes("FROM Case"))).toBe(false);
  });

  it("…but never refuses an admin, nor anyone when the boxes are ticked", async () => {
    process.env.PORTAL_ENFORCE_ACCOUNT_FLAGS = "on";
    expect(await portalAccessRefused({ role: "admin", sfAccountId: ACCOUNT })).toBe(false);
    account = { Portal_Access__c: true, Portal_Visible__c: true, Send_Notification__c: true };
    expect(await portalAccessRefused(partner)).toBe(false);
    expect(await listPartnerCases(SCOPE)).toHaveLength(1);
  });

  it("does not filter Cases on a Case-level visibility field any more", async () => {
    await listPartnerCases(SCOPE);
    expect(queries.find((q) => q.includes("FROM Case"))).not.toMatch(/Portal_Visible__c/);
  });
});

describe("portalFieldReport (admin partner page)", () => {
  it("shows the Account checkboxes and counts the Case fields", async () => {
    const rows = await portalFieldReport(SCOPE);
    expect(rows).toEqual([
      { field: "Portal_Access__c", object: "Account", value: "false" },
      { field: "Portal_Visible__c", object: "Account", value: "false" },
      { field: "Send_Notification__c", object: "Account", value: "true" },
      { field: "Portal_Status__c", object: "Case", counts: { hit: 1, total: 1, values: ["Angebot liegt vor"] } },
      { field: "Partner_Action_Required__c", object: "Case", counts: { hit: 1, total: 1, values: [] } },
    ]);
  });
  it("says «not there» for a field the org lacks", async () => {
    mockDescribe.mockImplementation(async () => ({ fields: [{ name: "Id" }] }));
    const rows = await portalFieldReport(SCOPE);
    expect(rows.every((r) => r.object === null)).toBe(true);
  });
});
