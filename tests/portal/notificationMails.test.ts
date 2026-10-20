import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * The portal's own notification e-mails (HYPOTEQ 19.10.2026 B24 / E.2, DECISIONS P32):
 * off unless PORTAL_STATUS_MAILS=on, never to a company with Send_Notification__c unticked,
 * and only for the statuses D.3 mails about, each as one of HYPOTEQ's mails M6–M13
 * (Mail-Texte 20.10.2026). The in-portal «Meldungen» are written either way.
 */

const mockDb = {
  portalCaseSeen: { findMany: jest.fn<any>(), upsert: jest.fn<any>() },
  portalNotification: { create: jest.fn<any>(), update: jest.fn<any>() },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));
const mockSend = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({ sendNotificationMail: (p: any) => mockSend(p) }));

import { MAIL_STATUSES, mailTemplateFor, syncNotifications, variantFor } from "@/lib/portal/notifications";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";
import { CASE_STATUSES } from "@/lib/portal/status";

const USER = { id: "u-1", email: "d.meier@meier-finanz.ch", name: "Daniel Meier", locale: "de", sfAccountId: "001BBBBBBBBBBBBBBB" };
const CONTACT = "003AAAAAAAAAAAAAAA";

function kase(id: string, status: string, missing = 0): PortalCaseSummary {
  return { id, nr: `HQ-${id}`, kunde: "Anna Muster", status, missingDocs: Array.from({ length: missing }, (_, i) => `Dok ${i}`) } as unknown as PortalCaseSummary;
}

const ENV = { ...process.env };
let created = 0;
beforeEach(() => {
  jest.clearAllMocks();
  created = 0;
  delete process.env.PORTAL_STATUS_MAILS;
  mockDb.portalCaseSeen.findMany.mockResolvedValue([
    { caseId: "1", status: "Wir prüfen die Unterlagen", missingCount: 0 },
    { caseId: "2", status: "Bei der Bank in Prüfung", missingCount: 0 },
  ]);
  mockDb.portalCaseSeen.upsert.mockResolvedValue({});
  mockDb.portalNotification.create.mockImplementation(async ({ data }: any) => ({ id: `n-${++created}`, ...data }));
  mockDb.portalNotification.update.mockResolvedValue({});
  mockSend.mockResolvedValue(undefined);
});
afterEach(() => {
  process.env = { ...ENV };
});

// Case 1 moves to «Anfrage wird für die Bank vorbereitet» (D.3: no mail), Case 2 to «Angebot
// liegt vor» (mail), Case 3 is new to the partner (mail).
const CASES = [kase("1", "Anfrage wird für die Bank vorbereitet"), kase("2", "Angebot liegt vor"), kase("3", "Anfrage eingegangen")];

describe("syncNotifications — e-mails", () => {
  it("writes the Meldungen but mails nothing by default", async () => {
    const n = await syncNotifications(USER, CONTACT, CASES, { origin: "https://portal.example", accountNotify: async () => true });
    expect(n).toBe(3);
    expect(mockDb.portalNotification.create).toHaveBeenCalledTimes(3);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("with PORTAL_STATUS_MAILS=on mails what D.3 mails about", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    await syncNotifications(USER, CONTACT, CASES, { origin: "https://portal.example", accountNotify: async () => true });
    // «Anfrage wird für die Bank vorbereitet» is a Meldung only; the offer (M9) and the new Case (M6) are mailed.
    expect(mockSend.mock.calls.map((c: any) => [c[0].caseId, c[0].mail])).toEqual([
      ["2", "offer"],
      ["3", "received"],
    ]);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ to: USER.email, name: "Daniel Meier", locale: "de", kunde: "Anna Muster", caseNr: "HQ-2" });
    expect(mockDb.portalNotification.update).toHaveBeenCalledTimes(2);
  });

  it("mails nothing for the three D.3 «nein» statuses, but writes their Meldungen", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    mockDb.portalCaseSeen.findMany.mockResolvedValue([
      { caseId: "1", status: "Anfrage eingegangen", missingCount: 0 },
      { caseId: "2", status: "Wir prüfen die Unterlagen", missingCount: 0 },
      { caseId: "3", status: "Bei der Bank in Prüfung", missingCount: 0 },
    ]);
    const accountNotify = jest.fn(async (_accountId: string | null) => true);
    const cases = [kase("1", "Wir prüfen die Unterlagen"), kase("2", "Anfrage wird für die Bank vorbereitet"), kase("3", "Anfrage zurückgezogen")];
    expect(await syncNotifications(USER, CONTACT, cases, { origin: "x", accountNotify })).toBe(3);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("M7 carries the number of missing documents, also when only the count rises", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    mockDb.portalCaseSeen.findMany.mockResolvedValue([
      { caseId: "1", status: "Wir prüfen die Unterlagen", missingCount: 0 },
      { caseId: "2", status: "Unterlagen fehlen noch", missingCount: 1 },
    ]);
    await syncNotifications(USER, CONTACT, [kase("1", "Unterlagen fehlen noch", 0), kase("2", "Unterlagen fehlen noch", 3)], { origin: "x", accountNotify: async () => true });
    expect(mockSend.mock.calls.map((c: any) => [c[0].caseId, c[0].mail, c[0].missing])).toEqual([
      ["1", "missing", 0],
      ["2", "missing", 3],
    ]);
  });

  it("never sends two mails for the same Case in one sync", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    await syncNotifications(USER, CONTACT, [kase("2", "Angebot liegt vor"), kase("2", "Angebot liegt vor")], { origin: "x", accountNotify: async () => true });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("never mails a company whose Send_Notification__c is unticked", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    const accountNotify = jest.fn(async (_accountId: string | null) => false);
    await syncNotifications(USER, CONTACT, CASES, { origin: "https://portal.example", accountNotify });
    expect(accountNotify).toHaveBeenCalledWith(USER.sfAccountId);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockDb.portalNotification.create).toHaveBeenCalledTimes(3);
  });

  it("mails when the checkbox cannot be read (null), as before it existed", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    await syncNotifications(USER, CONTACT, CASES, { origin: "https://portal.example", accountNotify: async () => null });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("does not ask Salesforce when nothing would be mailed", async () => {
    process.env.PORTAL_STATUS_MAILS = "on";
    const accountNotify = jest.fn(async (_accountId: string | null) => true);
    await syncNotifications(USER, CONTACT, [kase("1", "Anfrage wird für die Bank vorbereitet"), kase("2", "Bei der Bank in Prüfung")], { origin: "x", accountNotify });
    expect(accountNotify).not.toHaveBeenCalled();
  });
});

describe("mailTemplateFor (D.3 «Auto-Mail an Partner», Mail-Texte M6–M13)", () => {
  it.each([
    ["Anfrage eingegangen", "received"],
    ["Unterlagen fehlen noch", "missing"],
    ["Wir prüfen die Unterlagen", null],
    ["Anfrage wird für die Bank vorbereitet", null],
    ["Bei der Bank in Prüfung", "lender"],
    ["Angebot liegt vor", "offer"],
    ["Kleine Nacharbeit nötig", "rework"],
    ["Finanzierung bestätigt", "confirmed"],
    ["Abgeschlossen", "closed"],
    ["Leider abgelehnt", "declined"],
    ["Anfrage zurückgezogen", null],
  ])("%s → %s", (status, mail) => {
    expect(mailTemplateFor({ ...variantFor(status), status })).toBe(mail);
  });
  it("mails exactly the statuses D.3 marks «ja»", () => {
    for (const status of CASE_STATUSES) {
      expect(mailTemplateFor({ ...variantFor(status), status }) !== null).toBe((MAIL_STATUSES as string[]).includes(status));
    }
  });
  it("a newly assigned Case is M6, more missing documents M7 (M10 under «Kleine Nacharbeit nötig»), whatever the status", () => {
    expect(mailTemplateFor({ kind: "new_case", variant: "new_case", status: "Wir prüfen die Unterlagen" })).toBe("received");
    expect(mailTemplateFor({ kind: "new_case", variant: "new_case", status: "Angebot liegt vor" })).toBe("received");
    expect(mailTemplateFor({ kind: "docs", variant: "docs", status: "Wir prüfen die Unterlagen" })).toBe("missing");
    expect(mailTemplateFor({ kind: "docs", variant: "rework", status: "Kleine Nacharbeit nötig" })).toBe("rework");
  });
});
