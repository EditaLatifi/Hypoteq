import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * A portal upload on a Funnel v3 Case passes the requirement id («vollmacht», «grundbuch») to
 * updateCaseCompleteness; it must tick the same Dokumenten-Check entries and Dok_*__c flags as
 * the v3 sync. The old Nachreichung still passes `funnel.*` keys. Salesforce is a fake here.
 */

const mockQuery = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockSfQuery = jest.fn<any>();
jest.mock("@/components/salesforceApi", () => ({
  conn: { accessToken: "token", query: (soql: string) => mockQuery(soql) },
  login: async () => {},
  sfQuery: (soql: string, context: string) => mockSfQuery(soql, context),
  updateCase: async (id: string, f: Record<string, unknown>) => mockUpdate({ ...f, Id: id }),
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

  it("sets the company and Eigenmittel flags HYPOTEQ added on 20.10.2026", async () => {
    await updateCaseCompleteness(CASE, { complete: false, missing: [], supplied: ["hr", "wb", "jahresabschluss", "steuer_jp", "vermoegen"], submissionId: "inq" });
    expect(written()).toMatchObject({
      Dok_Handelsregisterauszug__c: true,
      Dok_ID_Zeichnungsberechtigte__c: true,
      Dok_Jahresabschluesse__c: true,
      Dok_Steuererklaerung_Gesellschaft__c: true,
      Dok_Eigenmittelnachweis__c: true,
    });
    expect(written()).not.toHaveProperty("Dok_Identitaetsdokument__c");
    expect(written()).not.toHaveProperty("Dok_Steuererklaerung__c");
  });

  it("still takes the legacy funnel.* keys of the old Nachreichung", async () => {
    await updateCaseCompleteness(CASE, { complete: false, missing: [], supplied: ["funnel.rentalOverviewCurrent", "funnel.landRegistryNotOlder6Months"], submissionId: "inq" });
    expect(ticked()).toContain("Renditeobjekt|Aktueller Mieterspiegel inkl. Mietzinsaufstellung");
    expect(written().Dok_Grundbuchauszug__c).toBe(true);
  });
});

describe("test mode: only a ZZTEST Case, by its name (DECISIONS V102)", () => {
  const update = () => updateCaseCompleteness(CASE, { complete: true, missing: [], supplied: ["grundbuch"], submissionId: "inq" });
  afterEach(() => {
    delete process.env.HYPOTEQ_TEST_MODE;
  });

  it("outside test mode the Case is written without asking", async () => {
    await update();
    expect(mockSfQuery).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("test mode: written when Salesforce names the Case ZZTEST, not otherwise", async () => {
    process.env.HYPOTEQ_TEST_MODE = "1";
    mockSfQuery.mockResolvedValueOnce([{ Case_Name__c: "Muster, 8001 Zürich", Account: { Name: "Lea Muster" } }]);
    await update();
    expect(mockUpdate).not.toHaveBeenCalled();
    mockSfQuery.mockResolvedValueOnce([{ Case_Name__c: "ZZTEST Muster, 8001 Zürich", Account: { Name: "Lea ZZTEST Muster" } }]);
    await update();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSfQuery.mock.calls[1][0]).toContain(`WHERE Id = '${CASE}'`);
  });

  it("a Case that cannot be read counts as no test Case", async () => {
    process.env.HYPOTEQ_TEST_MODE = "1";
    mockSfQuery.mockRejectedValueOnce(new Error("INVALID_SESSION_ID"));
    await update();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
