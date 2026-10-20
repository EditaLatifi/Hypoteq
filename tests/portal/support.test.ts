import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

const mockCreate = jest.fn<any>();
const mockUpdate = jest.fn<any>();
jest.mock("@/lib/prisma", () => ({ prisma: { portalSupportTicket: { create: (a: any) => mockCreate(a), update: (a: any) => mockUpdate(a) } } }));
// The real connection would log in to the production org: never loaded here.
jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => any) => op() }));
const mockMail = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({ sendTeamMail: (p: any) => mockMail(p) }));
const mockAudit = jest.fn<any>();
jest.mock("@/lib/portal/audit", () => ({ audit: (e: any) => mockAudit(e) }));
jest.mock("@/components/testMode", () => ({ isTestMode: () => false, skipped: () => {} }));

import { support } from "@/lib/portal/i18n/special";
import { SUPPORT_TONE, sanitizePagePath, sanitizeTechInfo, supportStatusLabel, ticketRef, validateSupport } from "@/lib/portal/support";
import type { SfConnection } from "@/lib/portal/changeRequests";
import { appVersion, createSupportTicket, supportContact, supportEmail, supportMeldung } from "@/lib/portal/supportServer";
import { resetMeldungTypCache } from "@/lib/portal/meldung";

/**
 * Support & Feedback (handoff 4): Typ, optional Case, Betreff and Beschreibung required,
 * «Technische Angaben mitsenden» without case data; stored, mailed, audited.
 */

const USER = { id: "u-1", email: "d.meier@meier-finanz.ch", name: "Daniel Meier", company: "Meier Finanzberatung GmbH" };
const CASE = "500DDDDDDDDDDDDDDD";
const TASK = "00TEEEEEEEEEEEEEEE";
let taskCreates: Record<string, unknown>[] = [];
let taskAnswer: (record: Record<string, unknown>) => unknown = () => ({ id: TASK, success: true });
const SF: SfConnection = {
  query: async () => ({ records: [] }),
  sobject: (name) => ({
    create: async (record) => {
      if (name !== "Portal_Meldung__c") throw new Error(`unexpected ${name}`);
      taskCreates.push(record);
      const r = taskAnswer(record);
      if (r instanceof Error) throw r;
      return r;
    },
  }),
};
const CTX = { origin: "https://www.hypoteq.ch", ip: "1.2.3.4", verifyCase: async () => ({ nr: "00001350", kunde: "Sarah & Marco Brunner" }), sf: SF };
const INPUT = { type: "fehler", caseId: null, subject: "Upload bricht ab", body: "PDF über 15 MB bricht bei 80 % ab.", sendTech: false, tech: null };

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockCreate.mockResolvedValue({ id: "3f9a1c2b-0000-4000-8000-000000000000" });
  mockUpdate.mockResolvedValue({});
  mockMail.mockResolvedValue(undefined);
  taskCreates = [];
  taskAnswer = () => ({ id: TASK, success: true });
  resetMeldungTypCache();
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("validateSupport", () => {
  it("requires a type, a subject and a description", () => {
    expect(validateSupport({ ...INPUT, type: "lob" })).toEqual({ ok: false, error: "type" });
    expect(validateSupport({ ...INPUT, subject: "   " })).toEqual({ ok: false, error: "subject" });
    expect(validateSupport({ ...INPUT, body: "" })).toEqual({ ok: false, error: "body" });
    expect(validateSupport({ ...INPUT, subject: "x".repeat(201) })).toEqual({ ok: false, error: "tooLong" });
  });

  it("takes the Case only as a Salesforce Id", () => {
    expect(validateSupport({ ...INPUT, caseId: "../../etc" })).toEqual({ ok: false, error: "case" });
    const v = validateSupport({ ...INPUT, caseId: CASE });
    expect(v.ok && v.value.caseId).toBe(CASE);
  });

  it("drops the technical details unless the box is ticked", () => {
    const v = validateSupport({ ...INPUT, sendTech: false, tech: { browser: "UA", viewport: "1440×900", page: "/portal/support" } });
    expect(v.ok && v.value.tech).toBeNull();
  });
});

describe("technical details", () => {
  it("keep the path only, with record ids and tokens masked", () => {
    expect(sanitizePagePath("https://www.hypoteq.ch/portal/cases/500AB000001xYzQAAU?filter=Offen#x")).toBe("/portal/cases/:id");
    expect(sanitizePagePath("/portal/spezialfinanzierung/3f9a1c2b-0000-4000-8000-000000000000")).toBe("/portal/spezialfinanzierung/:id");
    expect(sanitizePagePath("/portal/aktivieren/" + "A".repeat(43))).toBe("/portal/aktivieren/:id");
    expect(sanitizePagePath("/portal/dashboard")).toBe("/portal/dashboard");
    expect(sanitizePagePath("javascript:alert(1)")).toBe("");
  });

  it("accept only browser, viewport and page", () => {
    expect(sanitizeTechInfo({ browser: "Mozilla/5.0", viewport: "1440×900", page: "/portal/cases", kunde: "Brunner", caseId: CASE })).toEqual({
      browser: "Mozilla/5.0",
      viewport: "1440×900",
      page: "/portal/cases",
    });
    expect(sanitizeTechInfo({ viewport: "<script>" })).toBeNull();
    expect(sanitizeTechInfo("Mozilla")).toBeNull();
  });

  it("carry the app version from the server, with the commit on Vercel", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567";
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+ · abcdef1$/);
  });
});

describe("statuses", () => {
  it("are the four of the handoff, with the prototype's badge tones", () => {
    expect(Object.keys(support.de.statuses)).toEqual(["eingegangen", "in_pruefung", "behoben", "beantwortet"]);
    expect(SUPPORT_TONE).toEqual({ eingegangen: "neutral", in_pruefung: "info", behoben: "success", beantwortet: "success" });
    expect(supportStatusLabel(support.fr, "behoben")).toBe("Corrigé");
  });

  it("number tickets shortly", () => {
    expect(ticketRef("3f9a1c2b-0000-4000-8000-000000000000")).toBe("T-3F9A1C");
  });
});

describe("contact and address", () => {
  it("use info@hypoteq.ch unless configured (B20; DECISIONS P4 / P18)", () => {
    delete process.env.PORTAL_SUPPORT_EMAIL;
    delete process.env.PORTAL_TEAM_EMAIL;
    process.env.SMTP_TO = "kontakt@example.ch";
    expect(supportEmail()).toBe("info@hypoteq.ch");
    process.env.PORTAL_TEAM_EMAIL = "team@hypoteq.ch";
    expect(supportEmail()).toBe("team@hypoteq.ch");
    process.env.PORTAL_SUPPORT_EMAIL = "partner@hypoteq.ch";
    expect(supportEmail()).toBe("partner@hypoteq.ch");
  });

  it("show the team by default and a person once configured", () => {
    delete process.env.PORTAL_SUPPORT_CONTACT_NAME;
    delete process.env.PORTAL_SUPPORT_HOURS;
    expect(supportContact(support.de)).toMatchObject({
      name: "Partner Management",
      role: "HYPOTEQ AG",
      initials: "PM",
      phone: "+41 44 554 41 00",
      email: "info@hypoteq.ch",
      hours: "Telefonisch Mo–Fr, 09:30–16:30 · Meldungen rund um die Uhr (24/7)",
    });
    process.env.PORTAL_SUPPORT_CONTACT_NAME = "Lea Weber";
    process.env.PORTAL_SUPPORT_CONTACT_ROLE = "Partner Management";
    expect(supportContact(support.en)).toMatchObject({ name: "Lea Weber", role: "Partner Management", initials: "LW", hours: "By phone Mon–Fri, 09:30–16:30 · Reports around the clock (24/7)" });
  });

  it("promise no response time in any language (B20)", () => {
    for (const t of Object.values(support)) {
      expect(`${t.hours} ${t.sent("T-1")}`).not.toMatch(/Arbeitstag|working day|jour ouvrable|giorno lavorativo/);
      expect(t.hours).toContain("09:30–16:30");
      expect(t.hours).toContain("24/7");
    }
  });
});

describe("createSupportTicket", () => {
  it("stores the ticket, mails info@hypoteq.ch, writes the Portal_Meldung__c for Fisnik's Task and audits (C)", async () => {
    const r = await createSupportTicket(USER, INPUT, CTX);
    expect(r).toEqual({ ok: true, ref: "T-3F9A1C" });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: "u-1", type: "fehler", caseId: null, subject: "Upload bricht ab", body: "PDF über 15 MB bricht bei 80 % ab.", techInfo: undefined, status: "eingegangen" },
      select: { id: true },
    });
    const mail = mockMail.mock.calls[0][0] as any;
    expect(mail.to).toBe("info@hypoteq.ch");
    expect(mail.replyTo).toBe(USER.email);
    expect(mail.subject).toBe("Portal-Support · Fehler · Upload bricht ab");
    expect(mail.lines[0]).toBe("Daniel Meier (Meier Finanzberatung GmbH) hat eine Support-Meldung erfasst (T-3F9A1C).");
    expect(taskCreates).toEqual([
      {
        Typ__c: "Fehler",
        Betreff__c: "Portal-Support: Upload bricht ab",
        Beschreibung__c: expect.stringContaining("PDF über 15 MB bricht bei 80 % ab."),
        Partner_Email__c: USER.email,
      },
    ]);
    const description = String(taskCreates[0].Beschreibung__c);
    expect(description).toContain("Partner: Daniel Meier (Meier Finanzberatung GmbH) · d.meier@meier-finanz.ch");
    expect(description).toContain("Typ: Fehler");
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "3f9a1c2b-0000-4000-8000-000000000000" }, data: { sfId: TASK } });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "support_ticket_created", target: "T-3F9A1C · Fehler" }));
  });

  it("links one of the partner's Cases: Case-Nr in the subject and the mail, Case__c on the Meldung", async () => {
    await createSupportTicket(USER, { ...INPUT, caseId: CASE }, CTX);
    expect((mockCreate.mock.calls[0][0] as any).data.caseId).toBe(CASE);
    const mail = mockMail.mock.calls[0][0] as any;
    expect(mail.subject).toBe("Portal-Support · Fehler · Upload bricht ab · Case 00001350");
    expect(mail.lines).toContain("Case: 00001350 · Sarah & Marco Brunner");
    expect(taskCreates[0].Case__c).toBe(CASE);
  });

  it("carries the type and the partner's Account; no owner (the Flow gives the Task to Fisnik)", () => {
    const m = supportMeldung({ ref: "T-1", user: { ...USER, sfAccountId: "001PPPPPPPPPPPPPPP" }, input: { type: "wunsch", subject: "S", body: "B", caseId: null, sendTech: false, tech: null }, caseLine: null, tech: null });
    expect(m).toMatchObject({ typ: "wunsch", betreff: "Portal-Support: S", partnerAccountId: "001PPPPPPPPPPPPPPP", caseId: null, technischeAngaben: null });
  });

  it("puts the technical details into Technische_Angaben__c when they were sent", async () => {
    await createSupportTicket(USER, { ...INPUT, sendTech: true, tech: { browser: "Mozilla/5.0", viewport: "390×844", page: "/portal/cases" } }, CTX);
    expect(String(taskCreates[0].Technische_Angaben__c)).toContain("Browser: Mozilla/5.0");
    expect(String(taskCreates[0].Beschreibung__c)).not.toContain("Browser:");
  });

  it("keeps the ticket and the mail when Salesforce refuses the Meldung (fail soft)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    taskAnswer = () => new Error("Salesforce down");
    const r = await createSupportTicket(USER, INPUT, CTX);
    expect(r.ok).toBe(true);
    expect(mockMail).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(taskCreates).toHaveLength(1);
  });

  it("refuses a Case that is not the partner's", async () => {
    const r = await createSupportTicket(USER, { ...INPUT, caseId: CASE }, { ...CTX, verifyCase: async () => null });
    expect(r).toEqual({ ok: false, error: "case" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("still takes the ticket when Salesforce cannot check the Case, without linking it", async () => {
    const r = await createSupportTicket(USER, { ...INPUT, caseId: CASE }, { ...CTX, verifyCase: async () => "unavailable" as const });
    expect(r.ok).toBe(true);
    expect((mockCreate.mock.calls[0][0] as any).data.caseId).toBeNull();
    expect((mockMail.mock.calls[0][0] as any).lines.join("\n")).toContain("nicht geprüft");
  });

  it("adds the app version to the technical details and never anything else", async () => {
    await createSupportTicket(USER, { ...INPUT, sendTech: true, tech: { browser: "Mozilla/5.0", viewport: "390×844", page: "https://x/portal/cases/500AB000001xYzQAAU", kunde: "Brunner" } }, CTX);
    const tech = (mockCreate.mock.calls[0][0] as any).data.techInfo;
    expect(tech).toEqual({ browser: "Mozilla/5.0", viewport: "390×844", page: "/portal/cases/:id", appVersion: appVersion() });
  });

  it("keeps the ticket and the Meldung when the mail fails", async () => {
    mockMail.mockRejectedValue(new Error("Graph down"));
    const r = await createSupportTicket(USER, INPUT, CTX);
    expect(r.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { sfId: TASK } }));
    expect(mockAudit).toHaveBeenCalled();
  });
});

