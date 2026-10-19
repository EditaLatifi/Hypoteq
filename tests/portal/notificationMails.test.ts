import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * The portal's own notification e-mails (HYPOTEQ 19.10.2026 B24 / E.2, DECISIONS P32):
 * off unless PORTAL_STATUS_MAILS=on, never to a company with Send_Notification__c unticked,
 * and only for the statuses D.3 mails about. The in-portal «Meldungen» are written either way.
 */

const mockDb = {
  portalCaseSeen: { findMany: jest.fn<any>(), upsert: jest.fn<any>() },
  portalNotification: { create: jest.fn<any>(), update: jest.fn<any>() },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));
const mockSend = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({ sendNotificationMail: (p: any) => mockSend(p) }));

import { mailsFor, syncNotifications } from "@/lib/portal/notifications";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";

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
    // «Anfrage wird für die Bank vorbereitet» is a Meldung only; the offer and the new Case are mailed.
    expect(mockSend.mock.calls.map((c: any) => c[0].caseId)).toEqual(["2", "3"]);
    expect(mockDb.portalNotification.update).toHaveBeenCalledTimes(2);
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

describe("mailsFor (D.3 «Auto-Mail an Partner»)", () => {
  it.each([
    ["Anfrage eingegangen", true],
    ["Unterlagen fehlen noch", true],
    ["Wir prüfen die Unterlagen", false],
    ["Anfrage wird für die Bank vorbereitet", false],
    ["Bei der Bank in Prüfung", true],
    ["Angebot liegt vor", true],
    ["Kleine Nacharbeit nötig", true],
    ["Finanzierung bestätigt", true],
    ["Abgeschlossen", true],
    ["Leider abgelehnt", true],
    ["Anfrage zurückgezogen", false],
  ])("%s → %s", (status, yes) => {
    expect(mailsFor({ kind: "status", status })).toBe(yes);
  });
  it("a newly assigned Case and more missing documents are always mailed", () => {
    expect(mailsFor({ kind: "new_case", status: "Wir prüfen die Unterlagen" })).toBe(true);
    expect(mailsFor({ kind: "docs", status: "Wir prüfen die Unterlagen" })).toBe(true);
  });
});
