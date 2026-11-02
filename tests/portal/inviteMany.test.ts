import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * /portal/admin/partner «Partner einladen» (Fisnik 02.11.2026): the typed address and every
 * partner ticked in the Salesforce list are invited in one click. Each address is checked on its
 * own, as a typed one always was: a Salesforce Contact must exist, an active or deactivated
 * access is not invited again, and one failure never stops the others.
 */

const users = new Map<string, any>();
const mockDb = {
  portalUser: {
    findUnique: jest.fn<any>(async ({ where }: any) => (where.email ? users.get(where.email) ?? null : [...users.values()].find((u) => u.id === where.id) ?? null)),
    findUniqueOrThrow: jest.fn<any>(async ({ where }: any) => [...users.values()].find((u) => u.id === where.id)),
    upsert: jest.fn<any>(async ({ where, create, update }: any) => {
      const row = users.has(where.email) ? { ...users.get(where.email), ...update } : { id: `u-${where.email}`, ...create };
      users.set(where.email, row);
      return row;
    }),
  },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));
const mockInviteMail = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({ sendInviteMail: (p: any) => mockInviteMail(p) }));
jest.mock("@/lib/portal/audit", () => ({ audit: async () => {} }));
jest.mock("@/lib/portal/tokens", () => ({ issueToken: async () => "token" }));
jest.mock("@/lib/portal/session", () => ({
  requireAdmin: async () => ({ id: "admin-1", email: "admin@hypoteq.ch" }),
  requestIp: () => null,
  requestOrigin: () => "https://portal.example",
  revokeAllSessions: async () => {},
}));
jest.mock("@/lib/portal/i18n/server", () => {
  const { DICTS } = jest.requireActual<any>("@/lib/portal/i18n/dict");
  return { getDict: async () => ({ locale: "de", t: DICTS.de }) };
});
jest.mock("next/cache", () => ({ revalidatePath: () => {} }));
// The real connection would log in to the production org: never loaded here.
jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => any) => op() }));
const contacts: Record<string, any> = {
  "lea@muster-immo.ch": { Id: "003LEA", Name: "Lea Muster", AccountId: "001MUSTER", Account: { Name: "Muster Immobilien" }, Korrespondenzsprache__c: "Deutsch" },
  "marc@beispiel.ch": { Id: "003MARC", Name: "Marc Beispiel", AccountId: "001BEISPIEL", Account: { Name: "Beispiel AG" }, Korrespondenzsprache__c: "Französisch" },
};
jest.mock("@/lib/portal/salesforce", () => ({
  findContactByEmail: async (email: string) => contacts[email] ?? null,
  isSalesforceId: () => true,
  setCasePartner: async () => {},
}));

import { invitePartnerAction } from "@/app/portal/(app)/admin/actions";

function form(typed: string, picked: string[] = [], asAdmin = false): FormData {
  const fd = new FormData();
  fd.set("email", typed);
  for (const e of picked) fd.append("emails", e);
  if (asAdmin) fd.set("role", "admin");
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  users.clear();
  mockInviteMail.mockResolvedValue(undefined);
});

describe("Partner einladen from the Salesforce list", () => {
  it("invites every ticked partner in one click, in their Salesforce language", async () => {
    const res = await invitePartnerAction(undefined, form("", ["lea@muster-immo.ch", "Marc@Beispiel.ch"]));
    expect(res).toEqual({ ok: "Einladung an 2 Partner gesendet: lea@muster-immo.ch, marc@beispiel.ch." });
    expect(mockInviteMail.mock.calls.map(([p]: any) => [p.to, p.locale])).toEqual([
      ["lea@muster-immo.ch", "de"],
      ["marc@beispiel.ch", "fr"],
    ]);
    expect(users.get("marc@beispiel.ch")).toMatchObject({ role: "partner", status: "invited", sfContactId: "003MARC", company: "Beispiel AG" });
  });

  it("the typed address and the ticked ones together, each once", async () => {
    const res = await invitePartnerAction(undefined, form("lea@muster-immo.ch", ["lea@muster-immo.ch", "marc@beispiel.ch"]));
    expect(res?.ok).toBe("Einladung an 2 Partner gesendet: lea@muster-immo.ch, marc@beispiel.ch.");
    expect(mockInviteMail).toHaveBeenCalledTimes(2);
  });

  it("a single address reads as before", async () => {
    expect(await invitePartnerAction(undefined, form("lea@muster-immo.ch"))).toEqual({ ok: "Einladung an lea@muster-immo.ch gesendet." });
  });

  it("sends what it can and names what it could not", async () => {
    users.set("lea@muster-immo.ch", { id: "u-lea", email: "lea@muster-immo.ch", status: "active" });
    const res = await invitePartnerAction(undefined, form("", ["lea@muster-immo.ch", "marc@beispiel.ch", "nobody@example.ch"]));
    expect(res?.ok).toBe("Einladung an marc@beispiel.ch gesendet.");
    expect(res?.error).toContain("lea@muster-immo.ch hat bereits einen aktiven Zugang.");
    expect(res?.error).toContain("keinen Kontakt mit der E-Mail nobody@example.ch");
    expect(mockInviteMail).toHaveBeenCalledTimes(1);
  });

  it("«als Administrator» applies to the typed address only", async () => {
    await invitePartnerAction(undefined, form("chef@hypoteq.ch", ["marc@beispiel.ch"], true));
    expect(users.get("chef@hypoteq.ch")).toMatchObject({ role: "admin", sfContactId: null });
    expect(users.get("marc@beispiel.ch")).toMatchObject({ role: "partner", sfContactId: "003MARC" });
  });

  it("nothing typed and nothing ticked asks for one", async () => {
    expect(await invitePartnerAction(undefined, form(""))).toEqual({ error: "Bitte eine E-Mail eingeben oder mindestens einen Partner auswählen." });
    expect(await invitePartnerAction(undefined, form("not-an-email"))).toEqual({ error: "Bitte eine gültige E-Mail-Adresse eingeben." });
  });
});
