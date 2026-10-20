import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * A portal upload on a Funnel v3 Case passes the requirement id («vollmacht», «grundbuch») to
 * updateCaseCompleteness; it must tick the same Dokumenten-Check entries and Dok_*__c flags as
 * the v3 sync. The old Nachreichung still passes `funnel.*` keys. Salesforce is a fake here.
 */

const mockQuery = jest.fn<any>();
const mockUpdate = jest.fn<any>();
jest.mock("@/components/salesforceApi", () => ({
  conn: { accessToken: "token", query: (soql: string) => mockQuery(soql), sobject: () => ({ update: (f: unknown) => mockUpdate(f) }) },
  login: async () => {},
  updateCase: async () => {},
}));

import { updateCaseCompleteness } from "@/components/updateCaseCompleteness";

const CASE = "500AAAAAAAAAAAAAAA";
const written = () => mockUpdate.mock.calls[0][0] as Record<string, any>;
const ticked = () => Object.keys(JSON.parse(written().Dokumenten_Check_State__c).checked);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.HYPOTEQ_TEST_MODE;
  mockQuery.mockResolvedValue({ records: [{ Dokumenten_Check_State__c: JSON.stringify({ checked: { "Falls reserviert|Reservationsvertrag": true } }) }] });
  mockUpdate.mockResolvedValue({ success: true });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("updateCaseCompleteness", () => {
  it("ticks the tab entry of a v3 requirement id and keeps the caseworker's ticks", async () => {
    await updateCaseCompleteness(CASE, { complete: false, missing: ["grundbuch"], supplied: ["vollmacht"], submissionId: "inq" });
    expect(ticked()).toEqual(["Falls reserviert|Reservationsvertrag", "Grundlegende Unterlagen|HYPOTEQ-Formular Auskunftsermächtigung"]);
    expect(written().Documents_completed__c).toBe(false);
  });

  it("sets the Dok_*__c flag of a v3 requirement id", async () => {
    await updateCaseCompleteness(CASE, { complete: true, missing: [], supplied: ["grundbuch"], submissionId: "inq" });
    expect(written()).toMatchObject({ Id: CASE, Documents_completed__c: true, Dok_Grundbuchauszug__c: true });
  });

  it("reports a v3 document the tab has no entry for by its own id", async () => {
    await updateCaseCompleteness(CASE, { complete: false, missing: [], supplied: ["hr"], submissionId: "inq" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/will not appear in the tab: hr$/));
  });

  it("still takes the legacy funnel.* keys of the old Nachreichung", async () => {
    await updateCaseCompleteness(CASE, { complete: false, missing: [], supplied: ["funnel.rentalOverviewCurrent", "funnel.landRegistryNotOlder6Months"], submissionId: "inq" });
    expect(ticked()).toContain("Renditeobjekt|Aktueller Mieterspiegel inkl. Mietzinsaufstellung");
    expect(written().Dok_Grundbuchauszug__c).toBe(true);
  });
});
