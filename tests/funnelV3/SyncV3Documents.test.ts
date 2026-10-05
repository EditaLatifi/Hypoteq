import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import { buildDokumentenCheckState } from "@/components/dokumentenCheckState";
import { gerberFiles, gerberState, SUBMISSION } from "./gerberCase";

jest.mock("@/components/partnerDirectory", () => {
  const actual = jest.requireActual("@/components/partnerDirectory") as object;
  return { ...actual, resolvePartner: jest.fn(async () => ({ status: "unknown" })) };
});

/** In-memory stand-in for components/salesforceApi — nothing leaves the process. */
function fakeSalesforce(existingState: string | null = null) {
  const cases: any[] = [];
  const queries: string[] = [];
  let n = 0;
  return {
    cases,
    queries,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async () => ({ id: `001${++n}` })),
      updatePersonAccount: jest.fn(async () => ({})),
      findContactByEmail: jest.fn(async () => null),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      soqlString: (v: string) => `'${v}'`,
      sfQuery: jest.fn(async (soql: string) => {
        queries.push(soql);
        return existingState ? [{ Dokumenten_Check_State__c: existingState }] : [];
      }),
      createOrUpdateCase: jest.fn(async (data: any) => {
        cases.push(data);
        return { id: "500CASE" };
      }),
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

function v3Payload(files = gerberFiles()) {
  const state = gerberState();
  const docs = documentsSummary({ ...state, files });
  return toInquiryPayload(state, {
    locale: "de",
    submissionId: SUBMISSION,
    sharepointFolderId: "FOLDER",
    documents: docs.submittedDocuments(),
    documentCompleteness: { complete: docs.status.completeForSalesforce, missing: [], skipped: [] },
  }) as any;
}

describe("Salesforce sync — v3 document fields", () => {
  it("writes Dok_*, Documents_completed__c, the 6.11 state merged onto the Case's and SharePoint_Doc__c", async () => {
    const data = v3Payload();
    data.v3Completion = {
      folderWebUrl: "https://hypoteq.sharepoint.com/sites/x/ZZ-TEST_folder",
      files: gerberFiles().map((f) => ({
        documentId: f.documentId,
        originalName: f.name,
        storedName: f.instanceId === "grundbuch" ? "HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf" : null,
        url: null,
        instanceId: f.instanceId ?? null,
        requirementId: f.analysis?.requirementId ?? null,
        extraKind: f.instanceId ? undefined : f.analysis?.extraKind,
        outdatedOverride: f.outdatedOverride,
        removed: f.analysis?.extraKind === "duplicate",
        analysis: f.analysis,
      })),
    };
    const sf = fakeSalesforce(JSON.stringify({ checked: { "Ausweis Kopie": true }, filters: { x: 1 }, savedAt: "old" }));
    await syncFunnelStepsToSalesforce(data, sf.api);
    const c = sf.cases[0];
    expect(c.SharePoint_Doc__c).toBe("https://hypoteq.sharepoint.com/sites/x/ZZ-TEST_folder");
    expect(c.Documents_completed__c).toBe(true);
    expect(c.Dok_Identitaetsdokument__c).toBe(true);
    expect(c.Dok_Lohnausweis__c).toBe(true);
    expect(c.Dok_Fotos_der_Immobilie__c).toBe(true);
    expect(c.Dok_Grundbuchauszug__c).toBe(false);
    expect(c).not.toHaveProperty("Dok_Kaufvertrag__c");
    const state = JSON.parse(c.Dokumenten_Check_State__c);
    expect(state.version).toBe(1);
    expect(state.answers.antrag).toBe("Ablösung");
    expect(state.checked["Ausweis Kopie"]).toBe(true); // a caseworker's tick survives
    expect(state.filters).toEqual({ x: 1 });
    expect(state.requirements.find((r: any) => r.id === "grundbuch").files[0].storedName).toBe("HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf");
    expect(sf.queries[0]).toMatch(/SELECT Dokumenten_Check_State__c FROM Case WHERE AccountId = '0011'/);
  });

  it("without the closing result: from the submitted detail; incomplete when a required document is missing", async () => {
    const data = v3Payload(gerberFiles().filter((f) => f.instanceId !== "fotos"));
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(data, sf.api);
    const c = sf.cases[0];
    expect(c.Documents_completed__c).toBe(false);
    expect(c.Dok_Fotos_der_Immobilie__c).toBe(false);
    expect(c).not.toHaveProperty("SharePoint_Doc__c");
    expect(JSON.parse(c.Dokumenten_Check_State__c).requirements.find((r: any) => r.id === "fotos").status).toBe("missing");
  });
});

describe("Salesforce sync — legacy funnel unchanged", () => {
  const legacy = () => ({
    customerType: "direct",
    client: { firstName: "Anna", lastName: "Muster", email: "anna@example.ch", phone: "079" },
    project: { projektArt: "kauf", borrowerType: "nat" },
    property: { zip: "8001", ort: "Zürich", kreditnehmer: [{ vorname: "Anna", name: "Muster", email: "anna@example.ch", telefon: "079 111 22 33" }] },
    financing: { kaufpreis: "1000000" },
    borrowers: [{ type: "nat" }],
    documentCompleteness: {
      complete: false,
      missing: ["funnel.propertyPhotosInteriorExterior"],
      supplied: ["funnel.passportIDAllBorrowers"],
      salesforceFlags: { Dok_Grundbuchauszug__c: true, Dok_Fotos_der_Immobilie__c: false },
    },
  });

  it("writes the completeness exactly as before and none of the v3 fields", async () => {
    const sf = fakeSalesforce("should not be read");
    await syncFunnelStepsToSalesforce(legacy(), sf.api);
    const c = sf.cases[0];
    expect(c.Documents_completed__c).toBe(false);
    expect(c.Dok_Grundbuchauszug__c).toBe(true);
    expect(c.Dok_Fotos_der_Immobilie__c).toBe(false);
    const expected = JSON.parse(buildDokumentenCheckState(["funnel.passportIDAllBorrowers"])!);
    const got = JSON.parse(c.Dokumenten_Check_State__c);
    expect(got.checked).toEqual(expected.checked);
    expect(got).not.toHaveProperty("version");
    expect(c).not.toHaveProperty("SharePoint_Doc__c");
    expect(sf.queries).toEqual([]);
  });
});
