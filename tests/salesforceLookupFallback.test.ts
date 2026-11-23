/**
 * components/salesforceApi.ts writeWithFieldFallback: a lookup to a record Salesforce refuses
 * (deleted, or out of the integration user's reach) costs that link, never the Case. Fast Lead
 * test of 23.11.2026: the test partner's Account was named only by its 15-character Id, the
 * fallback dropped the owner and an unrelated «1» instead, and the Case was lost.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const mockCreate = jest.fn<any>();
jest.mock("jsforce", () => ({
  Connection: class {
    sobject() {
      return { create: (f: unknown) => mockCreate(f) };
    }
  },
}));

import { createOrUpdateCase, takeDroppedFields } from "@/components/salesforceApi";

const refused = (code: string, message: string) => Object.assign(new Error(message), { errorCode: code });

beforeEach(() => {
  mockCreate.mockReset();
  takeDroppedFields();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("a refused lookup", () => {
  it("drops the field whose 18-character Id Salesforce names by its 15 characters — not the owner, not a «1»", async () => {
    mockCreate
      .mockRejectedValueOnce(refused("INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY", "insufficient access rights on cross-reference id: 001TG00000u4C2Q"))
      .mockResolvedValueOnce({ id: "500X", success: true });
    const res = await createOrUpdateCase({
      Account__c: "001TG00000u4C2QYAU",
      OwnerId: "00GTG00000ABI7E2AX",
      Wie_viele_Kunden__c: "1",
      Partner_Consultant__c: "003TG00000lhYpnYAE",
    });
    expect(res).toEqual({ id: "500X", success: true });
    expect(mockCreate.mock.calls[1][0]).toEqual({ OwnerId: "00GTG00000ABI7E2AX", Wie_viele_Kunden__c: "1", Partner_Consultant__c: "003TG00000lhYpnYAE" });
    expect(takeDroppedFields()).toEqual(["Case.Account__c (INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY)"]);
  });

  it("one after the other: the Account, then the Contact", async () => {
    mockCreate
      .mockRejectedValueOnce(refused("INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY", "insufficient access rights on cross-reference id: 001TG00000u4C2Q"))
      .mockRejectedValueOnce(refused("INVALID_CROSS_REFERENCE_KEY", "invalid cross reference id: 003TG00000lhYpn"))
      .mockResolvedValueOnce({ id: "500X", success: true });
    await createOrUpdateCase({ Account__c: "001TG00000u4C2QYAU", Partner_Consultant__c: "003TG00000lhYpnYAE", Client__c: "001TG00000wcBlrYAE" });
    expect(mockCreate.mock.calls[2][0]).toEqual({ Client__c: "001TG00000wcBlrYAE" });
  });

  it("still drops a malformed value it can find, and the owner when nothing is named", async () => {
    mockCreate
      .mockRejectedValueOnce(refused("MALFORMED_ID", "Partner_Consultant__c: id value of incorrect type: anna@muster.ch"))
      .mockRejectedValueOnce(refused("INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY", "insufficient access rights on cross-reference id"))
      .mockResolvedValueOnce({ id: "500X", success: true });
    await createOrUpdateCase({ Partner_Consultant__c: "anna@muster.ch", OwnerId: "00GTG00000ABI7E2AX", Case_Name__c: "Muster Anna" });
    expect(mockCreate.mock.calls[2][0]).toEqual({ Case_Name__c: "Muster Anna" });
  });
});
