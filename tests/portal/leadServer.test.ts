/**
 * Partner Fast Lead on the server (DECISIONS P39): inviting, sending again, the customer's link
 * and the submit's lookup. Database, mail and audit are fakes.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const mockDb = {
  portalLead: {
    count: jest.fn<any>(),
    findFirst: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    updateMany: jest.fn<any>(),
  },
  portalUser: { findUnique: jest.fn<any>() },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));

const mockInviteMail = jest.fn<any>();
const mockTeamMail = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({
  sendLeadInviteMail: (p: any) => mockInviteMail(p),
  sendTeamMail: (p: any) => mockTeamMail(p),
  maskEmail: (e: string) => `${e.slice(0, 1)}***`,
}));
const mockAudit = jest.fn<any>();
jest.mock("@/lib/portal/audit", () => ({ audit: (e: any) => mockAudit(e) }));
let mockTestMode = false;
jest.mock("@/components/testMode", () => ({ isTestMode: () => mockTestMode, skipped: () => {} }));

import { claimLead, createLead, leadForLink, leadPartnerForSubmit, listLeads, resendLead } from "@/lib/portal/leadServer";

const NOW = new Date("2026-11-23T10:00:00.000Z");
/** The first argument of a fake's n-th call. */
const argOf = (fn: { mock: { calls: unknown[][] } }, n = 0): any => fn.mock.calls[n][0];
const TOKEN = "T".repeat(43);
const ORIGIN = "https://preview.hypoteq.example";

const partner = {
  id: "user-1",
  email: "anna@muster.ch",
  name: "Anna Muster",
  company: "Muster AG",
  phone: "+41 44 000 00 00",
  sfContactId: "003PARTNERAAAAAAAA",
  sfAccountId: "001PARTNERAAAAAAAA",
};
const form = { anrede: "Frau", firstName: "Lea", lastName: "Beispiel", email: "Lea@Kunde.ch", phone: "", locale: "fr", consent: true };

const stored = (over: Record<string, unknown> = {}) => ({
  id: "lead-1",
  partnerUserId: "user-1",
  partnerEmail: "anna@muster.ch",
  partnerName: "Anna Muster",
  partnerCompany: "Muster AG",
  partnerPhone: "+41 44 000 00 00",
  sfContactId: "003PARTNERAAAAAAAA",
  sfAccountId: "001PARTNERAAAAAAAA",
  anrede: "Frau",
  firstName: "Lea",
  lastName: "Beispiel",
  email: "lea@kunde.ch",
  phone: null,
  locale: "fr",
  consentAt: NOW,
  token: TOKEN,
  expiresAt: new Date(NOW.getTime() + 30 * 24 * 3600_000),
  status: "invited",
  openedAt: null,
  mailsSent: 1,
  lastMailAt: new Date(NOW.getTime() - 3600_000),
  submittedAt: null,
  inquiryId: null,
  caseNumber: null,
  salesforceCaseId: null,
  createdAt: new Date(NOW.getTime() - 3600_000),
  updatedAt: NOW,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTestMode = false;
  mockDb.portalLead.count.mockResolvedValue(0);
  mockDb.portalLead.findFirst.mockResolvedValue(null);
  mockDb.portalLead.create.mockImplementation(async ({ data }: any) => ({ ...stored(), ...data, id: "lead-new", createdAt: NOW }));
  mockDb.portalLead.update.mockResolvedValue({});
  mockDb.portalLead.updateMany.mockResolvedValue({ count: 1 });
  mockInviteMail.mockResolvedValue(true);
  mockTeamMail.mockResolvedValue(undefined);
});

describe("createLead", () => {
  it("stores the invitation for the partner's Contact, mails the customer in their language and tells HYPOTEQ", async () => {
    const res = await createLead(partner, form, { origin: ORIGIN, ip: "1.2.3.4", now: NOW });
    expect(res).toEqual({ ok: true, id: "lead-new", name: "Lea Beispiel", email: "lea@kunde.ch" });

    const data = argOf(mockDb.portalLead.create, 0).data;
    expect(data).toMatchObject({
      partnerUserId: "user-1",
      sfContactId: "003PARTNERAAAAAAAA",
      sfAccountId: "001PARTNERAAAAAAAA",
      email: "lea@kunde.ch",
      locale: "fr",
      consentAt: NOW,
      mailsSent: 0,
    });
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + 30 * 24 * 3600_000));

    const mail = argOf(mockInviteMail, 0);
    expect(mail).toMatchObject({ to: "lea@kunde.ch", firstName: "Lea", partner: "Anna Muster (Muster AG)", locale: "fr", days: 30 });
    expect(mail.url).toBe(`${ORIGIN}/fr/funnel?lead=${data.token}`);
    expect(mockDb.portalLead.update).toHaveBeenCalledWith({ where: { id: "lead-new" }, data: { mailsSent: 1, lastMailAt: expect.any(Date) } });

    expect(mockTeamMail).toHaveBeenCalledWith(expect.objectContaining({ to: null, replyTo: "anna@muster.ch", subject: expect.stringContaining("Partner Fast Lead · Lea Beispiel") }));
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead_invited", actorId: "user-1", target: "Lea Beispiel · l***" }));
  });

  it("refuses an invalid form, the partner's own address, the 21st invitation in 24 h and an open duplicate", async () => {
    expect(await createLead(partner, { ...form, consent: false }, { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "consent" });
    expect(await createLead(partner, { ...form, email: "ANNA@muster.ch" }, { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "self" });
    mockDb.portalLead.count.mockResolvedValueOnce(20);
    expect(await createLead(partner, form, { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "limit" });
    mockDb.portalLead.findFirst.mockResolvedValueOnce({ id: "lead-old" });
    expect(await createLead(partner, form, { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "duplicate" });
    expect(argOf(mockDb.portalLead.findFirst, 0).where).toEqual({
      sfContactId: "003PARTNERAAAAAAAA",
      email: "lea@kunde.ch",
      status: { in: ["invited", "opened"] },
      expiresAt: { gt: NOW },
    });
    expect(mockDb.portalLead.create).not.toHaveBeenCalled();
    expect(mockInviteMail).not.toHaveBeenCalled();
  });

  it("needs a Salesforce Contact — the Case would have no partner", async () => {
    expect(await createLead({ ...partner, sfContactId: null }, form, { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "failed" });
  });

  it("keeps the invitation when the mail fails and says so", async () => {
    mockInviteMail.mockRejectedValueOnce(new Error("Graph down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await createLead(partner, form, { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "mail" });
    expect(mockDb.portalLead.create).toHaveBeenCalled();
    expect(mockDb.portalLead.update).not.toHaveBeenCalled();
  });

  it("withholds the team mail in test mode (the customer mail goes through test-mode routing)", async () => {
    mockTestMode = true;
    expect((await createLead(partner, form, { origin: ORIGIN, ip: null, now: NOW })).ok).toBe(true);
    expect(mockInviteMail).toHaveBeenCalled();
    expect(mockTeamMail).not.toHaveBeenCalled();
  });
});

describe("resendLead", () => {
  it("sends the same link again, counts it and extends the invitation", async () => {
    mockDb.portalLead.findFirst.mockResolvedValueOnce(stored({ expiresAt: new Date(NOW.getTime() - 1000) }));
    expect(await resendLead(partner, "lead-1", { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: true, email: "lea@kunde.ch" });
    expect(argOf(mockDb.portalLead.findFirst, 0).where).toEqual({ id: "lead-1", sfContactId: "003PARTNERAAAAAAAA" });
    expect(argOf(mockInviteMail, 0).url).toBe(`${ORIGIN}/fr/funnel?lead=${TOKEN}`);
    expect(mockDb.portalLead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { mailsSent: { increment: 1 }, lastMailAt: NOW, expiresAt: new Date(NOW.getTime() + 30 * 24 * 3600_000) },
    });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead_resent" }));
  });

  it("only the partner's own, not after the submit, not within 15 minutes", async () => {
    expect(await resendLead(partner, "lead-x", { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "notFound" });
    mockDb.portalLead.findFirst.mockResolvedValueOnce(stored({ status: "submitted" }));
    expect(await resendLead(partner, "lead-1", { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "submitted" });
    mockDb.portalLead.findFirst.mockResolvedValueOnce(stored({ lastMailAt: new Date(NOW.getTime() - 60_000) }));
    expect(await resendLead(partner, "lead-1", { origin: ORIGIN, ip: null, now: NOW })).toEqual({ ok: false, error: "tooSoon" });
    expect(mockInviteMail).not.toHaveBeenCalled();
  });
});

describe("listLeads", () => {
  it("shows the Contact's invitations with the derived status", async () => {
    mockDb.portalLead.findMany.mockResolvedValueOnce([
      stored({ id: "a", status: "submitted", caseNumber: "HQ-26-11-000001", salesforceCaseId: "500X" }),
      stored({ id: "b", expiresAt: new Date(NOW.getTime() - 1000) }),
    ]);
    const rows = await listLeads("003PARTNERAAAAAAAA", NOW);
    expect(argOf(mockDb.portalLead.findMany, 0).where).toEqual({ sfContactId: "003PARTNERAAAAAAAA" });
    expect(rows.map((r) => [r.id, r.status, r.canResend])).toEqual([
      ["a", "submitted", false],
      ["b", "expired", true],
    ]);
    expect(rows[0]).toMatchObject({ kunde: "Lea Beispiel", caseNumber: "HQ-26-11-000001", salesforceCaseId: "500X" });
  });
});

describe("leadForLink (the customer's link)", () => {
  it("gives the customer's contact and the partner's name — no Salesforce id, no partner address — and marks it opened", async () => {
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored());
    const res = await leadForLink(TOKEN, NOW);
    expect(res).toEqual({
      status: "ok",
      locale: "fr",
      customer: { anrede: "Frau", firstName: "Lea", lastName: "Beispiel", email: "lea@kunde.ch", phone: null },
      partner: { name: "Anna Muster", company: "Muster AG", initials: "AM" },
    });
    expect(JSON.stringify(res)).not.toMatch(/003PARTNER|001PARTNER|anna@muster\.ch/);
    expect(mockDb.portalLead.updateMany).toHaveBeenCalledWith({ where: { id: "lead-1", status: "invited" }, data: { status: "opened", openedAt: NOW } });
  });

  it("is invalid for a malformed or unknown token, used after the submit, expired after 30 days", async () => {
    expect(await leadForLink("nope", NOW)).toEqual({ status: "invalid" });
    expect(mockDb.portalLead.findUnique).not.toHaveBeenCalled();
    mockDb.portalLead.findUnique.mockResolvedValueOnce(null);
    expect(await leadForLink(TOKEN, NOW)).toEqual({ status: "invalid" });
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored({ status: "submitted" }));
    expect(await leadForLink(TOKEN, NOW)).toEqual({ status: "used" });
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored({ status: "opened", expiresAt: new Date(NOW.getTime() - 1) }));
    expect(await leadForLink(TOKEN, NOW)).toEqual({ status: "expired" });
    expect(mockDb.portalLead.updateMany).not.toHaveBeenCalled();
  });
});

describe("the submit", () => {
  it("credits the partner as the login is now — its current Contact and Account", async () => {
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored({ status: "opened" }));
    mockDb.portalUser.findUnique.mockResolvedValueOnce({ ...partner, sfContactId: "003NEWAAAAAAAAAAAA", sfAccountId: "001NEWAAAAAAAAAAAA" });
    expect(await leadPartnerForSubmit(TOKEN)).toEqual({
      leadId: "lead-1",
      email: "anna@muster.ch",
      name: "Anna Muster",
      company: "Muster AG",
      phone: "+41 44 000 00 00",
      contactId: "003NEWAAAAAAAAAAAA",
      accountId: "001NEWAAAAAAAAAAAA",
      invitedAt: "2026-11-23T09:00:00.000Z",
    });
  });

  it("falls back to the invitation's Contact when the login has none or is gone", async () => {
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored());
    mockDb.portalUser.findUnique.mockResolvedValueOnce(null);
    expect(await leadPartnerForSubmit(TOKEN)).toMatchObject({ contactId: "003PARTNERAAAAAAAA", accountId: "001PARTNERAAAAAAAA" });
  });

  it("an expired link still credits (the customer started in time); a used one does not", async () => {
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored({ expiresAt: new Date(NOW.getTime() - 1) }));
    mockDb.portalUser.findUnique.mockResolvedValueOnce(partner);
    expect(await leadPartnerForSubmit(TOKEN)).not.toBeNull();
    mockDb.portalLead.findUnique.mockResolvedValueOnce(stored({ status: "submitted" }));
    expect(await leadPartnerForSubmit(TOKEN)).toBeNull();
    expect(await leadPartnerForSubmit("bad")).toBeNull();
  });

  it("claims the invitation once", async () => {
    expect(await claimLead("lead-1", "inq-1", NOW)).toBe(true);
    expect(mockDb.portalLead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead-1", status: { in: ["invited", "opened"] } },
      data: { status: "submitted", submittedAt: NOW, inquiryId: "inq-1" },
    });
    mockDb.portalLead.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await claimLead("lead-1", "inq-2", NOW)).toBe(false);
  });
});
