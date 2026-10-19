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
const mockSmtpSend = jest.fn<any>();
const mockSmtpOptions = jest.fn<any>();
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: (o: unknown) => (mockSmtpOptions(o), { sendMail: (m: unknown) => mockSmtpSend(m) }) },
}));

import { mailErrorText, maskEmail, sendMagicLinkMail, sendResetMail, sendTeamMail } from "@/lib/portal/mail";

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

describe("how mails leave (B6 / E.3)", () => {
  const RESET = { to: "anna@partner.ch", name: null, origin: "https://portal.example", token: "tok", locale: "de" };

  it("fall back to SMTP like the rest of the site when Graph is not configured", async () => {
    process.env = { ...ENV, NODE_ENV: "production", SMTP_USER: "info@hypoteq.ch", SMTP_PASS: "secret" } as NodeJS.ProcessEnv;
    mockSmtpSend.mockResolvedValue({});
    await sendTeamMail({ to: null, cc: ["owner@hypoteq.ch"], replyTo: "anna@partner.ch", subject: "S", lines: ["x"], origin: "https://x" });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSmtpOptions).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.office365.com", port: 587, auth: { user: "info@hypoteq.ch", pass: "secret" } }));
    expect(mockSmtpSend).toHaveBeenCalledWith(expect.objectContaining({ to: "info@hypoteq.ch", cc: ["owner@hypoteq.ch"], replyTo: "anna@partner.ch", subject: "S" }));
  });

  it("throw, and log why, when there is no way to send — never «sent» while nothing left", async () => {
    process.env = { ...ENV, NODE_ENV: "production" } as NodeJS.ProcessEnv;
    delete process.env.USE_GRAPH;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendResetMail(RESET)).rejects.toThrow(/neither Microsoft Graph .* nor SMTP/);
    expect(String(error.mock.calls[0][0])).toMatch(/mail «.*» to a\*\*\*@partner\.ch NOT sent: neither Microsoft Graph/);
    error.mockRestore();
  });

  it("log a Graph refusal with its status and code, then let the caller show the error", async () => {
    mockPost.mockRejectedValue(Object.assign(new Error("Access is denied. Check credentials and try again."), { statusCode: 403, code: "ErrorAccessDenied" }));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendResetMail(RESET)).rejects.toThrow("Access is denied");
    expect(String(error.mock.calls[0][0])).toContain("via graph as info@hypoteq.ch failed: 403 · ErrorAccessDenied · Access is denied.");
    error.mockRestore();
  });

  it("only a developer machine prints the link instead of sending", async () => {
    process.env = { ...ENV, NODE_ENV: "development" } as NodeJS.ProcessEnv;
    delete process.env.USE_GRAPH;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await expect(sendResetMail(RESET)).resolves.toBeUndefined();
    expect(String(log.mock.calls[0][0])).toContain("https://portal.example/portal/passwort-neu/tok");
    log.mockRestore();
  });

  it("mask addresses in the log and word errors", () => {
    expect(maskEmail("daniel.meier@meier-finanz.ch")).toBe("d***@meier-finanz.ch");
    expect(maskEmail("kaputt")).toBe("***");
    expect(mailErrorText(new Error("boom"))).toBe("boom");
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
