/**
 * app/api/inquiry with a Partner Fast Lead (DECISIONS P39): the partner comes from the invitation
 * behind the token — never from the browser —, the invitation is claimed before the sync, the
 * Case and case number go back on it, and the partner gets the closing mail. Prisma, the closing,
 * Salesforce, Graph and the invitation table are fakes.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { kaufState, v5Payload } from "./v5Fixtures";

const TOKEN = "L".repeat(43);
const PARTNER_LEAD = {
  leadId: "lead-1",
  email: "anna@muster.ch",
  name: "Anna Muster",
  company: "Muster AG",
  phone: "+41 44 000 00 00",
  contactId: "003PARTNERAAAAAAAA",
  accountId: "001PARTNERAAAAAAAA",
  invitedAt: "2026-11-23T09:00:00.000Z",
  caseId: "500LEADAAAAAAAAAAA",
  via: "link",
};

const mockState: {
  posts: any[];
  synced: any[];
  created: any[];
  lookups: string[];
  emailLookups: string[];
  claims: any[];
  recorded: any[];
  lead: any;
  emailLead: any;
  claimOk: boolean;
} = {
  posts: [],
  synced: [],
  created: [],
  lookups: [],
  emailLookups: [],
  claims: [],
  recorded: [],
  lead: null,
  emailLead: null,
  claimOk: true,
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
        mockState.created.push(data);
        return { id: data.id };
      },
      update: async (args: any) => ({ id: args.where.id }),
    },
    document: { findUnique: async () => null },
  },
}));
jest.mock("@/components/caseNumber", () => ({ allocateCaseNumber: async () => "HQ-26-11-123456" }));
jest.mock("@/lib/sharepoint", () => ({ adoptHoldingDocuments: async () => 0 }));
jest.mock("@/lib/funnel-v3/completion", () => {
  const actual = jest.requireActual("@/lib/funnel-v3/completion") as object;
  return { ...actual, completeV3Inquiry: async () => null };
});
jest.mock("@/components/salesforceApi", () => ({
  __esModule: true,
  conn: { instanceUrl: "https://hypoteq-ch.my.salesforce.com" },
  default: { login: async () => {} },
}));
jest.mock("@/components/syncFunnelStepsToSalesforce", () => ({
  syncFunnelStepsToSalesforce: async (data: any) => {
    mockState.synced.push(JSON.parse(JSON.stringify(data)));
    return { case: { id: "500CASEAAAAAAAAAAA" }, droppedFields: [] };
  },
}));
jest.mock("@/components/partnerDirectory", () => ({ resolvePartner: async () => ({ status: "unknown" }) }));
jest.mock("@/lib/funnel-v3/signatureServer", () => ({ recordSignatureAtSubmit: async () => {} }));
jest.mock("@/lib/funnel-v3/authorization", () => ({
  buildAuthorizationPdf: async () => new Uint8Array([37, 80, 68, 70]),
  authorizationFileName: () => "HQ-26-11-123456_Auskunftsermaechtigung.pdf",
}));
jest.mock("@/lib/portal/leadServer", () => ({
  leadPartnerForSubmit: async (token: string) => {
    mockState.lookups.push(token);
    return mockState.lead;
  },
  leadPartnerForEmail: async (email: string) => {
    mockState.emailLookups.push(email);
    return mockState.emailLead;
  },
  claimLead: async (leadId: string, inquiryId: string) => {
    mockState.claims.push({ leadId, inquiryId });
    return mockState.claimOk;
  },
  recordLeadCase: async (leadId: string, data: any) => void mockState.recorded.push({ leadId, ...data }),
}));

import { POST } from "@/app/api/inquiry/route";

const ENV = { USE_GRAPH: "true", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", SMTP_USER: "info@hypoteq.ch" };
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(mockState, { posts: [], synced: [], created: [], lookups: [], emailLookups: [], claims: [], recorded: [], lead: PARTNER_LEAD, emailLead: null, claimOk: true });
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
  const body = JSON.parse(JSON.stringify(payload));
  delete body.v3Completion;
  const res = await POST(new Request("http://localhost/api/inquiry", { method: "POST", headers: { "content-type": "application/json", "accept-language": "de" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const recipients = () => mockState.posts.map((p) => p.body.message.toRecipients.map((r: any) => r.emailAddress.address).join(","));

describe("/api/inquiry with a partner's invitation", () => {
  it("credits the partner from the invitation, claims it, records the Case and mails the partner", async () => {
    const res = await submit({ ...v5Payload(kaufState()), lead: { token: TOKEN } });
    expect(res.status).toBe(200);
    expect(mockState.lookups).toEqual([TOKEN]);
    expect(mockState.synced[0].partnerLead).toEqual(PARTNER_LEAD);
    expect(mockState.synced[0].lead).toBeUndefined();
    expect(mockState.created[0].client.create.partnerEmail).toBe("anna@muster.ch");
    expect(mockState.claims).toEqual([{ leadId: "lead-1", inquiryId: res.json.inquiryId }]);
    expect(mockState.recorded).toEqual([{ leadId: "lead-1", caseNumber: "HQ-26-11-123456", salesforceCaseId: "500CASEAAAAAAAAAAA" }]);
    expect(recipients()).toEqual(["lea.muster@kunde.ch", "anna@muster.ch", "info@hypoteq.ch"]);
  });

  it("drops a partnerLead the browser sent — only the server sets it", async () => {
    mockState.lead = null;
    const forged = { ...v5Payload(kaufState()), partnerLead: { ...PARTNER_LEAD, contactId: "003FORGEDAAAAAAAAA", email: "evil@example.org" } };
    await submit(forged);
    expect(mockState.synced[0].partnerLead).toBeUndefined();
    await submit({ ...forged, submissionId: "7f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", lead: { token: TOKEN } });
    expect(mockState.synced[1].partnerLead).toBeUndefined();
    expect(recipients()).not.toContain("evil@example.org");
  });

  it("a used invitation (another tab won) is the customer's own request", async () => {
    mockState.claimOk = false;
    await submit({ ...v5Payload(kaufState()), lead: { token: TOKEN } });
    expect(mockState.synced[0].partnerLead).toBeUndefined();
    expect(mockState.recorded).toEqual([]);
    expect(recipients()).not.toContain("anna@muster.ch");
  });

  it("a Berater submission never looks an invitation up", async () => {
    const p = { ...v5Payload(kaufState({ role: "berater", txt: { ...kaufState().txt, bmail: "bea.rater@partner.ch" } })), lead: { token: TOKEN } };
    expect(p.customerType).toBe("partner");
    await submit(p);
    expect(mockState.lookups).toEqual([]);
    expect(mockState.emailLookups).toEqual([]);
    expect(mockState.synced[0].partnerLead).toBeUndefined();
  });

  it("without the link, an open invitation of the customer's address still credits the partner (HYPOTEQ 23.11.2026)", async () => {
    mockState.emailLead = { ...PARTNER_LEAD, via: "email" };
    await submit(v5Payload(kaufState()));
    expect(mockState.lookups).toEqual([]);
    expect(mockState.emailLookups).toEqual(["lea.muster@kunde.ch"]);
    expect(mockState.synced[0].partnerLead).toMatchObject({ leadId: "lead-1", caseId: "500LEADAAAAAAAAAAA", via: "email" });
    expect(mockState.claims).toHaveLength(1);
    expect(recipients()).toContain("anna@muster.ch");
  });

  it("the link wins over the address; an own request without either stays the customer's", async () => {
    mockState.emailLead = { ...PARTNER_LEAD, leadId: "lead-other" };
    await submit({ ...v5Payload(kaufState()), lead: { token: TOKEN } });
    expect(mockState.synced[0].partnerLead.leadId).toBe("lead-1");
    expect(mockState.emailLookups).toEqual([]);

    mockState.lead = null;
    mockState.emailLead = null;
    await submit({ ...v5Payload(kaufState()), submissionId: "8f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f" });
    expect(mockState.synced[1].partnerLead).toBeUndefined();
  });
});
