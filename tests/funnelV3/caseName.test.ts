/**
 * HYPOTEQ 19.10. D.4: Case_Name__c is required when the Case is created, «{Nachname} {Vorname} –
 * {PLZ} {Ort}», a company «{Firma} – {PLZ} {Ort}» (DECISIONS V65). Every funnel Case — v5, the old
 * funnel, partner leads without a name. The Salesforce API is a fake.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("@/components/partnerDirectory", () => ({
  __esModule: true,
  resolvePartner: jest.fn(async () => ({ status: "unknown" })),
}));

import { funnelCaseName, syncFunnelStepsToSalesforce } from "@/components/syncFunnelStepsToSalesforce";
import { ablState, jurState, kaufState, v5Payload } from "./v5Fixtures";

function fakeApi() {
  const cases: any[] = [];
  return {
    cases,
    api: {
      findAccountByEmail: jest.fn(async () => null),
      createAccount: jest.fn(async () => ({ id: "001A" })),
      updatePersonAccount: jest.fn(async () => ({})),
      findAccountByName: jest.fn(async () => ({ Id: "001HYPOTEQ" })),
      findBusinessAccount: jest.fn(async () => null),
      createBusinessAccount: jest.fn(async () => ({ id: "001CO" })),
      createContact: jest.fn(async () => ({ id: "003C" })),
      createOrUpdateCase: jest.fn(async (d: any) => {
        cases.push(d);
        return { id: "500CASE" };
      }),
    },
  };
}
async function caseName(payload: any): Promise<string> {
  const sf = fakeApi();
  await syncFunnelStepsToSalesforce(payload, sf.api);
  return sf.cases[0].Case_Name__c;
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("funnelCaseName", () => {
  it("the format of the mapping", () => {
    expect(funnelCaseName({ nachname: "Muster", vorname: "Lea", plz: "8001", ort: "Zürich" })).toBe("Muster Lea – 8001 Zürich");
    expect(funnelCaseName({ firma: "Immo Beispiel AG", plz: "8400", ort: "Winterthur" })).toBe("Immo Beispiel AG – 8400 Winterthur");
  });

  it("missing parts are left out; never empty", () => {
    expect(funnelCaseName({ nachname: "Muster", vorname: "", plz: "", ort: "Zürich" })).toBe("Muster – Zürich");
    expect(funnelCaseName({ nachname: "Muster", vorname: "Lea" })).toBe("Muster Lea");
    expect(funnelCaseName({ plz: "8001", ort: "Zürich", submitter: "bea@partner.ch" })).toBe("Unvollständige Anfrage – 8001 Zürich");
    expect(funnelCaseName({ submitter: "bea@partner.ch" })).toBe("Unvollständige Anfrage – bea@partner.ch");
    expect(funnelCaseName({}, new Date("2026-10-19T08:00:00Z"))).toBe("Unvollständige Anfrage 2026-10-19");
  });
});

describe("every funnel Case gets it", () => {
  it("v5: Kunde, Berater, company, Kreditnehmer 1 names a Case of two", async () => {
    expect(await caseName(v5Payload(kaufState()))).toBe("Muster Lea – 8001 Zürich");
    expect(await caseName(v5Payload(ablState()))).toBe("Beispiel Marco – 3000 Bern");
    expect(await caseName(v5Payload(jurState()))).toBe("Immo Beispiel AG – 8400 Winterthur");
    const two = kaufState({ borrowers: [...kaufState().borrowers, { id: "b2", vor: "Tom", nach: "Muster", pkSe: "Nein" }] });
    expect(await caseName(v5Payload(two))).toBe("Muster Lea – 8001 Zürich");
  });

  it("a payload's own caseName does not change the format", async () => {
    const p = v5Payload(kaufState());
    p.caseName = "Irgendwas";
    expect(await caseName(p)).toBe("Muster Lea – 8001 Zürich");
  });

  it("the old funnel, and a partner lead without any borrower name", async () => {
    const legacy = {
      customerType: "direct",
      client: { firstName: "Lea", lastName: "Legacy", email: "lea@example.ch", phone: "079 000 00 00" },
      project: { projektArt: "kauf", borrowerType: "nat" },
      property: { zip: "8000", ort: "Zürich", kreditnehmer: [{ vorname: "Lea", name: "Legacy", email: "lea@example.ch", telefon: "079 000 00 00" }] },
      financing: { kaufpreis: "1000000" },
      borrowers: [{ type: "nat" }],
    };
    expect(await caseName(legacy)).toBe("Legacy Lea – 8000 Zürich");
    const anonymous = {
      customerType: "partner",
      client: { email: "bea@partner.ch" },
      partner: { email: "bea@partner.ch" },
      project: { projektArt: "abloesung" },
      property: { zip: "3000", ort: "Bern", kreditnehmer: [{}] },
      financing: { abloesung_betrag: "500000" },
      borrowers: [{ type: "nat" }],
    };
    expect(await caseName(anonymous)).toBe("Unvollständige Anfrage – 3000 Bern");
  });
});
