/**
 * app/api/inquiry: the mails of the closing, end to end through the route (Handover 7.1;
 * Rosanna's test: «Kunde erhält 2 Mails»). Prisma, SharePoint, the closing, Salesforce and the
 * Graph client are fakes — every sendMail the route makes is recorded, nothing leaves the process.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { CASE_NO, ablState, kaufState, v5Payload } from "./v5Fixtures";

const mockState: { posts: { path: string; body: any }[]; createFails: boolean; syncFails: boolean; completion: any; signature: any[]; updates: any[] } = {
  posts: [],
  createFails: false,
  syncFails: false,
  completion: null,
  signature: [],
  updates: [],
};

jest.mock("isomorphic-fetch", () => ({}));
jest.mock("@azure/identity", () => ({
  ClientSecretCredential: class {
    async getToken() {
      return { token: "TOKEN" };
    }
  },
}));
jest.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    initWithMiddleware: () => ({
      api: (path: string) => ({
        post: async (body: any) => {
          mockState.posts.push({ path, body });
          return {};
        },
      }),
    }),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    inquiry: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        if (mockState.createFails) throw new Error("db down");
        return { id: data.id };
      },
      update: async (args: any) => {
        mockState.updates.push(args);
        return { id: args.where.id };
      },
    },
    document: { findUnique: async ({ where }: any) => ({ driveItemId: `item-${where.id}` }) },
  },
}));
jest.mock("@/components/caseNumber", () => ({ allocateCaseNumber: async () => "HQ-26-10-123456" }));
jest.mock("@/lib/sharepoint", () => ({ adoptHoldingDocuments: async () => 0 }));
jest.mock("@/lib/funnel-v3/completion", () => {
  const actual = jest.requireActual("@/lib/funnel-v3/completion") as object;
  return { ...actual, completeV3Inquiry: async () => mockState.completion };
});
jest.mock("@/components/salesforceApi", () => ({
  __esModule: true,
  conn: { instanceUrl: "https://hypoteq-ch.my.salesforce.com" },
  default: { login: async () => {} },
}));
jest.mock("@/components/syncFunnelStepsToSalesforce", () => ({
  syncFunnelStepsToSalesforce: async () => {
    if (mockState.syncFails) throw new Error("INVALID_SESSION_ID");
    return { case: { id: "500AA000001xyzQ" }, droppedFields: [] };
  },
}));
jest.mock("@/lib/funnel-v3/signatureServer", () => ({
  recordSignatureAtSubmit: async (inquiryId: string, input: any) => void mockState.signature.push({ inquiryId, input }),
}));
jest.mock("@/lib/funnel-v3/authorization", () => ({
  buildAuthorizationPdf: async () => new Uint8Array([37, 80, 68, 70]),
  authorizationFileName: () => "HQ-26-10-123456_Auskunftsermaechtigung.pdf",
}));

import { POST } from "@/app/api/inquiry/route";

const ENV = { USE_GRAPH: "true", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", SMTP_USER: "info@hypoteq.ch" };
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockState.posts = [];
  mockState.createFails = false;
  mockState.syncFails = false;
  mockState.signature = [];
  mockState.updates = [];
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  saved.HYPOTEQ_TEST_MODE = process.env.HYPOTEQ_TEST_MODE;
  delete process.env.HYPOTEQ_TEST_MODE;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.restoreAllMocks();
});

async function submit(payload: any) {
  // The route reads the body as JSON, like the browser sends it.
  const body = JSON.parse(JSON.stringify(payload));
  delete body.v3Completion;
  const res = await POST(new Request("http://localhost/api/inquiry", { method: "POST", headers: { "content-type": "application/json", "accept-language": "de" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}

const to = (p: { body: any }) => p.body.message.toRecipients.map((r: any) => r.emailAddress.address);
const ccOf = (p: { body: any }) => p.body.message.ccRecipients;
const byRecipient = () => {
  const out: Record<string, number> = {};
  for (const p of mockState.posts) for (const a of to(p)) out[a] = (out[a] || 0) + 1;
  return out;
};

describe("v5 closing: exactly one mail per recipient (Handover 7.1, Rosanna «2 Mails»)", () => {
  it("Kunde entry: the customer gets one mail, HYPOTEQ intern one — no auto-response, no dossier mail", async () => {
    const payload = v5Payload(kaufState(), { missing: ["fotos"] });
    mockState.completion = payload.v3Completion;
    const res = await submit(payload);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, caseNumber: CASE_NO, salesforceSynced: true });
    expect(byRecipient()).toEqual({ "lea.muster@kunde.ch": 1, "info@hypoteq.ch": 1 });
    const kunde = mockState.posts.find((p) => to(p)[0] === "lea.muster@kunde.ch")!;
    expect(kunde.body.message.subject).toBe("Deine Finanzierungsanfrage HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(ccOf(kunde)).toBeUndefined();
    // The missing documents are in that one mail, not in a second «Fehlende Unterlagen» mail.
    expect(kunde.body.message.body.content).toContain("Diese Unterlagen fehlen noch:");
    expect(mockState.posts.some((p) => /Hypothekaranfrage ist eingegangen|Fehlende Unterlagen zu Ihrem Dossier|Dossier ist vollständig/.test(p.body.message.subject))).toBe(false);
    // The internal one links the Case in Lightning.
    const intern = mockState.posts.find((p) => to(p)[0] === "info@hypoteq.ch")!;
    expect(intern.body.message.subject).toBe("Neue Finanzierungsanfrage HQ-26-10-123456 – Lea Muster, 8001 Zürich");
    expect(intern.body.message.body.content).toContain("https://hypoteq-ch.lightning.force.com/lightning/r/Case/500AA000001xyzQ/view");
    expect(intern.body.message.replyTo).toEqual([{ emailAddress: { address: "lea.muster@kunde.ch", name: "Lea Muster" } }]);
  });

  it("Berater entry: customer, Berater and intern one each — the Berater no longer gets a copy of the customer mail", async () => {
    const payload = v5Payload(ablState());
    mockState.completion = payload.v3Completion;
    await submit(payload);
    expect(byRecipient()).toEqual({ "marco.beispiel@kunde.ch": 1, "bea.rater@partner.ch": 1, "info@hypoteq.ch": 1 });
    expect(mockState.posts.every((p) => ccOf(p) === undefined)).toBe(true);
    const berater = mockState.posts.find((p) => to(p)[0] === "bea.rater@partner.ch")!;
    expect(berater.body.message.subject).toBe("Finanzierungsanfrage HQ-26-10-123456 – Marco Beispiel, 3000 Bern");
  });

  it("signature pending: the template rides in the customer mail; the state is recorded as «later»", async () => {
    const payload = v5Payload(kaufState({ sig: { choice: "later", at: "2026-10-15T09:00:00.000Z", method: "upload" } }));
    mockState.completion = payload.v3Completion;
    await submit(payload);
    const kunde = mockState.posts.find((p) => to(p)[0] === "lea.muster@kunde.ch")!;
    expect(kunde.body.message.attachments).toEqual([
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "HQ-26-10-123456_Auskunftsermaechtigung.pdf", contentType: "application/pdf", contentBytes: "JVBERg==" },
    ]);
    expect(mockState.posts.filter((p) => p.body.message.attachments)).toHaveLength(1);
    expect(mockState.signature).toEqual([{ inquiryId: payload.submissionId, input: { state: "later" } }]);
  });

  it("signature uploaded: recorded with the stored file and its drive item", async () => {
    const payload = v5Payload(kaufState());
    mockState.completion = payload.v3Completion;
    await submit(payload);
    expect(mockState.signature).toEqual([
      { inquiryId: payload.submissionId, input: { state: "uploaded", fileName: `${CASE_NO}_doc-vollmacht-0.pdf`, driveItemId: "item-doc-vollmacht-0" } },
    ]);
    expect(mockState.posts.some((p) => p.body.message.attachments)).toBe(false);
  });

  it("Salesforce failed: the internal mail says so (plus the existing alert); the customer still gets one mail", async () => {
    mockState.syncFails = true;
    const payload = v5Payload(kaufState());
    mockState.completion = payload.v3Completion;
    await submit(payload);
    expect(byRecipient()["lea.muster@kunde.ch"]).toBe(1);
    const internal = mockState.posts.filter((p) => to(p)[0] === "info@hypoteq.ch");
    expect(internal.map((p) => p.body.message.subject)).toEqual([
      "Neue Finanzierungsanfrage HQ-26-10-123456 – Lea Muster, 8001 Zürich",
      `⚠️ Salesforce-Sync fehlgeschlagen – Anfrage ${payload.submissionId}`,
    ]);
    expect(internal[0].body.message.body.content).toContain("Salesforce-Sync fehlgeschlagen – der Case muss von Hand angelegt werden");
  });

  it("the DB write fails: the internal notification still goes out as the copy of the lead", async () => {
    mockState.createFails = true;
    const payload = v5Payload(kaufState());
    const res = await submit(payload);
    expect(res.status).toBe(500);
    expect(byRecipient()).toEqual({ "info@hypoteq.ch": 1 });
    expect(mockState.posts[0].body.message.subject).toMatch(/^Neue Hypothekanfrage \(Direktkunde\)/);
  });
});

describe("pre-v5 payloads keep their mails", () => {
  it("the legacy funnel: internal notification, auto-response and the dossier mail, as before", async () => {
    const legacy = {
      customerType: "direct",
      client: { firstName: "Lea", lastName: "Legacy", email: "lea@legacy.ch", phone: "079 000 00 00" },
      project: { projektArt: "kauf" },
      property: { zip: "8000", ort: "Zürich", kreditnehmer: [{ vorname: "Lea", name: "Legacy", email: "lea@legacy.ch" }] },
      financing: { kaufpreis: "1000000" },
      borrowers: [{ type: "nat" }],
      documentCompleteness: { complete: false, missing: ["funnel.salaryStatement"] },
    };
    await submit(legacy);
    const subjects = mockState.posts.map((p) => p.body.message.subject);
    expect(subjects[0]).toMatch(/^Neue Hypothekanfrage \(Direktkunde\)/);
    expect(subjects).toContain("Deine Hypothekaranfrage ist eingegangen");
    expect(subjects).toContain("HYPOTEQ - Fehlende Unterlagen zu Ihrem Dossier");
  });
});
