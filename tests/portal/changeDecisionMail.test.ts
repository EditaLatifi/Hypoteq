import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * /portal/admin/aenderungen: setting a change request to «Übernommen» or «Abgelehnt» mails
 * the partner who filed it (HYPOTEQ Mail-Texte 20.10.2026 M14), in their portal language,
 * whatever PORTAL_STATUS_MAILS says. A mail that fails never fails the admin's decision.
 * The texts themselves are asserted in partnerMails.test.ts.
 */

const mockDb = {
  portalChangeRequest: { findUnique: jest.fn<any>(), update: jest.fn<any>() },
  portalUser: { findUnique: jest.fn<any>() },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));
const mockMail = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({ sendChangeDecisionMail: (p: any) => mockMail(p) }));
const mockAudit = jest.fn<any>();
jest.mock("@/lib/portal/audit", () => ({ audit: (e: any) => mockAudit(e) }));
jest.mock("@/lib/portal/session", () => ({
  requireAdmin: async () => ({ id: "admin-1", email: "admin@hypoteq.ch" }),
  requestIp: () => null,
  requestOrigin: () => "https://portal.example",
}));
jest.mock("next/cache", () => ({ revalidatePath: () => {} }));
// The real connection would log in to the production org: never loaded here.
jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => any) => op() }));
jest.mock("@/lib/portal/salesforce", () => ({ isSalesforceId: () => true }));

import { setChangeRequestStatusAction } from "@/app/portal/(app)/admin/aenderungen/actions";

const REQUEST = { id: "d6d33b7e-1111-4222-8333-944455556666", userId: "u-1", field: "phone", status: "in_pruefung" };
const PARTNER = { email: "s.dubois@courtage.ch", name: "Sophie Dubois", locale: "fr", status: "active" };

function form(status: string): FormData {
  const fd = new FormData();
  fd.set("id", REQUEST.id);
  fd.set("status", status);
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PORTAL_STATUS_MAILS;
  mockDb.portalChangeRequest.findUnique.mockResolvedValue({ ...REQUEST });
  mockDb.portalChangeRequest.update.mockResolvedValue({});
  mockDb.portalUser.findUnique.mockResolvedValue({ ...PARTNER });
  mockMail.mockResolvedValue(undefined);
  mockAudit.mockResolvedValue(undefined);
});

describe("deciding a change request (M14)", () => {
  it("«Übernommen» mails the partner in their language, with the reference the portal shows", async () => {
    await setChangeRequestStatusAction(form("uebernommen"));
    expect(mockMail).toHaveBeenCalledTimes(1);
    expect(mockMail).toHaveBeenCalledWith({
      to: PARTNER.email,
      name: PARTNER.name,
      origin: "https://portal.example",
      locale: "fr",
      nr: "AA-D6D33B",
      field: "phone",
      approved: true,
    });
  });

  it("«Abgelehnt» mails the decline", async () => {
    mockDb.portalUser.findUnique.mockResolvedValue({ ...PARTNER, locale: "de" });
    await setChangeRequestStatusAction(form("abgelehnt"));
    expect(mockMail).toHaveBeenCalledWith(expect.objectContaining({ locale: "de", approved: false }));
  });

  it("back to «In Prüfung», or the same status again, mails nothing", async () => {
    mockDb.portalChangeRequest.findUnique.mockResolvedValue({ ...REQUEST, status: "uebernommen" });
    await setChangeRequestStatusAction(form("in_pruefung"));
    await setChangeRequestStatusAction(form("uebernommen"));
    expect(mockMail).not.toHaveBeenCalled();
  });

  it("nothing to a deactivated access", async () => {
    mockDb.portalUser.findUnique.mockResolvedValue({ ...PARTNER, status: "disabled" });
    await setChangeRequestStatusAction(form("uebernommen"));
    expect(mockMail).not.toHaveBeenCalled();
  });

  it("a failed mail is logged; the decision and the audit entry stand", async () => {
    mockMail.mockRejectedValue(new Error("Graph down"));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(setChangeRequestStatusAction(form("abgelehnt"))).resolves.toBeUndefined();
    expect(mockDb.portalChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "abgelehnt" }) }));
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("AA-D6D33B: decision mail failed");
    error.mockRestore();
  });
});
