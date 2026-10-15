import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

// No Graph call leaves the test: the SharePoint helpers are fakes.
const mockGetItem = jest.fn<any>();
const mockDelete = jest.fn<any>();
jest.mock("@/lib/sharepoint", () => ({
  getAccessToken: async () => "token",
  getDriveItem: (id: string) => mockGetItem(id),
  deleteDriveItem: (id: string) => mockDelete(id),
  createUploadSession: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { checkSpecialItem, removeSpecialFile, specialFolderName, uploadFileName } from "@/lib/portal/specialFiles";

const ID = "3f9a1c2b-0000-4000-8000-000000000000";
const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.HYPOTEQ_TEST_MODE;
  mockDelete.mockResolvedValue(undefined);
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("specialFolderName", () => {
  it("follows the funnel's scheme, dated by the request's creation day in Zurich", () => {
    // 23:30 UTC on the 14th is already the 15th in Zurich.
    expect(specialFolderName("anna@firma.ch", new Date("2026-10-14T23:30:00Z"), ID)).toBe("anna@firma.ch_15-10-2026_spezial-3f9a1c2b");
  });

  it("is the same on every call for the same request, so no folder id has to be stored", () => {
    const at = new Date("2026-10-15T08:00:00Z");
    expect(specialFolderName("anna@firma.ch", at, ID)).toBe(specialFolderName("anna@firma.ch", at, ID));
  });

  it("marks test uploads like the funnel does", () => {
    process.env.HYPOTEQ_TEST_MODE = "true";
    expect(specialFolderName("anna@firma.ch", new Date("2026-10-15T08:00:00Z"), ID)).toBe("ZZ-TEST_anna@firma.ch_15-10-2026_spezial-3f9a1c2b");
  });

  it("shortens a very long address, never the unique suffix", () => {
    const name = specialFolderName(`${"a".repeat(200)}@firma.ch`, new Date("2026-10-15T08:00:00Z"), ID);
    expect(name.endsWith("_15-10-2026_spezial-3f9a1c2b")).toBe(true);
  });
});

describe("uploadFileName", () => {
  it("keeps the extension when a long name is shortened", () => {
    const name = uploadFileName(`${"Mieterspiegel ".repeat(20)}.xlsx`);
    expect(name.endsWith(".xlsx")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(145);
  });

  it("cleans characters SharePoint refuses", () => {
    expect(uploadFileName('Plan "A": EG/OG.pdf')).toBe("Plan _A__ EG_OG.pdf");
  });
});

describe("checkSpecialItem", () => {
  const item = { id: "01ITEMID00", name: "Baubewilligung.pdf", webUrl: "https://sp/f", size: 2048, mimeType: "application/pdf", parentId: "folder-1" };

  it("takes a file that sits in the request's folder", async () => {
    mockGetItem.mockResolvedValue(item);
    expect(await checkSpecialItem("folder-1", item.id)).toEqual({
      ok: true,
      file: { fileName: "Baubewilligung.pdf", driveItemId: "01ITEMID00", webUrl: "https://sp/f", size: 2048 },
    });
  });

  it("refuses a file from anywhere else without touching it", async () => {
    mockGetItem.mockResolvedValue({ ...item, parentId: "another-case" });
    expect(await checkSpecialItem("folder-1", item.id)).toEqual({ ok: false, reason: "missing" });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes an upload that turns out to be the wrong type or too big", async () => {
    mockGetItem.mockResolvedValue({ ...item, name: "macro.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12" });
    expect(await checkSpecialItem("folder-1", item.id)).toEqual({ ok: false, reason: "type" });
    mockGetItem.mockResolvedValue({ ...item, size: 21 * 1024 * 1024 });
    expect(await checkSpecialItem("folder-1", item.id)).toEqual({ ok: false, reason: "size" });
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("does not look up ids that cannot be Graph ids", async () => {
    expect(await checkSpecialItem("folder-1", "../x")).toEqual({ ok: false, reason: "missing" });
    expect(mockGetItem).not.toHaveBeenCalled();
  });
});

describe("removeSpecialFile", () => {
  it("removes only files of the request's own folder", async () => {
    mockGetItem.mockResolvedValue({ id: "01ITEMID00", parentId: "folder-2" });
    expect(await removeSpecialFile("folder-1", "01ITEMID00")).toBe(false);
    expect(mockDelete).not.toHaveBeenCalled();
    mockGetItem.mockResolvedValue({ id: "01ITEMID00", parentId: "folder-1" });
    expect(await removeSpecialFile("folder-1", "01ITEMID00")).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith("01ITEMID00");
  });
});
