import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * Password reset and magic link (HYPOTEQ 19.10.2026 B6 / E.3, DECISIONS P34) against an
 * in-memory PortalUser / PortalToken table. Mail and audit are fakes; nothing leaves.
 */

type Row = Record<string, any>;
const db = { users: [] as Row[], tokens: [] as Row[] };

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("gte" in v) return row[k] >= v.gte;
      if ("gt" in v) return row[k] > v.gt;
    }
    return row[k] === v;
  });
}

const mockPrisma = {
  portalUser: {
    findUnique: async ({ where }: any) => db.users.find((u) => u.email === where.email) ?? null,
    create: async ({ data }: any) => {
      const u = { id: `u-${db.users.length + 1}`, name: null, company: null, locale: null, ...data };
      db.users.push(u);
      return u;
    },
  },
  portalToken: {
    create: async ({ data }: any) => {
      const t = { id: `t-${db.tokens.length + 1}`, usedAt: null, createdAt: new Date(), ...data };
      db.tokens.push(t);
      return t;
    },
    count: async ({ where }: any) => db.tokens.filter((t) => matches(t, where)).length,
    findUnique: async ({ where, include }: any) => {
      const t = db.tokens.find((x) => x.tokenHash === where.tokenHash);
      return t ? { ...t, ...(include?.user ? { user: db.users.find((u) => u.id === t.userId) } : {}) } : null;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = db.tokens.filter((t) => matches(t, where));
      hit.forEach((t) => Object.assign(t, data));
      return { count: hit.length };
    },
  },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
const mockSent: { kind: string; to: string; token: string; origin: string }[] = [];
const mockFail = { on: false };
jest.mock("@/lib/portal/mail", () => {
  const record = (kind: string) => async (p: any) => {
    if (mockFail.on) throw Object.assign(new Error("Access is denied."), { statusCode: 403, code: "ErrorAccessDenied" });
    mockSent.push({ kind, to: p.to, token: p.token, origin: p.origin });
  };
  return {
    sendInviteMail: record("invite"),
    sendMagicLinkMail: record("magic"),
    sendResetMail: record("reset"),
    maskEmail: (e: string) => `${e.slice(0, 1)}***@${e.split("@")[1]}`,
  };
});
jest.mock("@/lib/portal/audit", () => ({ audit: async () => {} }));

import { requestLink } from "@/lib/portal/linkRequests";
import { consumeToken, peekToken } from "@/lib/portal/tokens";

const CTX = { locale: "de", origin: "https://hypoteq-git-branch.vercel.app", ip: "1.2.3.4" };
const ENV = { ...process.env };
let warn: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  db.users = [
    { id: "active", email: "anna@partner.ch", status: "active", role: "partner", name: "Anna", company: null, locale: "fr" },
    { id: "invited", email: "ben@partner.ch", status: "invited", role: "partner", name: "Ben", company: "Partner AG", locale: null },
    { id: "off", email: "carl@partner.ch", status: "disabled", role: "partner", name: "Carl", company: null, locale: null },
  ];
  db.tokens = [];
  mockSent.length = 0;
  mockFail.on = false;
  delete process.env.PORTAL_ADMIN_EMAILS;
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ENV };
  warn.mockRestore();
});

describe("requestLink", () => {
  it("sends an active partner the magic link or the reset link, to the origin of the request", async () => {
    expect(await requestLink("magic", "anna@partner.ch", CTX)).toEqual({ mailed: true, purpose: "magic" });
    expect(await requestLink("reset", "anna@partner.ch", CTX)).toEqual({ mailed: true, purpose: "reset" });
    expect(mockSent.map((m) => [m.kind, m.to, m.origin])).toEqual([
      ["magic", "anna@partner.ch", CTX.origin],
      ["reset", "anna@partner.ch", CTX.origin],
    ]);
  });

  it("sends an invited partner the invitation — also from «Passwort vergessen», which used to send nothing", async () => {
    expect(await requestLink("reset", "ben@partner.ch", CTX)).toEqual({ mailed: true, purpose: "invite" });
    expect(await requestLink("magic", "ben@partner.ch", CTX)).toEqual({ mailed: true, purpose: "invite" });
    expect(mockSent.map((m) => m.kind)).toEqual(["invite", "invite"]);
  });

  it("creates the admin account of PORTAL_ADMIN_EMAILS on a reset request too", async () => {
    process.env.PORTAL_ADMIN_EMAILS = "chef@hypoteq.ch";
    expect(await requestLink("reset", "chef@hypoteq.ch", CTX)).toEqual({ mailed: true, purpose: "reset" });
    expect(db.users.find((u) => u.email === "chef@hypoteq.ch")).toMatchObject({ role: "admin", status: "active" });
  });

  it("sends nothing to an unknown or disabled address — and says why in the server log", async () => {
    expect(await requestLink("magic", "nobody@partner.ch", CTX)).toMatchObject({ mailed: false });
    expect(await requestLink("reset", "carl@partner.ch", CTX)).toMatchObject({ mailed: false, reason: "the account is disabled" });
    expect(mockSent).toHaveLength(0);
    const logged = warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logged[0]).toMatch(/magic link requested for n\*\*\*@partner\.ch: no mail sent — no portal account/);
    expect(logged[1]).toMatch(/password reset requested for c\*\*\*@partner\.ch: no mail sent — the account is disabled/);
    expect(logged.join(" ")).not.toContain("nobody@partner.ch");
  });

  it("stops after five links of one kind within 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await requestLink("magic", "anna@partner.ch", CTX)).mailed).toBe(true);
    expect(await requestLink("magic", "anna@partner.ch", CTX)).toMatchObject({ mailed: false });
    expect((await requestLink("reset", "anna@partner.ch", CTX)).mailed).toBe(true);
    expect(mockSent).toHaveLength(6);
  });

  it("lets a failed mail through to the caller (the page then says it could not be sent)", async () => {
    mockFail.on = true;
    await expect(requestLink("magic", "anna@partner.ch", CTX)).rejects.toThrow("Access is denied.");
  });
});

describe("one-time links", () => {
  it("a second request does not kill the first link; using one retires the other", async () => {
    await requestLink("magic", "anna@partner.ch", CTX);
    await requestLink("magic", "anna@partner.ch", CTX);
    const [first, second] = mockSent.map((m) => m.token);
    expect(await peekToken(first, "magic")).not.toBeNull();
    expect(await peekToken(second, "magic")).not.toBeNull();

    const used = await consumeToken(first, "magic");
    expect(used?.user.email).toBe("anna@partner.ch");
    expect(await consumeToken(first, "magic")).toBeNull();
    expect(await peekToken(second, "magic")).toBeNull();
  });

  it("a link is only good for its own purpose, and not after it expired", async () => {
    await requestLink("reset", "anna@partner.ch", CTX);
    const token = mockSent[0].token;
    expect(await peekToken(token, "magic")).toBeNull();
    db.tokens[0].expiresAt = new Date(Date.now() - 1000);
    expect(await peekToken(token, "reset")).toBeNull();
    expect(await consumeToken(token, "reset")).toBeNull();
  });

  it("opening the link page (a mail scanner's GET) does not use it", async () => {
    await requestLink("magic", "anna@partner.ch", CTX);
    const token = mockSent[0].token;
    await peekToken(token, "magic");
    await peekToken(token, "magic");
    expect((await consumeToken(token, "magic"))?.user.id).toBe("active");
  });
});
