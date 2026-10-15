import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

/**
 * «Eigene Dokumente» (lib/portal/partnerDocuments.ts).
 *
 * Company documents are shared by every user of a partner company and are opened through
 * the portal only. Asserted here: what counts as a PDF / PNG / JPEG is decided by the
 * bytes; only the company itself and HYPOTEQ admins may open a document; and the
 * company's SharePoint folder is found or created exactly once. Graph is a stub — nothing
 * leaves the process.
 */

const getDriveItem = jest.fn<(id: string, token: string) => Promise<any>>();
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/portal/scope", () => ({ scopeFor: async () => null }));
jest.mock("@/lib/portal/salesforce", () => ({ isSalesforceId: () => true }));
jest.mock("@/lib/sharepoint", () => ({
  getAccessToken: async () => "token",
  getDriveItem: (id: string, token: string) => getDriveItem(id, token),
}));

import {
  PARTNER_FOLDER_NAME,
  canOpenPartnerDocument,
  partnerDocExtOk,
  partnerFolder,
  readFileHead,
  sniffDocument,
  verifyPartnerUpload,
} from "@/lib/portal/partnerDocuments";

const ACCOUNT = "001AB00000abcdEFGH";
const bytes = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));

describe("sniffDocument", () => {
  it("knows PDF, PNG and JPEG by their first bytes", () => {
    expect(sniffDocument(bytes("%PDF-1.7\n%\xe2\xe3\xcf\xd3"))).toBe("application/pdf");
    expect(sniffDocument(bytes("\x00\x00junk before the header %PDF-1.4"))).toBe("application/pdf");
    expect(sniffDocument(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("image/png");
    expect(sniffDocument(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]))).toBe("image/jpeg");
  });

  it("refuses everything else, an HTML page called .pdf included", () => {
    expect(sniffDocument(bytes("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffDocument(bytes("PK\x03\x04 a zip, or a .docx"))).toBeNull();
    expect(sniffDocument(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffDocument(new Uint8Array(0))).toBeNull();
  });
});

describe("partnerDocExtOk", () => {
  it("takes the extensions the upload dialog offers", () => {
    expect(["a.pdf", "b.JPG", "c.jpeg", "d.png"].every(partnerDocExtOk)).toBe(true);
    expect(["e.svg", "f.html", "g.docx", "pdf"].some(partnerDocExtOk)).toBe(false);
  });
});

describe("canOpenPartnerDocument", () => {
  const doc = { accountId: ACCOUNT };

  it("lets the company's users and HYPOTEQ admins open it", () => {
    expect(canOpenPartnerDocument(doc, { isAdmin: false, accountId: ACCOUNT })).toBe(true);
    expect(canOpenPartnerDocument(doc, { isAdmin: true, accountId: null })).toBe(true);
  });

  it("refuses other companies and users without a company", () => {
    expect(canOpenPartnerDocument(doc, { isAdmin: false, accountId: "001AB00000zzzzZZZZ" })).toBe(false);
    expect(canOpenPartnerDocument(doc, { isAdmin: false, accountId: null })).toBe(false);
    expect(canOpenPartnerDocument({ accountId: null }, { isAdmin: false, accountId: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SharePoint folder, against a stubbed Graph
// ---------------------------------------------------------------------------

type Call = { method: string; url: string; body?: any };

function stubGraph(folders: Record<string, string>, opts: { createStatus?: number; afterCreate?: Record<string, string> } = {}) {
  const calls: Call[] = [];
  const spy = jest.spyOn(globalThis, "fetch").mockImplementation((async (input: any, init?: any) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined });
    const byPath = url.match(/\/items\/([^/:]+):\/([^?]+)\?/);
    if (method === "GET" && byPath) {
      const key = `${byPath[1]}/${decodeURIComponent(byPath[2])}`;
      const id = folders[key];
      return id ? new Response(JSON.stringify({ id, folder: {} }), { status: 200 }) : new Response("{}", { status: 404 });
    }
    if (method === "POST" && /\/children$/.test(url)) {
      if (opts.createStatus && opts.createStatus !== 201) {
        Object.assign(folders, opts.afterCreate || {});
        return new Response("{}", { status: opts.createStatus });
      }
      const parent = url.match(/\/items\/([^/]+)\/children$/)![1];
      const id = `new-${Object.keys(folders).length}`;
      folders[`${parent}/${JSON.parse(init.body).name}`] = id;
      return new Response(JSON.stringify({ id }), { status: 201 });
    }
    return new Response("{}", { status: 500 });
  }) as any);
  return { calls, spy };
}

describe("partnerFolder", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.DRIVE_ID = "drive";
    process.env.FOLDER_ID = "root";
    delete process.env.PORTAL_PARTNER_FOLDER_ID;
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it("reuses the company's folder when it exists", async () => {
    const { calls } = stubGraph({ [`root/${PARTNER_FOLDER_NAME}`]: "container", [`container/${ACCOUNT}`]: "company" });
    expect(await partnerFolder(ACCOUNT, "t", { create: true })).toBe("company");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("creates the container and the company folder, named after the Account Id, without renaming on conflict", async () => {
    const folders: Record<string, string> = {};
    const { calls } = stubGraph(folders);
    const id = await partnerFolder(ACCOUNT, "t", { create: true });
    const creates = calls.filter((c) => c.method === "POST");
    expect(creates.map((c) => c.body.name)).toEqual([PARTNER_FOLDER_NAME, ACCOUNT]);
    expect(creates.every((c) => c.body["@microsoft.graph.conflictBehavior"] === "fail")).toBe(true);
    expect(id).toBe(folders[`${folders[`root/${PARTNER_FOLDER_NAME}`]}/${ACCOUNT}`]);
  });

  it("takes the folder another upload created a moment earlier", async () => {
    stubGraph({ [`root/${PARTNER_FOLDER_NAME}`]: "container" }, { createStatus: 409, afterCreate: { [`container/${ACCOUNT}`]: "winner" } });
    expect(await partnerFolder(ACCOUNT, "t", { create: true })).toBe("winner");
  });

  it("only looks, without creating, when asked to", async () => {
    const { calls } = stubGraph({});
    expect(await partnerFolder(ACCOUNT, "t", { create: false })).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("uses PORTAL_PARTNER_FOLDER_ID as the container when set", async () => {
    process.env.PORTAL_PARTNER_FOLDER_ID = "configured";
    const { calls } = stubGraph({ [`configured/${ACCOUNT}`]: "company" });
    expect(await partnerFolder(ACCOUNT, "t", { create: true })).toBe("company");
    expect(calls.some((c) => c.url.includes("/items/root"))).toBe(false);
  });

  it("refuses an account id that could walk the folder tree", async () => {
    stubGraph({});
    await expect(partnerFolder("../../Kunden", "t", { create: true })).rejects.toThrow();
  });

  it("accepts an upload only when it sits in the company's folder", async () => {
    stubGraph({ [`root/${PARTNER_FOLDER_NAME}`]: "container", [`container/${ACCOUNT}`]: "company" });
    getDriveItem.mockResolvedValueOnce({ id: "item-0001", name: "HR.pdf", webUrl: null, size: 1, mimeType: null, parentId: "company" });
    expect(await verifyPartnerUpload(ACCOUNT, "item-0001", "t")).toMatchObject({ id: "item-0001" });
    getDriveItem.mockResolvedValueOnce({ id: "item-0002", name: "x.pdf", webUrl: null, size: 1, mimeType: null, parentId: "another-case-folder" });
    expect(await verifyPartnerUpload(ACCOUNT, "item-0002", "t")).toBeNull();
    expect(await verifyPartnerUpload(ACCOUNT, "../bad id", "t")).toBeNull();
  });
});

describe("readFileHead", () => {
  beforeEach(() => {
    process.env.DRIVE_ID = "drive";
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("asks for a range and reads no further than needed, even when the range is ignored", async () => {
    let range: string | null = null;
    jest.spyOn(globalThis, "fetch").mockImplementation((async (_url: any, init?: any) => {
      range = init?.headers?.Range ?? null;
      return new Response(new Uint8Array(5000).fill(65), { status: 200 });
    }) as any);
    const head = await readFileHead("item-0001", "t", 16);
    expect(range).toBe("bytes=0-15");
    expect(head.length).toBe(16);
  });
});
