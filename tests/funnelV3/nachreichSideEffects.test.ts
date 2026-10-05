import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

/**
 * The two outward side effects of a v3 Nachreichung, with Salesforce and Graph faked:
 * updateCaseV3Documents (merge onto the Case's check state; withheld in test mode) and the
 * confirmation mail with v3 labels (Berater copy, HTML-escaped names).
 */

const mockConn = { accessToken: "x", query: jest.fn(async (_soql: string) => ({ records: [{ Dokumenten_Check_State__c: '{"checked":{"A":true}}' }] })) };
const mockUpdateCase = jest.fn(async (_id: string, _fields: any) => ({ success: true }));
jest.mock("@/components/salesforceApi", () => ({
  conn: mockConn,
  login: async () => {},
  updateCase: (id: string, fields: any) => mockUpdateCase(id, fields),
}));

const mockPosts: any[] = [];
jest.mock("@microsoft/microsoft-graph-client", () => ({
  Client: { initWithMiddleware: () => ({ api: (path: string) => ({ post: async (body: any) => void mockPosts.push({ path, body }) }) }) },
}));
jest.mock("@azure/identity", () => ({ ClientSecretCredential: class {} }));

import { updateCaseV3Documents } from "@/components/updateCaseCompleteness";
import { sendNachreichConfirmation } from "@/components/nachreichMail";

const ENV = { ...process.env };
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  mockUpdateCase.mockClear();
  mockConn.query.mockClear();
  mockPosts.length = 0;
  process.env = { ...ENV, USE_GRAPH: "true", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", HYPOTEQ_TEST_MODE: "" };
});
afterEach(() => {
  process.env = ENV;
});

describe("updateCaseV3Documents", () => {
  it("hands the Case's current check state to the builder and writes the result by Id", async () => {
    const build = jest.fn((prev: string | null) => ({ Documents_completed__c: true, Dokumenten_Check_State__c: `merged:${prev}` }));
    await updateCaseV3Documents("500CASE", build);
    expect(mockConn.query.mock.calls[0][0]).toMatch(/SELECT Dokumenten_Check_State__c FROM Case WHERE Id = '500CASE'/);
    expect(build).toHaveBeenCalledWith('{"checked":{"A":true}}');
    expect(mockUpdateCase).toHaveBeenCalledWith("500CASE", { Documents_completed__c: true, Dokumenten_Check_State__c: 'merged:{"checked":{"A":true}}' });
  });

  it("writes nothing in test mode", async () => {
    process.env.HYPOTEQ_TEST_MODE = "1";
    const build = jest.fn(() => ({ Documents_completed__c: true }));
    expect(await updateCaseV3Documents("500CASE", build)).toBeNull();
    expect(build).not.toHaveBeenCalled();
    expect(mockUpdateCase).not.toHaveBeenCalled();
  });
});

describe("sendNachreichConfirmation — v3 labels", () => {
  it("lists the given labels (escaped) instead of resolving funnel.* keys, with the Berater in copy", async () => {
    await sendNachreichConfirmation({
      to: "gary@example.ch",
      cc: "berater@partner.ch",
      name: "Gary Gerber",
      locale: "fr",
      complete: false,
      remaining: ["id#b2"],
      remainingLabels: ["Passeport / carte d’identité – Anna <Muster>"],
    });
    const msg = mockPosts[0].body.message;
    expect(msg.subject).toBe("HYPOTEQ - Documents reçus, il en manque encore");
    expect(msg.body.content).toContain("<li style=\"margin-bottom:6px;\">Passeport / carte d’identité – Anna &lt;Muster&gt;</li>");
    expect(msg.body.content).not.toContain("id#b2");
    expect(msg.ccRecipients).toEqual([{ emailAddress: { address: "berater@partner.ch" } }]);
  });

  it("legacy call unchanged: funnel.* keys resolved, no copy", async () => {
    await sendNachreichConfirmation({ to: "anna@example.ch", name: "Anna", locale: "de", complete: false, remaining: ["funnel.passportIDAllBorrowers"] });
    const msg = mockPosts[0].body.message;
    expect(msg).not.toHaveProperty("ccRecipients");
    expect(msg.body.content).not.toContain("funnel.passportIDAllBorrowers");
  });

  it("test mode: redirected, and no copy to the real Berater", async () => {
    process.env.HYPOTEQ_TEST_MODE = "1";
    process.env.HYPOTEQ_TEST_MAIL_TO = "test@hypoteq.ch";
    await sendNachreichConfirmation({ to: "gary@example.ch", cc: "berater@partner.ch", name: "Gary", locale: "de", complete: true, remaining: [], remainingLabels: [] });
    const msg = mockPosts[0].body.message;
    expect(msg.toRecipients).toEqual([{ emailAddress: { address: "test@hypoteq.ch" } }]);
    expect(msg).not.toHaveProperty("ccRecipients");
  });
});
