/**
 * Funnel v3 document server side against an in-memory database, a fake SharePoint and a stub
 * provider: finalize (content hash) → analyse v3 → reuse → adoption carries the hash.
 * Nothing here reaches a real service (every environment points at production).
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { createHash } from "crypto";

type Row = Record<string, any>;
const db: { holding: Row[]; document: Row[]; inquiry: Row[] } = { holding: [], document: [], inquiry: [] };
let nextId = 1;
let hashColumn = true;
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) =>
    v && typeof v === "object" && "in" in (v as any) ? (v as any).in.includes(row[k]) : row[k] === v
  );
const table = (rows: () => Row[], set: (r: Row[]) => void) => ({
  create: async ({ data }: any) => {
    const row = { id: `row-${nextId++}`, uploadedAt: new Date(), aiAnalysis: null, ...data };
    rows().push(row);
    return row;
  },
  createMany: async ({ data }: any) => {
    for (const d of data) rows().push({ id: `row-${nextId++}`, ...d });
    return { count: data.length };
  },
  findUnique: async ({ where }: any) => rows().find((r) => matches(r, where)) ?? null,
  findMany: async ({ where }: any) => rows().filter((r) => matches(r, where)),
  update: async ({ where, data }: any) => {
    if ("contentHash" in data && !hashColumn) throw new Error("Unknown argument `contentHash`");
    const row = rows().find((r) => matches(r, where));
    if (!row) throw new Error("not found");
    Object.assign(row, data);
    return row;
  },
  delete: async ({ where }: any) => {
    const row = rows().find((r) => matches(r, where));
    set(rows().filter((r) => r !== row));
    return row;
  },
  deleteMany: async ({ where }: any) => {
    const before = rows().length;
    set(rows().filter((r) => !matches(r, where)));
    return { count: before - rows().length };
  },
});
const prismaMock: any = {
  holdingDocument: table(() => db.holding, (r) => (db.holding = r)),
  document: table(() => db.document, (r) => (db.document = r)),
  inquiry: table(() => db.inquiry, (r) => (db.inquiry = r)),
};
prismaMock.$transaction = async (fn: any) => fn(prismaMock);
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// ---- stub provider (no SDK call) ------------------------------------------------------
const analyseV3 = jest.fn(async (_input: any): Promise<any> => ({
  docType: "grundbuch",
  confidence: 0.96,
  personName: null,
  bank: null,
  docDate: "15.01.2026",
  note: null,
  fields: [{ key: "Eigentümer", value: "Gerber Gary Samuel", confidence: 0.97 }],
  durationMs: 7,
}));
jest.mock("@/components/documentIntelligence/v3/openaiProvider", () => ({
  OpenAIV3DocumentProvider: class {
    name = "stub";
    model = "stub-1";
    analyseV3 = analyseV3;
  },
}));
// The classic analysis must not be called by a v3 request.
const classicAnalyse = jest.fn();
jest.mock("@/components/documentIntelligence/analyse", () => ({ analyseDocument: classicAnalyse }));

// ---- fake SharePoint ------------------------------------------------------------------
const drive: Record<string, { name: string; parent: string; bytes: Buffer }> = {};
let downloads = 0;
(globalThis as any).fetch = jest.fn(async (url: any, init: any = {}) => {
  const u = String(url);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.includes("login.microsoftonline.com")) return json({ access_token: "tok", expires_in: 3600 });
  const m = u.match(/\/items\/([^/?]+)(\/content)?/);
  const id = m ? decodeURIComponent(m[1]) : "";
  const item = drive[id];
  if (init.method === "DELETE") {
    delete drive[id];
    return new Response(null, { status: 204 });
  }
  if (!item) return json({ error: { message: "not found" } }, 404);
  if (m?.[2]) {
    downloads++;
    return new Response(item.bytes, { status: 200 });
  }
  return json({
    id,
    name: item.name,
    webUrl: `https://sharepoint.example/${encodeURIComponent(item.name)}`,
    size: item.bytes.length,
    file: { mimeType: "application/pdf" },
    parentReference: { id: item.parent },
  });
});

import { POST as finalize } from "@/app/api/upload-doc/finalize/route";
import { POST as analyse } from "@/app/api/document-intelligence/analyse/route";
import { adoptHoldingDocuments } from "@/lib/sharepoint";

const SUBMISSION = "11111111-2222-4333-8444-555555555555";
const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function upload(itemId: string) {
  const res = await finalize(
    post({ driveItemId: itemId, folderId: "folder-A", originalFileName: `${itemId}.pdf`, email: "kunde@example.com", submissionId: SUBMISSION })
  );
  return (await res.json()) as any;
}

beforeEach(() => {
  db.holding = [];
  db.document = [];
  db.inquiry = [];
  hashColumn = true;
  downloads = 0;
  analyseV3.mockClear();
  classicAnalyse.mockClear();
  for (const k of Object.keys(drive)) delete drive[k];
  drive["gb"] = { name: "Grundbuchauszug.pdf", parent: "folder-A", bytes: Buffer.from("%PDF-1.4 grundbuch") };
  drive["gb2"] = { name: "Grundbuchauszug Kopie.pdf", parent: "folder-A", bytes: Buffer.from("%PDF-1.4 grundbuch") };
  drive["doc"] = { name: "Brief.docx", parent: "folder-A", bytes: Buffer.from("PK word") };
  process.env.DRIVE_ID = "drive";
  process.env.FOLDER_ID = "root";
  delete process.env.VERCEL_ENV;
});

describe("finalize: content hash", () => {
  it("hashes the file as SharePoint holds it, stores and returns it", async () => {
    const body = await upload("gb");
    expect(body.success).toBe(true);
    expect(body.contentHash).toBe(sha(drive["gb"].bytes));
    expect(db.holding[0].contentHash).toBe(body.contentHash);
    // Same content under another name: same hash (that is what duplicate detection needs).
    expect((await upload("gb2")).contentHash).toBe(body.contentHash);
  });

  it("still records the upload when the column does not exist yet", async () => {
    hashColumn = false;
    const body = await upload("gb");
    expect(body.success).toBe(true);
    expect(body.documentId).toBeTruthy();
    expect(db.holding).toHaveLength(1);
    expect(db.holding[0].contentHash).toBeUndefined();
  });
});

describe("analyse v3", () => {
  it("returns a V3Analysis with the row's content hash and stores it as aiAnalysis.v3", async () => {
    const { documentId, contentHash } = await upload("gb");
    const res = await analyse(post({ documentId, submissionId: SUBMISSION, v3: true }));
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(classicAnalyse).not.toHaveBeenCalled();
    expect(body.success).toBe(true);
    expect(body.analysis).toMatchObject({
      status: "done",
      docTypeId: "grundbuch",
      requirementId: "grundbuch",
      docDate: "2026-01-15",
      contentHash,
    });
    expect(body.analysis.fields["Eigentümer"]).toEqual({ value: "Gerber Gary Samuel", confidence: 0.97 });
    const row = db.holding[0];
    expect(row.aiDocType).toBe("grundbuch");
    expect(row.aiAnalysis.v3).toEqual(body.analysis);
    expect(row.aiAnalysis.audit).toMatchObject({ provider: "stub", model: "stub-1", originalFileName: "gb.pdf" });
    // The model saw the bytes read back from SharePoint, not anything from the browser.
    expect((analyseV3.mock.calls[0][0] as any).data.toString()).toBe("%PDF-1.4 grundbuch");
  });

  it("reuse answers from the row without a second model call", async () => {
    const { documentId } = await upload("gb");
    await analyse(post({ documentId, submissionId: SUBMISSION, v3: true }));
    const res = await analyse(post({ documentId, submissionId: SUBMISSION, v3: true, reuse: true }));
    const body = (await res.json()) as any;
    expect(body.reused).toBe(true);
    expect(body.analysis.docTypeId).toBe("grundbuch");
    expect(analyseV3).toHaveBeenCalledTimes(1);
  });

  it("fills in a missing hash from the bytes it reads", async () => {
    hashColumn = false;
    const { documentId } = await upload("gb");
    hashColumn = true;
    const body = (await (await analyse(post({ documentId, submissionId: SUBMISSION, v3: true }))).json()) as any;
    expect(body.analysis.contentHash).toBe(sha(drive["gb"].bytes));
    expect(db.holding[0].contentHash).toBe(body.analysis.contentHash);
  });

  it("answers a provider failure with status failed (HTTP 200), not an error page", async () => {
    analyseV3.mockImplementationOnce(async () => {
      throw new Error("timeout");
    });
    const { documentId } = await upload("gb");
    const res = await analyse(post({ documentId, submissionId: SUBMISSION, v3: true }));
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.analysis).toMatchObject({ status: "failed", docTypeId: null, extraKind: "unknown" });
    expect(db.holding[0].aiAnalysis).toBeNull();
  });

  it("refuses unknown documents and other submissions", async () => {
    const { documentId } = await upload("gb");
    expect((await analyse(post({ documentId, submissionId: "other", v3: true }))).status).toBe(404);
    expect((await analyse(post({ submissionId: SUBMISSION, v3: true }))).status).toBe(400);
  });

  it("does not send a Word file to the model", async () => {
    const { documentId } = await upload("doc");
    const body = (await (await analyse(post({ documentId, submissionId: SUBMISSION, v3: true }))).json()) as any;
    expect(body.analysis.status).toBe("failed");
    expect(analyseV3).not.toHaveBeenCalled();
  });

  it("reports a switched-off deployment as disabled", async () => {
    const env = process.env as Record<string, string | undefined>;
    const prevNode = env.NODE_ENV;
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "production";
    try {
      const { documentId } = await upload("gb");
      const body = (await (await analyse(post({ documentId, submissionId: SUBMISSION, v3: true }))).json()) as any;
      expect(body.disabled).toBe(true);
      expect(body.analysis.status).toBe("failed");
      expect(analyseV3).not.toHaveBeenCalled();
    } finally {
      env.NODE_ENV = prevNode;
      delete env.VERCEL_ENV;
    }
  });

  it("leaves the classic mode alone", async () => {
    classicAnalyse.mockImplementationOnce(async (req: any) => ({
      documentId: req.documentId,
      status: "classified",
      classification: { type: "land_register_extract", label: "Grundbuchauszug", confidence: 0.9 },
      fields: {},
      funnelDocKey: null,
      audit: { durationMs: 1 },
    }));
    const { documentId } = await upload("gb");
    const body = (await (await analyse(post({ documentId, submissionId: SUBMISSION }))).json()) as any;
    expect(body.analysis.classification.type).toBe("land_register_extract");
    expect(analyseV3).not.toHaveBeenCalled();
  });
});

describe("adoption", () => {
  it("carries the content hash to Document", async () => {
    const { documentId, contentHash } = await upload("gb");
    await adoptHoldingDocuments("inq-1", SUBMISSION, [{ documentId }]);
    expect(db.document[0]).toMatchObject({ id: documentId, contentHash });
  });
});
