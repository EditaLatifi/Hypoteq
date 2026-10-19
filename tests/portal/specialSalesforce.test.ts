import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

// Nothing here may reach Salesforce or the database: the live connection and Prisma are
// replaced, and every Salesforce call goes through the fake below.
jest.mock("@/components/salesforceApi", () => {
  const soqlString = (v: string) => `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return { __esModule: true, conn: {}, createOrUpdateCase: jest.fn(), ensureSession: jest.fn(), sfQuery: jest.fn(), soqlString, takeDroppedFields: () => [], withSessionRetry: jest.fn() };
});
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  createSpecialCase,
  resetSpecialRecordTypeCache,
  specialCaseFields,
  specialDescription,
  specialRecordTypeId,
  specialSubject,
  type SpecialCaseInput,
  type SpecialSfApi,
} from "@/lib/portal/specialSalesforce";
import { EMPTY_ANSWERS, type ValidSpecialAnswers } from "@/lib/portal/special";

const CONTACT = "003AAAAAAAAAAAAAAA";
const ACCOUNT = "001BBBBBBBBBBBBBBB";
const RT = "012CCCCCCCCCCCCCCC";
const CASE = "500DDDDDDDDDDDDDDD";

const ANSWERS: ValidSpecialAnswers = {
  ...EMPTY_ANSWERS,
  type: "mezzanine",
  kundeTyp: "firma",
  kunde: "Muster Immobilien AG",
  ort: "8400 Winterthur",
  kontakt: "info@muster.ch",
  eigenmittel: "CHF 400'000",
  betrag: "2'500'000",
  objekt: "MFH, Uster",
  zeitrahmen: "asap",
  beschreibung: "Eigenmittellücke von CHF 300'000 beim Kauf eines MFH.",
};

const INPUT: SpecialCaseInput = {
  requestId: "3f9a1c2b-0000-4000-8000-000000000000",
  answers: ANSWERS,
  amount: 2500000,
  partner: { contactId: CONTACT, accountId: ACCOUNT, name: "Daniel Meier", company: "Meier Finanzberatung GmbH", email: "d.meier@meier-finanz.ch" },
  fileNames: ["Finanzierungsübersicht.pdf", "Mieterspiegel.xlsx"],
  folderUrl: "https://sharepoint.example/folder",
};

/** A Salesforce that answers like the org, and remembers what it was asked. */
function fakeApi(opts: Partial<Pick<SpecialSfApi, "query" | "createCase">> & { recordTypes?: any[]; available?: boolean; dropped?: string[] } = {}) {
  const { recordTypes, available, dropped: droppedFields, ...over } = opts;
  const calls = { queries: [] as string[], creates: [] as Record<string, unknown>[], describes: 0 };
  let dropped = droppedFields || [];
  const api: SpecialSfApi = {
    query: async (soql) => {
      calls.queries.push(soql);
      if (soql.includes("FROM RecordType")) return recordTypes ?? [{ Id: RT, DeveloperName: "Spezialfinanzierung", Name: "Spezialfinanzierung" }];
      if (soql.includes("SELECT CaseNumber")) return [{ CaseNumber: "00001421" }];
      return [];
    },
    describeCase: async () => {
      calls.describes++;
      return { recordTypeInfos: [{ recordTypeId: RT, available: available ?? true }] };
    },
    createCase: async (fields) => {
      calls.creates.push(fields);
      return { id: CASE };
    },
    dropped: () => {
      const out = dropped;
      dropped = [];
      return out;
    },
    ...over,
  };
  return { api, calls };
}

const ENV = { ...process.env };
beforeEach(() => {
  // The fallbacks log on purpose; the tests check behaviour, not the log.
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  resetSpecialRecordTypeCache();
  delete process.env.PORTAL_SF_PARTNER_FIELD;
  delete process.env.PORTAL_SF_SPECIAL_RECORD_TYPE;
  delete process.env.PORTAL_SF_SPECIAL_OWNER_ID;
  delete process.env.SF_SALES_PARTNER_FIELD;
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe("specialCaseFields", () => {
  it("puts the Case on the partner the way the funnel does, with the wizard's answers", () => {
    const f = specialCaseFields(INPUT);
    expect(f).toEqual({
      Subject: "Spezialfinanzierung · Mezzanine-Finanzierung – Muster Immobilien AG",
      Description: expect.any(String),
      Case_Name__c: "Muster Immobilien AG",
      Status: "New",
      Stage__c: "Needs Analysis",
      Gesch_tzter_Hypothekenbedarf__c: 2500000,
      Partner_Consultant__c: CONTACT,
      Account__c: ACCOUNT,
      Eigenmittel__c: 400000,
      SharePoint_Doc__c: "https://sharepoint.example/folder",
    });
    // Case.Reason keeps its own values (DECISIONS P14); no customer Account is invented.
    expect(f).not.toHaveProperty("Reason");
    expect(f).not.toHaveProperty("AccountId");
  });

  it("leaves Eigenmittel out when it is not a plain amount, and the folder when there is none", () => {
    const f = specialCaseFields({ ...INPUT, answers: { ...ANSWERS, eigenmittel: "ca. 20 %" }, folderUrl: null });
    expect(f).not.toHaveProperty("Eigenmittel__c");
    expect(f).not.toHaveProperty("SharePoint_Doc__c");
  });

  it("follows the configured field names and owner; Portal_Visible__c is an Account field, never set on the Case", () => {
    process.env.PORTAL_SF_PARTNER_FIELD = "Berater__c";
    process.env.SF_SALES_PARTNER_FIELD = "Sales_Partner__c";
    process.env.PORTAL_SF_VISIBLE_FIELD = "Portal_Visible__c";
    process.env.PORTAL_SF_SPECIAL_OWNER_ID = "00GEEEEEEEEEEEEEEE";
    const f = specialCaseFields(INPUT);
    expect(f.Berater__c).toBe(CONTACT);
    expect(f.Sales_Partner__c).toBe(ACCOUNT);
    expect(f).not.toHaveProperty("Portal_Visible__c");
    expect(f.OwnerId).toBe("00GEEEEEEEEEEEEEEE");
    expect(f).not.toHaveProperty("Partner_Consultant__c");
  });

  it("skips a partner Account that is not a Salesforce Id", () => {
    const f = specialCaseFields({ ...INPUT, partner: { ...INPUT.partner, accountId: null } });
    expect(f).not.toHaveProperty("Account__c");
  });

  it("keeps the Subject within Salesforce's 255 characters", () => {
    expect(specialSubject({ ...ANSWERS, kunde: "X".repeat(300) })).toHaveLength(255);
  });

  it("writes every answer into the description, in German", () => {
    const d = specialDescription(INPUT);
    expect(d).toContain("Referenz SP-3F9A1C");
    expect(d).toContain("Art: Mezzanine-Finanzierung");
    expect(d).toContain("Endkunde: Muster Immobilien AG · Unternehmen");
    expect(d).toContain("Finanzierungsbetrag: CHF 2'500'000");
    expect(d).toContain("Zeitrahmen: So rasch wie möglich");
    expect(d).toContain("Eigenmittellücke von CHF 300'000");
    expect(d).toContain("Dokumente: Finanzierungsübersicht.pdf, Mieterspiegel.xlsx");
    expect(d).toContain("Eingereicht von: Daniel Meier (Meier Finanzberatung GmbH), d.meier@meier-finanz.ch");
  });
});

describe("specialRecordTypeId", () => {
  it("looks the record type up by DeveloperName or Name and keeps a hit", async () => {
    const { api, calls } = fakeApi();
    expect(await specialRecordTypeId(api)).toBe(RT);
    expect(calls.queries[0]).toContain("SobjectType = 'Case' AND IsActive = true");
    expect(calls.queries[0]).toContain("DeveloperName = 'Spezialfinanzierung' OR Name = 'Spezialfinanzierung'");
    expect(await specialRecordTypeId(api)).toBe(RT);
    expect(calls.queries).toHaveLength(1);
  });

  it("uses the configured name, with a DeveloperName Salesforce would accept", async () => {
    process.env.PORTAL_SF_SPECIAL_RECORD_TYPE = "Spezial Finanzierung";
    const { api, calls } = fakeApi();
    await specialRecordTypeId(api);
    expect(calls.queries[0]).toContain("DeveloperName = 'Spezial_Finanzierung' OR Name = 'Spezial Finanzierung'");
  });

  it("falls back to the default when the integration user may not use it", async () => {
    const { api } = fakeApi({ available: false });
    expect(await specialRecordTypeId(api)).toBeNull();
  });

  it("asks again after a while when there is none, so creating it needs no deploy", async () => {
    const { api, calls } = fakeApi({ recordTypes: [] });
    const t0 = 1_000_000;
    expect(await specialRecordTypeId(api, t0)).toBeNull();
    expect(await specialRecordTypeId(api, t0 + 60_000)).toBeNull();
    expect(calls.queries).toHaveLength(1);
    await specialRecordTypeId(api, t0 + 11 * 60_000);
    expect(calls.queries).toHaveLength(2);
  });

  it("does not remember a failed lookup", async () => {
    let fail = true;
    const { api, calls } = fakeApi({
      query: async (soql) => {
        calls.queries.push(soql);
        if (fail) throw new Error("REQUEST_LIMIT_EXCEEDED");
        return [{ Id: RT }];
      },
    });
    expect(await specialRecordTypeId(api)).toBeNull();
    fail = false;
    expect(await specialRecordTypeId(api)).toBe(RT);
  });
});

describe("createSpecialCase", () => {
  it("creates the Case with the special record type and reads its number", async () => {
    const { api, calls } = fakeApi();
    const r = await createSpecialCase({ Subject: "x" }, api);
    expect(calls.creates).toEqual([{ Subject: "x", RecordTypeId: RT }]);
    expect(r).toEqual({ caseId: CASE, caseNr: "00001421", recordType: "special", dropped: [], linked: true });
  });

  it("uses the default record type when the org has none (DECISIONS P5)", async () => {
    const { api, calls } = fakeApi({ recordTypes: [] });
    const r = await createSpecialCase({ Subject: "x" }, api);
    expect(calls.creates).toEqual([{ Subject: "x" }]);
    expect(r.recordType).toBe("default");
  });

  it("retries without the record type when Salesforce refuses the Case with it", async () => {
    const creates: Record<string, unknown>[] = [];
    const { api } = fakeApi({
      createCase: async (fields) => {
        creates.push(fields);
        if (fields.RecordTypeId) throw Object.assign(new Error("bad record type"), { errorCode: "FIELD_INTEGRITY_EXCEPTION" });
        return { id: CASE };
      },
    });
    const r = await createSpecialCase({ Subject: "x" }, api);
    expect(creates).toEqual([{ Subject: "x", RecordTypeId: RT }, { Subject: "x" }]);
    expect(r.recordType).toBe("default");
  });

  it("reports a Case the partner was not put on, so the portal does not send them to it", async () => {
    const { api } = fakeApi({ dropped: ["Case.Partner_Consultant__c (INVALID_FIELD)"] });
    const r = await createSpecialCase({ Subject: "x" }, api);
    expect(r.linked).toBe(false);
    expect(r.dropped).toEqual(["Case.Partner_Consultant__c (INVALID_FIELD)"]);
  });

  it("throws when Salesforce returns no Case, so the caller keeps the request", async () => {
    const { api } = fakeApi({ recordTypes: [], createCase: async () => ({ id: null }) });
    await expect(createSpecialCase({ Subject: "x" }, api)).rejects.toThrow("no Case Id");
  });
});
