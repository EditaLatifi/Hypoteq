/**
 * The daily cron (app/api/portal/cron) also sends the Auskunftsermächtigung reminders
 * (Handover 6 / 7.1) — after the partner sync, also when that fails, without failing it.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockPartners: { fail: boolean } = { fail: false };
const mockReminders = jest.fn(async () => ({ checked: 3, sent: 1 }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    portalUser: {
      findMany: async () => {
        if (mockPartners.fail) throw new Error("db down");
        return [];
      },
    },
  },
}));
jest.mock("@/lib/portal/notifications", () => ({ syncNotifications: async () => 0 }));
jest.mock("@/lib/portal/changeDecisions", () => ({ syncOpenChangeDecisions: async () => 0 }));
jest.mock("@/lib/portal/i18n/dict", () => ({ isLocale: () => true }));
jest.mock("@/lib/portal/salesforce", () => ({ listPartnerCases: async () => [] }));
jest.mock("@/lib/portal/scope", () => ({ scopeOfPartner: () => ({}) }));
jest.mock("@/lib/funnel-v3/signatureServer", () => ({ sendSignatureReminders: () => mockReminders() }));
// Spezifikation Datenabgleich 5.3: the Re-Upload reminders run in the same daily job.
const mockReuploads = jest.fn(async () => ({ checked: 2, sent: 1, resolved: 1 }));
jest.mock("@/lib/funnel-v3/reuploadServer", () => ({ sendReuploadReminders: () => mockReuploads() }));

import { GET } from "@/app/api/portal/cron/route";

const call = (auth = "Bearer s3cret") => GET(new Request("http://x/api/portal/cron", { headers: { authorization: auth } }));

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  mockPartners.fail = false;
  mockReminders.mockClear();
});

describe("/api/portal/cron", () => {
  it("runs the partner sync, the signature reminders and the Re-Upload reminders", async () => {
    const res = await call();
    expect(await res.json()).toEqual({ partners: 0, notifications: 0, failures: 0, signatures: { checked: 3, sent: 1 }, reuploads: { checked: 2, sent: 1, resolved: 1 }, changeDecisions: 0 });
    expect(mockReminders).toHaveBeenCalledTimes(1);
    expect(mockReuploads).toHaveBeenCalledTimes(1);
  });

  it("the reminders still run when the partner sync fails (which keeps failing as before)", async () => {
    mockPartners.fail = true;
    await expect(call()).rejects.toThrow("db down");
    expect(mockReminders).toHaveBeenCalledTimes(1);
  });

  it("without the secret: nothing runs", async () => {
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(mockReminders).not.toHaveBeenCalled();
  });
});
