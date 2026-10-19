/**
 * components/salesforceApi.ts, the company functions of HYPOTEQ 19.10. B16 (DECISIONS V63), on a
 * fake jsforce connection: the record type resolved at runtime (never hardcoded), the lookups by
 * UID and by Name, the Contact lookup on the Account and the writes. Nothing leaves the process:
 * the connection is a stub and `fetch` (the OAuth login) throws if anything tried it.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockConn: any = {
  accessToken: "test-session",
  queries: [] as string[],
  answers: [] as ((soql: string) => any)[],
  creates: [] as { type: string; fields: any }[],
  describe: jest.fn(async () => ({ recordTypeInfos: [] as any[] })),
  async query(soql: string) {
    this.queries.push(soql);
    const answer = this.answers.shift();
    const out = answer ? answer(soql) : { records: [] };
    if (out instanceof Error) throw out;
    return out;
  },
  sobject(type: string) {
    return {
      create: async (fields: any) => {
        mockConn.creates.push({ type, fields });
        return { id: type === "Contact" ? "003NEW" : "001NEW", success: true };
      },
      describe: mockConn.describe,
    };
  },
};

jest.mock("jsforce", () => ({ Connection: jest.fn(() => mockConn) }));

import { accountUidField, createBusinessAccount, createContact, findBusinessAccount, findContactOnAccount, pickBusinessRecordType, uidSpellings } from "@/components/salesforceApi";

beforeEach(() => {
  mockConn.queries = [];
  mockConn.answers = [];
  mockConn.creates = [];
  (globalThis as any).fetch = async () => {
    throw new Error("no network in tests");
  };
  delete process.env.SF_ACCOUNT_UID_FIELD;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("UID", () => {
  it("both spellings an org may hold; anything else is no UID", () => {
    expect(uidSpellings("CHE-123.456.789")).toEqual({ canonical: "CHE-123.456.789", compact: "CHE123456789" });
    expect(uidSpellings("che 123 456 789 MWST")).toEqual({ canonical: "CHE-123.456.789", compact: "CHE123456789" });
    expect(uidSpellings("123.456.789")).toBeNull();
    expect(uidSpellings(undefined)).toBeNull();
  });

  it("the field is configurable and must be a plain API name (it goes into SOQL)", () => {
    expect(accountUidField()).toBe("UID__c");
    process.env.SF_ACCOUNT_UID_FIELD = "UID_Nummer__c";
    expect(accountUidField()).toBe("UID_Nummer__c");
    process.env.SF_ACCOUNT_UID_FIELD = "Name = 'x' OR Id";
    expect(accountUidField()).toBeNull();
  });
});

describe("pickBusinessRecordType", () => {
  const rows = [
    { Id: "012A00000000001AAA", DeveloperName: "Partner" },
    { Id: "012A00000000002AAA", DeveloperName: "Business_Account" },
  ];
  it("prefers DeveloperName Business_Account", () => {
    expect(pickBusinessRecordType(rows)).toBe("012A00000000002AAA");
  });
  it("else the running user's default among them, else the first one the user may use", () => {
    const others = [{ Id: "012A00000000001AAA", DeveloperName: "Partner" }, { Id: "012A00000000003AAA", DeveloperName: "Firma" }];
    expect(pickBusinessRecordType(others, [{ recordTypeId: "012A00000000003AAA", available: true, defaultRecordTypeMapping: true }])).toBe("012A00000000003AAA");
    expect(pickBusinessRecordType(others, [{ recordTypeId: "012A00000000001AAA", available: false }])).toBe("012A00000000003AAA");
  });
  it("none → null: the create goes without RecordTypeId (the org's default, a business Account)", () => {
    expect(pickBusinessRecordType([])).toBeNull();
  });
});

describe("findBusinessAccount", () => {
  it("by UID first (both spellings, never a Person Account, the oldest)", async () => {
    mockConn.answers.push(() => ({ records: [{ Id: "001UID", Name: "Immo Beispiel AG" }] }));
    expect(await findBusinessAccount({ uid: "CHE-123.456.789", name: "Immo Beispiel AG" })).toEqual({ Id: "001UID", Name: "Immo Beispiel AG", matchedBy: "uid" });
    expect(mockConn.queries).toEqual([
      "SELECT Id, Name FROM Account WHERE IsPersonAccount = false AND UID__c IN ('CHE-123.456.789', 'CHE123456789') ORDER BY CreatedDate ASC LIMIT 1",
    ]);
  });

  it("else by exactly the same Name", async () => {
    mockConn.answers.push(() => ({ records: [] }), () => ({ records: [{ Id: "001NAME", Name: "Immo Beispiel AG" }] }));
    expect(await findBusinessAccount({ uid: "CHE-123.456.789", name: " Immo Beispiel AG " })).toEqual({ Id: "001NAME", Name: "Immo Beispiel AG", matchedBy: "name" });
    expect(mockConn.queries[1]).toBe("SELECT Id, Name FROM Account WHERE IsPersonAccount = false AND Name = 'Immo Beispiel AG' ORDER BY CreatedDate ASC LIMIT 1");
  });

  it("an org without the UID field: by Name only; other errors propagate (no duplicate on a failed lookup)", async () => {
    mockConn.answers.push(
      () => Object.assign(new Error("No such column 'UID__c' on entity 'Account'"), { errorCode: "INVALID_FIELD" }),
      () => ({ records: [] })
    );
    expect(await findBusinessAccount({ uid: "CHE-123.456.789", name: "O'Brien AG" })).toBeNull();
    expect(mockConn.queries[1]).toContain("Name = 'O\\'Brien AG'");
    mockConn.answers.push(() => Object.assign(new Error("Server unavailable"), { errorCode: "SERVER_UNAVAILABLE" }));
    await expect(findBusinessAccount({ name: "X AG" })).rejects.toThrow("Server unavailable");
  });
});

describe("createBusinessAccount", () => {
  it("resolves the non-person record type at runtime and writes Name, Phone, UID, Sitz", async () => {
    mockConn.answers.push((soql: string) => {
      expect(soql).toBe("SELECT Id, DeveloperName FROM RecordType WHERE SobjectType = 'Account' AND IsPersonType = false AND IsActive = true");
      return { records: [{ Id: "012BUSINESS0000AAA", DeveloperName: "Business_Account" }] };
    });
    const res = await createBusinessAccount({ name: "Immo Beispiel AG", phone: "044 555 66 77", uid: "che123456789", sitz: "Winterthur" });
    expect(res).toMatchObject({ id: "001NEW" });
    expect(mockConn.creates).toEqual([
      { type: "Account", fields: { Name: "Immo Beispiel AG", RecordTypeId: "012BUSINESS0000AAA", Phone: "044 555 66 77", UID__c: "CHE-123.456.789", BillingCity: "Winterthur" } },
    ]);
    // Cached per instance: a second company asks no second time.
    await createBusinessAccount({ name: "Zweite AG" });
    expect(mockConn.queries.filter((q: string) => q.includes("FROM RecordType"))).toHaveLength(1);
    expect(mockConn.creates[1].fields).toEqual({ Name: "Zweite AG", RecordTypeId: "012BUSINESS0000AAA" });
  });
});

describe("Contacts", () => {
  it("found on that Account by e-mail, else by first and last name", async () => {
    mockConn.answers.push(() => ({ records: [{ Id: "003EXIST" }] }));
    expect(await findContactOnAccount("001ACC", { email: "petra@immo.ch", firstName: "Petra", lastName: "Beispiel" })).toEqual({ Id: "003EXIST" });
    expect(mockConn.queries[0]).toBe("SELECT Id FROM Contact WHERE AccountId = '001ACC' AND Email = 'petra@immo.ch' ORDER BY CreatedDate ASC LIMIT 1");
    expect(await findContactOnAccount("001ACC", { firstName: "Petra", lastName: "Beispiel" })).toBeNull();
    expect(mockConn.queries[1]).toBe("SELECT Id FROM Contact WHERE AccountId = '001ACC' AND LastName = 'Beispiel' AND FirstName = 'Petra' ORDER BY CreatedDate ASC LIMIT 1");
    expect(await findContactOnAccount("001ACC", {})).toBeNull();
    expect(mockConn.queries).toHaveLength(2);
  });

  it("created on the Account", async () => {
    await createContact({ AccountId: "001ACC", LastName: "Beispiel" });
    expect(mockConn.creates).toEqual([{ type: "Contact", fields: { AccountId: "001ACC", LastName: "Beispiel" } }]);
  });
});
