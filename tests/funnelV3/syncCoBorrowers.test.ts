import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { toInquiryPayload } from "@/lib/funnel-v3/toInquiryPayload";
import type { Borrower } from "@/lib/funnel-v3/types";
import { gerberState, SUBMISSION } from "./gerberCase";

/**
 * DECISIONS D18: v3 asks no e-mail or phone for Kreditnehmer 2 and 3. The sync must still
 * create (and link) a Person Account for each of them — by name, never matched to an existing
 * Account by name — while the legacy funnel keeps its e-mail rule.
 */

jest.mock("@/components/partnerDirectory", () => {
  const actual = jest.requireActual("@/components/partnerDirectory") as object;
  return { ...actual, resolvePartner: jest.fn(async () => ({ status: "unknown" })) };
});

function fakeSalesforce() {
  const accounts: any[] = [];
  const cases: any[] = [];
  let n = 0;
  return {
    accounts,
    cases,
    api: {
      findAccountByEmail: jest.fn(async (_email: string) => null as any),
      findAccountByName: jest.fn(async (_name: string) => ({ Id: "001HYPOTEQ" })),
      createAccount: jest.fn(async (data: any) => {
        accounts.push(data);
        return { id: `001P${++n}` };
      }),
      updatePersonAccount: jest.fn(async () => ({})),
      findContactByEmail: jest.fn(async () => null),
      soqlString: (v: string) => `'${v}'`,
      sfQuery: jest.fn(async () => []),
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

const b = (id: string, vor: string, nach: string, job: Borrower["job"] = "Angestellt"): Borrower => ({ id, vor, nach, job, pkSe: "Nein" });

function v3Payload(borrowers: Borrower[], role: "kunde" | "berater" = "kunde") {
  const state = gerberState({ borrowers, role });
  if (role === "berater") state.txt = { ...state.txt, bmail: "berater@partner.ch" };
  return toInquiryPayload(state, { locale: "de", submissionId: SUBMISSION, sharepointFolderId: "FOLDER" }) as any;
}

describe("Salesforce sync — v3 co-borrowers without e-mail (D18)", () => {
  it("creates a Person Account for borrowers 2 and 3 and links them as Client_2__c / Client_3__c", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(
      v3Payload([b("b1", "Gary", "Gerber"), b("b2", "Anna", "Gerber-Muster", "Selbständig"), b("b3", "Paul", "Gerber", "Pensioniert")]),
      sf.api
    );
    expect(sf.accounts).toHaveLength(3);
    expect(sf.accounts[0]).toMatchObject({ FirstName: "Gary", LastName: "Gerber", PersonEmail: "gary.gerber@example.ch" });
    expect(sf.accounts[1]).toMatchObject({ FirstName: "Anna", LastName: "Gerber-Muster" });
    expect(sf.accounts[2]).toMatchObject({ FirstName: "Paul", LastName: "Gerber" });
    // No e-mail, no phone invented for them.
    expect(sf.accounts[1]).not.toHaveProperty("PersonEmail");
    expect(sf.accounts[1]).not.toHaveProperty("Phone");
    expect(sf.accounts[1].Erwerbsstatus__c).toBeTruthy();
    // Only the main borrower is looked up, by e-mail; never by name.
    expect(sf.api.findAccountByEmail).toHaveBeenCalledTimes(1);
    expect(sf.api.findAccountByEmail).toHaveBeenCalledWith("gary.gerber@example.ch");
    expect(sf.api.findAccountByName).not.toHaveBeenCalledWith(expect.stringContaining("Gerber"));
    const c = sf.cases[0];
    expect(c.Client__c).toBe("001P1");
    expect(c.Client_2__c).toBe("001P2");
    expect(c.Client_3__c).toBe("001P3");
  });

  it("de-duplicates only within the submission (the same name twice is one Account)", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3Payload([b("b1", "Gary", "Gerber"), b("b2", "Anna", "Muster"), b("b3", " anna ", "MUSTER")]), sf.api);
    expect(sf.accounts.map((a) => a.FirstName)).toEqual(["Gary", "Anna"]);
    expect(sf.cases[0].Client_2__c).toBe("001P2");
    expect(sf.cases[0].Client_3__c).toBeNull();
  });

  it("skips a co-borrower without any name", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3Payload([b("b1", "Gary", "Gerber"), b("b2", "", "")]), sf.api);
    expect(sf.accounts).toHaveLength(1);
    expect(sf.cases[0].Client_2__c).toBeNull();
  });

  it("works for a Berater submission too", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(v3Payload([b("b1", "Gary", "Gerber"), b("b2", "Anna", "Muster")], "berater"), sf.api);
    expect(sf.accounts.map((a) => a.LastName)).toEqual(["Gerber", "Muster"]);
    expect(sf.cases[0].Client_2__c).toBe("001P2");
  });
});

describe("Salesforce sync — legacy co-borrowers unchanged", () => {
  const legacy = (kn: any[]) => ({
    customerType: "direct",
    client: { firstName: "Anna", lastName: "Muster", email: "anna@example.ch", phone: "079" },
    project: { projektArt: "kauf", borrowerType: "nat" },
    property: { zip: "8001", ort: "Zürich", kreditnehmer: kn },
    financing: { kaufpreis: "1000000" },
    borrowers: [{ type: "nat" }],
  });

  it("still drops a natural co-borrower without e-mail", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(
      legacy([
        { vorname: "Anna", name: "Muster", email: "anna@example.ch", telefon: "079 111 22 33" },
        { vorname: "Beat", name: "Muster", email: "", telefon: "" },
      ]),
      sf.api
    );
    expect(sf.accounts).toHaveLength(1);
    expect(sf.cases[0].Client_2__c).toBeNull();
  });

  it("still links a co-borrower with e-mail, looked up by that e-mail", async () => {
    const sf = fakeSalesforce();
    await syncFunnelStepsToSalesforce(
      legacy([
        { vorname: "Anna", name: "Muster", email: "anna@example.ch", telefon: "079 111 22 33" },
        { vorname: "Beat", name: "Muster", email: "beat@example.ch", telefon: "079 222 33 44" },
      ]),
      sf.api
    );
    expect(sf.api.findAccountByEmail).toHaveBeenCalledWith("beat@example.ch");
    expect(sf.cases[0].Client_2__c).toBe("001P2");
  });

  it("still rejects a co-borrower with e-mail but no phone", async () => {
    const sf = fakeSalesforce();
    await expect(
      syncFunnelStepsToSalesforce(
        legacy([
          { vorname: "Anna", name: "Muster", email: "anna@example.ch", telefon: "079 111 22 33" },
          { vorname: "Beat", name: "Muster", email: "beat@example.ch", telefon: "" },
        ]),
        sf.api
      )
    ).rejects.toThrow(/Person 2: Telephone is mandatory/);
  });
});
