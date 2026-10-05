import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { previewInput } from "@/lib/funnel-v3/dossier/preview";
import { gerberFiles, gerberState, SUBMISSION } from "./gerberCase";

const findUnique = jest.fn<(args: any) => Promise<any>>();
jest.mock("@/lib/prisma", () => ({ prisma: { inquiry: { findUnique: (args: any) => findUnique(args) } } }));
jest.mock("@/lib/sharepoint", () => ({ getAccessToken: async () => "TOKEN" }));

import { POST as preview } from "@/app/api/dossier/preview/route";
import { GET as download } from "@/app/api/dossier/[inquiryId]/route";

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("previewInput", () => {
  it("keeps the funnel state and files, as a draft without a case number", () => {
    const s = gerberState();
    const input = previewInput({ lang: "it", state: s as any, files: gerberFiles(), skipped: ["verkaufsdoku"] });
    expect(input).toMatchObject({ lang: "it", draft: true, caseNumber: null, skipped: ["verkaufsdoku"] });
    expect(input.state.ans.antrag).toBe("Ablösung");
    expect(input.state.fin.val).toBe(1450000);
    expect(input.files).toHaveLength(30);
    expect(input.files[3]).toMatchObject({ instanceId: "grundbuch", outdatedOverride: true });
  });

  it("rejects nothing but drops what does not fit", () => {
    const input = previewInput({ lang: "xx", state: { ans: "nope", txt: { vor: 42, nach: "A".repeat(5000) }, fin: { val: -5, inc: "1" } }, files: [null, { id: "a", uploadState: "failed" }, { id: "b", name: "x.pdf", analysisState: "done", analysis: { fields: { k: { value: { evil: 1 } } } } }] } as any);
    expect(input.lang).toBe("de");
    expect(input.state.ans.kn).toBe("Natürliche Person");
    expect(input.state.txt.vor).toBe("");
    expect(input.state.txt.nach).toHaveLength(2000);
    expect(input.state.fin).toEqual({ old: 0, up: 0, kaufpreis: 0, inc: 0, val: 0 });
    expect(input.files.map((f) => f.id)).toEqual(["b"]);
    expect(input.files[0].analysis!.fields.k.value).toBeNull();
  });
});

describe("POST /api/dossier/preview", () => {
  it("returns an «Entwurf» PDF", async () => {
    const res = await preview(new Request("http://x/api/dossier/preview", { method: "POST", body: JSON.stringify({ lang: "de", state: gerberState(), files: gerberFiles() }) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("Fall-Dossier_Entwurf.pdf");
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(doc.getTitle()).toBe("Fall-Dossier Entwurf");
  });

  it("400 on invalid JSON, 413 on a huge body", async () => {
    expect((await preview(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await preview(new Request("http://x", { method: "POST", body: "x".repeat(2_000_001) }))).status).toBe(413);
  });
});

describe("GET /api/dossier/[inquiryId]", () => {
  const call = (id: string, sub: string | null) =>
    download(new Request(`http://x/api/dossier/${id}${sub === null ? "" : `?submissionId=${sub}`}`), { params: { inquiryId: id } });

  it("requires the matching submission id (404 otherwise, no DB lookup)", async () => {
    expect((await call(SUBMISSION, null)).status).toBe(404);
    expect((await call(SUBMISSION, "6f1c2b9e-0000-4c3b-9e8f-0a1b2c3d4e5f")).status).toBe(404);
    expect((await call("not-a-uuid", "not-a-uuid")).status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("streams the stored dossier from the case folder", async () => {
    findUnique.mockResolvedValueOnce({ id: SUBMISSION, caseNumber: "HQ-26-10-000123", sharepointFolderId: "FOLDER", createdAt: new Date() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }) as any);
    const res = await call(SUBMISSION, SUBMISSION);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("HQ-26-10-000123_00_Fall-Dossier.pdf");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/items/FOLDER:/HQ-26-10-000123_00_Fall-Dossier.pdf:/content");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF");
  });

  it("404 when the inquiry or the file does not exist, 410 after the download window", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect((await call(SUBMISSION, SUBMISSION)).status).toBe(404);
    findUnique.mockResolvedValueOnce({ id: SUBMISSION, caseNumber: "HQ-26-10-000123", sharepointFolderId: "FOLDER", createdAt: new Date() });
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }) as any);
    expect((await call(SUBMISSION, SUBMISSION)).status).toBe(404);
    findUnique.mockResolvedValueOnce({ id: SUBMISSION, caseNumber: "HQ-26-10-000123", sharepointFolderId: "FOLDER", createdAt: new Date(Date.now() - 8 * 86_400_000) });
    expect((await call(SUBMISSION, SUBMISSION)).status).toBe(410);
  });
});
