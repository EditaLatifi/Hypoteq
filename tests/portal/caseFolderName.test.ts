/**
 * Every Salesforce Case id starts with «500», so a folder name cut to the first 8 characters
 * of `case-<id>` was «case-500» for every Case: all Cases a partner uploaded to on one day
 * shared one SharePoint folder and listed each other's files.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { getOrCreateSubmissionFolder } from "@/lib/sharepoint";

describe("getOrCreateSubmissionFolder folder tag", () => {
  const realFetch = global.fetch;
  let requested: string[];

  beforeEach(() => {
    requested = [];
    process.env.DRIVE_ID = "drive";
    process.env.FOLDER_ID = "root";
    global.fetch = jest.fn(async (url: any) => {
      requested.push(String(url));
      return { ok: true, json: async () => ({ id: "folder-1" }) } as any;
    }) as any;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  // The lookup addresses the folder by path: …/items/<root>:/<folder name>
  const folderOf = () => decodeURIComponent(requested[0].slice(requested[0].lastIndexOf(":/") + 2));

  it("keeps the whole tag, so two Cases never share a folder", async () => {
    await getOrCreateSubmissionFolder("anna@firma.ch", "500Ab00000XyZ12AAA", "token", { tag: "case-500Ab00000XyZ12AAA" });
    expect(folderOf()).toMatch(/^anna@firma\.ch_\d\d-\d\d-\d{4}_case-500Ab00000XyZ12AAA$/);
  });

  it("still cuts a submission id to 8 characters without a tag", async () => {
    await getOrCreateSubmissionFolder("anna@firma.ch", "3f9a1c2b-0000-4000-8000-000000000000", "token");
    expect(folderOf()).toMatch(/_3f9a1c2b$/);
  });
});
