import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * lib/portal/mail.ts against a fake Microsoft Graph: nothing leaves the machine. What HYPOTEQ
 * relies on: team mails go to info@hypoteq.ch, the Case owner in copy, and «Antworten»
 * reaches the partner (Reply-To, B22).
 */

const mockPost = jest.fn<any>();
const mockApi = jest.fn<any>();
jest.mock("@microsoft/microsoft-graph-client", () => ({
  Client: { initWithMiddleware: () => ({ api: (path: string) => (mockApi(path), { post: (body: unknown) => mockPost(body) }) }) },
}));
jest.mock("@azure/identity", () => ({ ClientSecretCredential: class {} }));
jest.mock("isomorphic-fetch", () => ({}));

import { sendMagicLinkMail, sendTeamMail } from "@/lib/portal/mail";

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({});
  process.env = { ...ENV, USE_GRAPH: "true", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", SMTP_USER: "info@hypoteq.ch" };
  delete process.env.PORTAL_TEAM_EMAIL;
  delete process.env.PORTAL_MAIL_FROM;
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("sendTeamMail", () => {
  it("goes to info@hypoteq.ch from the configured mailbox, with the owner in copy and the partner as Reply-To", async () => {
    await sendTeamMail({ to: null, cc: ["owner@hypoteq.ch"], replyTo: "d.meier@meier-finanz.ch", subject: "Portal-Nachricht · 00001350 · Anna Muster", lines: ["Hallo"], origin: "https://x" });
    expect(mockApi).toHaveBeenCalledWith("/users/info@hypoteq.ch/sendMail");
    const msg = (mockPost.mock.calls[0][0] as any).message;
    expect(msg.toRecipients).toEqual([{ emailAddress: { address: "info@hypoteq.ch" } }]);
    expect(msg.ccRecipients).toEqual([{ emailAddress: { address: "owner@hypoteq.ch" } }]);
    expect(msg.replyTo).toEqual([{ emailAddress: { address: "d.meier@meier-finanz.ch" } }]);
    expect(msg.subject).toBe("Portal-Nachricht · 00001350 · Anna Muster");
  });

  it("leaves Reply-To out when there is none or it is not an address, and never copies the recipient", async () => {
    await sendTeamMail({ to: "info@hypoteq.ch", cc: ["INFO@hypoteq.ch"], replyTo: "not an address", subject: "x", lines: [], origin: "https://x" });
    const msg = (mockPost.mock.calls[0][0] as any).message;
    expect(msg).not.toHaveProperty("replyTo");
    expect(msg).not.toHaveProperty("ccRecipients");
  });

  it("escapes what the partner wrote", async () => {
    await sendTeamMail({ to: null, subject: "x", lines: ["<script>alert(1)</script>"], origin: "https://x" });
    expect((mockPost.mock.calls[0][0] as any).message.body.content).toContain("&lt;script&gt;");
  });
});

describe("partner mails", () => {
  it("carry no Reply-To", async () => {
    await sendMagicLinkMail({ to: "d.meier@meier-finanz.ch", name: null, origin: "https://portal.example", token: "tok", locale: "de" });
    const msg = (mockPost.mock.calls[0][0] as any).message;
    expect(msg).not.toHaveProperty("replyTo");
    expect(msg.body.content).toContain("https://portal.example/portal/link/tok");
  });
});
