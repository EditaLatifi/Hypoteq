import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * Portal_Meldung__c (HYPOTEQ 20.10.2026): the integration user cannot create Tasks, so the portal
 * writes a Meldung and HYPOTEQ's Flow makes the Task. Typ__c is a required picklist whose exact
 * values are the org's: they are read once (describe) and matched loosely; without them the
 * German label is written. Salesforce is a fake.
 */

jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => any) => op() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPortalMeldung, meldungRecord, pickTypValue, resetMeldungTypCache, type MeldungInput } from "@/lib/portal/meldung";
import type { SfConnection } from "@/lib/portal/changeRequests";

const CASE = "500DDDDDDDDDDDDDDD";
const ACCOUNT = "001PPPPPPPPPPPPPPP";
const INPUT: MeldungInput = { typ: "case_nachricht", betreff: "Portal-Nachricht: Hallo", beschreibung: "Hallo HYPOTEQ", partnerEmail: "p@x.ch", partnerAccountId: ACCOUNT, caseId: CASE };

function fakeSf(values: string[] | null) {
  const creates: Record<string, unknown>[] = [];
  let describes = 0;
  const sf: SfConnection = {
    query: async () => ({ records: [] }),
    sobject: () => ({
      create: async (record) => {
        creates.push(record);
        return { id: "a0XMELDUNG0000000A", success: true };
      },
      ...(values
        ? {
            describe: async () => {
              describes++;
              return { fields: [{ name: "Typ__c", picklistValues: values.map((value) => ({ value, active: true })) }] };
            },
          }
        : {}),
    }),
  };
  return { sf, creates, describes: () => describes };
}

beforeEach(() => {
  resetMeldungTypCache();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Typ__c", () => {
  it("takes the org's spelling of each type", () => {
    const org = ["Frage", "Fehler", "Wunsch", "Aenderungsantrag", "Case Nachricht"];
    expect(pickTypValue(org, "aenderungsantrag")).toBe("Aenderungsantrag");
    expect(pickTypValue(org, "case_nachricht")).toBe("Case Nachricht");
    expect(pickTypValue(org, "fehler")).toBe("Fehler");
    expect(pickTypValue(["Änderungsantrag", "Case-Nachricht"], "aenderungsantrag")).toBe("Änderungsantrag");
  });

  it("falls back to the German label when the values are unknown", () => {
    expect(pickTypValue([], "case_nachricht")).toBe("Case-Nachricht");
    expect(pickTypValue([], "aenderungsantrag")).toBe("Änderungsantrag");
  });

  it("reads the values once per instance", async () => {
    const { sf, creates, describes } = fakeSf(["Frage", "Fehler", "Wunsch", "Änderungsantrag", "Case Nachricht"]);
    await createPortalMeldung(sf, INPUT);
    await createPortalMeldung(sf, { ...INPUT, typ: "frage" });
    expect(describes()).toBe(1);
    expect(creates.map((c) => c.Typ__c)).toEqual(["Case Nachricht", "Frage"]);
  });
});

describe("the record", () => {
  it("has the agreed fields, lookups only as Ids", () => {
    expect(meldungRecord({ ...INPUT, technischeAngaben: "Browser: X" }, "Case-Nachricht")).toEqual({
      Typ__c: "Case-Nachricht",
      Betreff__c: "Portal-Nachricht: Hallo",
      Beschreibung__c: "Hallo HYPOTEQ",
      Technische_Angaben__c: "Browser: X",
      Partner_Email__c: "p@x.ch",
      Partner_Account__c: ACCOUNT,
      Case__c: CASE,
    });
    const bare = meldungRecord({ ...INPUT, partnerAccountId: "not-an-id", caseId: null, partnerEmail: null }, "Frage");
    expect(Object.keys(bare).sort()).toEqual(["Beschreibung__c", "Betreff__c", "Typ__c"]);
  });

  it("cuts the subject to 255 characters", () => {
    expect(String(meldungRecord({ ...INPUT, betreff: "x".repeat(300) }, "Frage").Betreff__c)).toHaveLength(255);
  });

  it("is written without describe when the connection cannot describe", async () => {
    const { sf, creates } = fakeSf(null);
    expect(await createPortalMeldung(sf, INPUT)).toEqual({ id: "a0XMELDUNG0000000A", error: null });
    expect(creates[0].Typ__c).toBe("Case-Nachricht");
  });
});
