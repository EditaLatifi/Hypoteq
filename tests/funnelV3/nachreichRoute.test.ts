import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { ANNA, CASE, GARY, INQUIRY, TOKEN, analysis, existingRows, heldRow, inquiryRow, v3StateFor } from "./nachreichFixtures";

/**
 * app/api/nachreichen/[token]: v3 inquiries take the v3 path, legacy ones the unchanged one.
 * Prisma, SharePoint (Graph via fetch), Salesforce and mail are all fakes.
 */

const mockDb: { inquiry: any; documents: any[]; held: any[]; inquiryUpdates: any[]; created: any[]; selects: any[] } = {
  inquiry: null,
  documents: [],
  held: [],
  inquiryUpdates: [],
  created: [],
  selects: [],
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    inquiry: {
      findUnique: async (args: any) => {
        mockDb.selects.push(args.select);
        return mockDb.inquiry && args.where.nachreichToken === mockDb.inquiry.nachreichToken ? { ...mockDb.inquiry } : null;
      },
      update: async (args: any) => {
        mockDb.inquiryUpdates.push(args);
        return { id: args.where.id };
      },
    },
    document: {
      findMany: async ({ where }: any) => mockDb.documents.filter((d) => d.inquiryId === where.inquiryId).map((d) => ({ ...d })),
      update: async ({ where, data }: any) => {
        const d = mockDb.documents.find((x) => x.id === where.id);
        if (d) Object.assign(d, data);
        return { id: where.id };
      },
      create: async ({ data }: any) => {
        mockDb.created.push(data);
        return { id: `new-${mockDb.created.length}` };
      },
    },
  },
}));

jest.mock("@/lib/sharepoint", () => ({
  getAccessToken: async () => "TOKEN",
  deleteDriveItem: async () => {},
  getOrCreateSubmissionFolder: async () => "FOLDER",
  adoptHoldingDocuments: async (inquiryId: string, submissionId: string, details: any[]) => {
    const listed = new Set(details.map((d) => d.documentId));
    const take = mockDb.held.filter((h) => h.submissionId === submissionId && listed.has(h.id));
    mockDb.documents.push(...take.map(({ submissionId: _s, ...h }) => ({ ...h, inquiryId })));
    mockDb.held = mockDb.held.filter((h) => !take.includes(h));
    return take.length;
  },
}));

jest.mock("@/lib/funnel-v3/dossier", () => {
  const actual = jest.requireActual("@/lib/funnel-v3/dossier") as object;
  return { ...actual, createDossierPdf: async () => new Uint8Array([37, 80, 68, 70]) };
});

const mockSf = { legacy: [] as any[], v3: [] as any[] };
jest.mock("@/components/updateCaseCompleteness", () => ({
  updateCaseCompleteness: async (caseId: string, update: any) => void mockSf.legacy.push({ caseId, ...update }),
  updateCaseV3Documents: async (caseId: string, build: (p: string | null) => any) => {
    const fields = build(JSON.stringify({ checked: { "Ausweis Kopie": true }, filters: {}, savedAt: "old" }));
    mockSf.v3.push({ caseId, fields });
    return fields;
  },
}));

const mockMails: any[] = [];
jest.mock("@/components/nachreichMail", () => ({
  sendNachreichConfirmation: async (p: any) => void mockMails.push(p),
}));

import { GET, POST } from "@/app/api/nachreichen/[token]/route";

/** Graph as completion.ts calls it: item lookup, rename, dossier upload. */
const drive = new Map<string, { id: string; name: string; webUrl: string }>();
const graphCalls: string[] = [];
const realFetch = global.fetch;

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockDb.inquiry = null;
  mockDb.documents = [];
  mockDb.held = [];
  mockDb.inquiryUpdates = [];
  mockDb.created = [];
  mockDb.selects = [];
  mockSf.legacy = [];
  mockSf.v3 = [];
  mockMails.length = 0;
  drive.clear();
  graphCalls.length = 0;
  (global as any).fetch = jest.fn(async (url: any, init: any = {}) => {
    const u = String(url);
    const method = init.method || "GET";
    graphCalls.push(`${method} ${u}`);
    const json = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (method === "PUT" && u.includes(":/content")) {
      const name = decodeURIComponent(u.split(":/")[1]);
      return json({ id: "dossier-item", name, webUrl: `https://sp.example/case/${name}` });
    }
    const id = decodeURIComponent(u.split("/items/")[1].split("?")[0]);
    if (method === "GET") {
      if (id === "FOLDER") return json({ id, name: "folder", webUrl: "https://sp.example/case" });
      const it = drive.get(id);
      return it ? json({ ...it, parentReference: { id: "FOLDER" } }) : json({}, 404);
    }
    if (method === "PATCH") {
      const name = JSON.parse(init.body).name;
      const taken = [...drive.values()].find((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== id);
      if (taken) return json({ error: "nameAlreadyExists" }, 409);
      const next = { id, name, webUrl: `https://sp.example/case/${encodeURIComponent(name)}` };
      drive.set(id, next);
      return json({ ...next, parentReference: { id: "FOLDER" } });
    }
    return json({}, 400);
  });
});

afterEach(() => {
  (global as any).fetch = realFetch;
});

const req = (body?: any) =>
  new Request(`http://localhost/api/nachreichen/${TOKEN}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const ctx = { params: { token: TOKEN } };

function seedV3(lang = "de") {
  mockDb.inquiry = { ...inquiryRow({ v3State: v3StateFor([GARY, ANNA], lang) }), nachreichToken: TOKEN };
  mockDb.documents = existingRows().map((r) => ({ ...r, inquiryId: INQUIRY }));
  for (const r of mockDb.documents) if (r.driveItemId) drive.set(r.driveItemId, { id: r.driveItemId, name: r.fileName, webUrl: r.fileUrl });
}

function seedLegacy() {
  mockDb.inquiry = {
    id: "legacy-1",
    nachreichToken: TOKEN,
    documentsComplete: false,
    documentsMissing: "funnel.passportIDAllBorrowers,funnel.landRegistryNotOlder6Months",
    nachreichExpiresAt: new Date(Date.now() + 86_400_000),
    nachreichCompletedAt: null,
    salesforceCaseId: "500OLD",
    sharepointFolderId: "OLDFOLDER",
    client: { email: "anna@example.ch", firstName: "Anna", lastName: "Muster" },
    caseNumber: null,
    v3State: null,
    v3Skipped: null,
  };
}

describe("GET /api/nachreichen/[token]", () => {
  it("legacy inquiry: the old shape, old keys, nothing v3", async () => {
    seedLegacy();
    const res = await GET(req(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Object.keys(json).sort()).toEqual(["email", "expiresAt", "folderId", "missing", "submissionId", "valid"]);
    expect(json.missing).toEqual(["funnel.passportIDAllBorrowers", "funnel.landRegistryNotOlder6Months"]);
    expect(json).toMatchObject({ valid: true, email: "anna@example.ch", folderId: "OLDFOLDER", submissionId: "legacy-1" });
  });

  it("v3 inquiry: {v3, lang, caseNumber, missing[{instanceId, label, group}], folderId, submissionId}", async () => {
    seedV3("fr");
    const res = await GET(req(), ctx);
    const json = await res.json();
    expect(json).toMatchObject({ valid: true, v3: true, lang: "fr", caseNumber: CASE, folderId: "FOLDER", submissionId: INQUIRY, email: "gary.gerber@example.ch" });
    expect(json.missing[0]).toMatchObject({ instanceId: "fotos", label: "Photos du bien (intérieur et extérieur)", group: "objekt" });
    expect(json.missing.find((m: any) => m.instanceId === "id#b2")).toMatchObject({ label: "Passeport / carte d’identité – Anna Muster", group: "person" });
    // The new columns are selected.
    expect(mockDb.selects[0]).toMatchObject({ v3State: true, v3Skipped: true, caseNumber: true });
  });

  it("rejections are unchanged", async () => {
    expect((await GET(req(), ctx)).status).toBe(404);
    seedV3();
    mockDb.inquiry.nachreichExpiresAt = new Date(Date.now() - 1000);
    expect((await GET(req(), ctx)).status).toBe(410);
  });

  it("a complete v3 dossier answers the status view, not 410 (the confirmation mail links here, D20)", async () => {
    seedV3();
    mockDb.inquiry.documentsComplete = true;
    mockDb.inquiry.documentsMissing = null;
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    // The view judges the documents themselves, not the stored flag — what it lists is what
    // is really still missing; the fixture's rows have gaps, so the list is honest here.
    expect(await res.json()).toMatchObject({ valid: true, v3: true, caseNumber: CASE });
    // A legacy complete inquiry is still rejected.
    seedLegacy();
    mockDb.inquiry.documentsComplete = true;
    expect((await GET(req(), ctx)).status).toBe(410);
  });

  it("a complete v3 dossier still takes documents (D26): the gate opens, the body is checked as usual", async () => {
    seedV3();
    mockDb.inquiry.documentsComplete = true;
    const res = await POST(req({ documents: [] }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No documents" });
    // A complete legacy inquiry is still rejected.
    seedLegacy();
    mockDb.inquiry.documentsComplete = true;
    expect((await POST(req({ files: [] }), ctx)).status).toBe(410);
  });
});

describe("POST /api/nachreichen/[token]", () => {
  it("legacy inquiry: providedKeys, Document rows, updateCaseCompleteness, mail — as before", async () => {
    seedLegacy();
    const res = await POST(
      req({ providedKeys: ["funnel.passportIDAllBorrowers", "funnel.somethingElse"], files: [{ name: "id.pdf", url: "https://sp/id.pdf" }], locale: "fr" }),
      ctx
    );
    const json = await res.json();
    expect(json).toEqual({ ok: true, complete: false, remaining: ["funnel.landRegistryNotOlder6Months"] });
    expect(mockDb.inquiryUpdates[0].data).toEqual({ documentsMissing: "funnel.landRegistryNotOlder6Months", documentsComplete: false, nachreichCompletedAt: null });
    expect(mockDb.created).toEqual([{ inquiryId: "legacy-1", email: "anna@example.ch", fileName: "id.pdf", fileUrl: "https://sp/id.pdf" }]);
    expect(mockSf.legacy).toEqual([
      { caseId: "500OLD", complete: false, missing: ["funnel.landRegistryNotOlder6Months"], supplied: ["funnel.passportIDAllBorrowers"], submissionId: "legacy-1" },
    ]);
    expect(mockSf.v3).toEqual([]);
    expect(mockMails).toEqual([{ to: "anna@example.ch", name: "Anna Muster", locale: "fr", complete: false, remaining: ["funnel.landRegistryNotOlder6Months"] }]);
    expect(graphCalls).toEqual([]);
  });

  it("v3 inquiry: adopts, renames, recomputes, updates Inquiry and Case (v3 fields), mails v3 labels", async () => {
    seedV3();
    mockDb.held = [
      { ...heldRow("h-fotos", "IMG_2041.pdf", analysis("fotos"), 1), submissionId: INQUIRY },
      { ...heldRow("h-lohn", "Lohnausweis 2023.pdf", analysis("lohnausweise", { docDate: "2023" }), 2), submissionId: INQUIRY },
      { ...heldRow("h-other", "fremd.pdf", analysis("fotos"), 3), submissionId: "another-submission" },
    ];
    for (const h of mockDb.held) drive.set(h.driveItemId, { id: h.driveItemId, name: h.fileName, webUrl: h.fileUrl });

    const res = await POST(
      req({
        documents: [
          { documentId: "h-fotos", instanceId: "fotos", requirementId: "fotos" },
          { documentId: "h-lohn", instanceId: "lohnausweise#b1", requirementId: "lohnausweise" },
          { documentId: "h-other", instanceId: "id#b2", requirementId: "id" },
        ],
        locale: "en",
      }),
      ctx
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.v3).toBe(true);
    expect(json.complete).toBe(false);
    expect(json.remaining[0]).toEqual({ instanceId: "id#b2", label: "Pass / Identitätskarte – Anna Muster" });

    // Adopted onto the inquiry (another submission's upload is not), renamed in the folder.
    const ids = mockDb.documents.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["h-fotos", "h-lohn"]));
    expect(ids).not.toContain("h-other");
    expect(mockDb.documents.find((d) => d.id === "h-fotos").storedName).toBe(`${CASE}_03_Fotos.pdf`);
    expect(mockDb.documents.find((d) => d.id === "h-lohn").storedName).toBe(`${CASE}_01_Lohnausweis_Gerber-Gary_2023_1.pdf`);
    expect(graphCalls.some((c) => c.startsWith("PATCH"))).toBe(true);
    // The refreshed Fall-Dossier.
    expect(graphCalls.some((c) => c.startsWith("PUT") && c.includes(`${CASE}_00_Fall-Dossier.pdf`))).toBe(true);

    // The verdict on the inquiry.
    const upd = mockDb.inquiryUpdates.find((u) => "documentsMissing" in u.data);
    expect(upd.data).toEqual({
      documentsMissing: "id#b2,lohnausweise#b2,lohnabrechnungen#b2,anstellung#b2,pk#b2,steuer#b2",
      documentsComplete: false,
      nachreichCompletedAt: null,
    });

    // Salesforce through the v3 path only.
    expect(mockSf.legacy).toEqual([]);
    expect(mockSf.v3).toHaveLength(1);
    const f = mockSf.v3[0].fields;
    expect(mockSf.v3[0].caseId).toBe("500CASE");
    expect(f).toMatchObject({ Dok_Fotos_der_Immobilie__c: true, Dok_Lohnausweis__c: false, Documents_completed__c: false, SharePoint_Doc__c: "https://sp.example/case" });
    expect(JSON.parse(f.Dokumenten_Check_State__c).checked["Ausweis Kopie"]).toBe(true);

    // Mail in the inquiry's language (de), not the page's.
    expect(mockMails).toHaveLength(1);
    expect(mockMails[0]).toMatchObject({ to: "gary.gerber@example.ch", locale: "de", complete: false });
    expect(mockMails[0].remainingLabels[0]).toBe("Pass / Identitätskarte – Anna Muster");
  });

  it("v3 inquiry without new files: 400, nothing written", async () => {
    seedV3();
    const res = await POST(req({ documents: [] }), ctx);
    expect(res.status).toBe(400);
    expect(mockDb.inquiryUpdates).toEqual([]);
    expect(mockSf.v3).toEqual([]);
    expect(mockMails).toEqual([]);
  });
});
