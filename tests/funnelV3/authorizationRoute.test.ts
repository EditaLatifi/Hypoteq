/**
 * «Vorlage herunterladen» (Handover 6): app/api/funnel/authorization — the browser's data in,
 * the prefilled PDF out; no database before the closing.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { PDFDocument } from "pdf-lib";

jest.mock("@/lib/prisma", () => {
  throw new Error("the authorisation route must not touch the database");
});

import { GET, POST } from "@/app/api/funnel/authorization/route";

const value = async (res: Response, name: string) =>
  (await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))).getForm().getTextField(name).getText() ?? "";

const post = (body: string) => POST(new Request("http://x/api/funnel/authorization", { method: "POST", body }));

describe("/api/funnel/authorization", () => {
  it("POST: the prefilled PDF as a download, never cached", async () => {
    const res = await post(JSON.stringify({ lang: "de", caseNumber: "HQ-26-10-000123", signers: [{ vor: "Max Simon", nach: "Mustermann" }], zweck: "Ablösung" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="HQ-26-10-000123_HYPOTEQ_Auskunftsermaechtigung_Mustermann-Max-Simon.pdf"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await value(res, "Text2")).toBe("Mustermann");
  });

  it("POST: 400 for a broken body, 413 for an oversized one", async () => {
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ signers: "x" }))).status).toBe(400);
    expect((await post(JSON.stringify({ firma: "x".repeat(9000) }))).status).toBe(413);
  });

  it("GET ?lang=: the empty template of the language", async () => {
    const res = await GET(new Request("http://x/api/funnel/authorization?lang=fr"));
    expect(res.headers.get("content-disposition")).toContain('filename="HYPOTEQ_Pouvoir-d-information.pdf"');
    expect(await value(res, "Text1")).toBe("");
    const de = await GET(new Request("http://x/api/funnel/authorization?lang=xx"));
    expect(de.headers.get("content-disposition")).toContain("HYPOTEQ_Auskunftsermaechtigung.pdf");
  });
});
