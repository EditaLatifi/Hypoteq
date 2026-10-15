import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// The submit touches the database, SharePoint, Salesforce and mail. All four are fakes here.
const mockDb = {
  portalSpecialRequest: {
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    updateMany: jest.fn<any>(),
    findFirst: jest.fn<any>(),
    findUnique: jest.fn<any>(),
  },
  portalCaseState: { upsert: jest.fn<any>() },
  portalUpload: { createMany: jest.fn<any>() },
  portalCaseSeen: { count: jest.fn<any>(), upsert: jest.fn<any>() },
};
jest.mock("@/lib/prisma", () => ({ prisma: mockDb }));

const mockCreateCase = jest.fn<any>();
jest.mock("@/lib/portal/specialSalesforce", () => {
  const actual = jest.requireActual("@/lib/portal/specialSalesforce") as any;
  return { ...actual, createSpecialCase: (fields: any) => mockCreateCase(fields) };
});
jest.mock("@/components/salesforceApi", () => ({ __esModule: true, conn: {}, soqlString: (v: string) => `'${v}'` }));

const mockFolder = jest.fn<any>();
const mockList = jest.fn<any>();
const mockRemove = jest.fn<any>();
jest.mock("@/lib/portal/specialFiles", () => ({
  specialFolder: (...a: any[]) => mockFolder(...a),
  listSpecialFiles: (...a: any[]) => mockList(...a),
  removeSpecialFile: (...a: any[]) => mockRemove(...a),
}));

const mockMail = jest.fn<any>();
jest.mock("@/lib/portal/mail", () => ({ sendTeamMail: (p: any) => mockMail(p) }));
const mockAudit = jest.fn<any>();
jest.mock("@/lib/portal/audit", () => ({ audit: (e: any) => mockAudit(e) }));
let mockTestMode = false;
jest.mock("@/components/testMode", () => ({ isTestMode: () => mockTestMode, skipped: () => {} }));

import { specialTeamMail, submitSpecialRequest, type SpecialUser } from "@/lib/portal/specialServer";
import { EMPTY_ANSWERS, type ValidSpecialAnswers } from "@/lib/portal/special";

const USER: SpecialUser = {
  id: "u-1",
  email: "d.meier@meier-finanz.ch",
  name: "Daniel Meier",
  company: "Meier Finanzberatung GmbH",
  contactId: "003AAAAAAAAAAAAAAA",
  sfAccountId: "001BBBBBBBBBBBBBBB",
};
const ANSWERS: ValidSpecialAnswers = {
  ...EMPTY_ANSWERS,
  type: "bauprojekt",
  kunde: "Anna Muster",
  betrag: "1'800'000",
  beschreibung: "Neubau eines Einfamilienhauses mit Baukredit, Baubeginn im Frühling.",
};
const DRAFT_ID = "3f9a1c2b-0000-4000-8000-000000000000";
const CASE_ID = "500DDDDDDDDDDDDDDD";
const CTX = { origin: "https://www.hypoteq.ch", ip: "1.2.3.4" };
const FILE = { fileName: "Baubewilligung.pdf", driveItemId: "01ABCDEFGH", webUrl: "https://sp/file", size: 1234 };
const OK_CASE = { caseId: CASE_ID, caseNr: "00001422", recordType: "special", dropped: [], linked: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockTestMode = false;
  mockDb.portalSpecialRequest.create.mockResolvedValue({ id: "new-1" });
  mockDb.portalSpecialRequest.update.mockResolvedValue({ id: DRAFT_ID });
  mockDb.portalSpecialRequest.updateMany.mockResolvedValue({ count: 1 });
  mockDb.portalSpecialRequest.findUnique.mockResolvedValue({ id: DRAFT_ID, createdAt: new Date("2026-10-15T08:00:00Z") });
  mockDb.portalCaseSeen.count.mockResolvedValue(3);
  mockFolder.mockResolvedValue({ id: "folder-1", webUrl: "https://sp/folder" });
  mockList.mockResolvedValue([FILE]);
  mockRemove.mockResolvedValue(true);
  mockCreateCase.mockResolvedValue(OK_CASE);
  mockMail.mockResolvedValue(undefined);
});

describe("submitSpecialRequest", () => {
  it("refuses invalid answers before anything is stored", async () => {
    const r = await submitSpecialRequest(USER, { answers: { ...ANSWERS, beschreibung: "kurz" }, ack: true }, CTX);
    expect(r).toEqual({ ok: false, error: "text", step: 2 });
    expect(mockDb.portalSpecialRequest.create).not.toHaveBeenCalled();
    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it("stores the request, creates the Case for the partner, tells the team and audits", async () => {
    const r = await submitSpecialRequest(USER, { answers: ANSWERS, ack: true, itemIds: [] }, CTX);
    expect(r).toEqual({ ok: true, requestId: "new-1", caseId: CASE_ID, caseNr: "00001422" });

    const stored = mockDb.portalSpecialRequest.create.mock.calls[0][0] as any;
    expect(stored.data).toMatchObject({ userId: "u-1", contactId: USER.contactId, accountId: USER.sfAccountId, type: "bauprojekt", kunde: "Anna Muster", amount: 1800000, status: "new" });
    expect(stored.data.payload).toMatchObject({ ...ANSWERS, ack: true });

    const fields = mockCreateCase.mock.calls[0][0] as any;
    expect(fields.Partner_Consultant__c).toBe(USER.contactId);
    expect(fields.Subject).toBe("Spezialfinanzierung · Bauprojekt / Baukredit – Anna Muster");

    expect(mockDb.portalSpecialRequest.update).toHaveBeenLastCalledWith({ where: { id: "new-1" }, data: { sfCaseId: CASE_ID, caseNr: "00001422", sfError: null } });
    // A Case the partner made themselves is no «new case» notification.
    expect(mockDb.portalCaseSeen.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ caseId: CASE_ID, status: "Neue Anfrage" }) }));

    const mail = mockMail.mock.calls[0][0] as any;
    expect(mail.to).toBeNull();
    expect(mail.subject).toBe("Partnerportal: Spezialfinanzierung · Bauprojekt / Baukredit – Anna Muster (00001422)");
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "special_submitted", target: "00001422 · Bauprojekt / Baukredit · SP-NEW1" }));
  });

  it("sends the mail to the special-financing address when one is configured", async () => {
    process.env.PORTAL_SPECIAL_EMAIL = "spezial@hypoteq.ch";
    try {
      await submitSpecialRequest(USER, { answers: ANSWERS, ack: true }, CTX);
      expect((mockMail.mock.calls[0][0] as any).to).toBe("spezial@hypoteq.ch");
    } finally {
      delete process.env.PORTAL_SPECIAL_EMAIL;
    }
  });

  it("keeps the request and still tells the team when Salesforce fails", async () => {
    mockCreateCase.mockRejectedValue(Object.assign(new Error("Required fields are missing: [Origin]"), { errorCode: "REQUIRED_FIELD_MISSING" }));
    const r = await submitSpecialRequest(USER, { answers: ANSWERS, ack: true }, CTX);
    expect(r).toEqual({ ok: true, requestId: "new-1", caseId: null, caseNr: null });
    expect(mockDb.portalSpecialRequest.update).toHaveBeenLastCalledWith({
      where: { id: "new-1" },
      data: { sfCaseId: null, caseNr: null, sfError: "REQUIRED_FIELD_MISSING: Required fields are missing: [Origin]" },
    });
    expect(mockDb.portalUpload.createMany).not.toHaveBeenCalled();
    const mail = mockMail.mock.calls[0][0] as any;
    expect(mail.subject).toContain("Case von Hand anlegen");
    expect(mail.lines.join("\n")).toContain("ACHTUNG: Der Salesforce-Case wurde nicht angelegt");
  });

  it("files the uploads with the Case: its folder, the portal uploads, the SharePoint link", async () => {
    const r = await submitSpecialRequest(USER, { requestId: DRAFT_ID, answers: ANSWERS, ack: true, itemIds: [FILE.driveItemId] }, CTX);
    expect(r).toEqual({ ok: true, requestId: DRAFT_ID, caseId: CASE_ID, caseNr: "00001422" });
    // The draft is claimed first, so a second submit cannot make a second Case.
    expect(mockDb.portalSpecialRequest.updateMany).toHaveBeenCalledWith({ where: { id: DRAFT_ID, userId: "u-1", status: "draft" }, data: { status: "submitting" } });
    expect(mockFolder).toHaveBeenCalledWith({ id: DRAFT_ID, createdAt: expect.any(Date) }, USER.email, { create: false });
    expect((mockDb.portalSpecialRequest.update.mock.calls[0][0] as any).data.files).toEqual([FILE]);
    expect((mockCreateCase.mock.calls[0][0] as any).SharePoint_Doc__c).toBe("https://sp/folder");
    expect(mockDb.portalCaseState.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { caseId: CASE_ID, contactId: USER.contactId, status: "Neue Anfrage", folderId: "folder-1" } }));
    expect(mockDb.portalUpload.createMany).toHaveBeenCalledWith({
      data: [{ userId: "u-1", caseId: CASE_ID, docKey: null, docLabel: "Spezialfinanzierung", fileName: "Baubewilligung.pdf", driveItemId: "01ABCDEFGH", webUrl: "https://sp/file" }],
    });
    expect((mockMail.mock.calls[0][0] as any).link).toBe("https://sp/folder");
  });

  it("takes only files that are really in the request's folder", async () => {
    mockList.mockResolvedValue([]);
    const r = await submitSpecialRequest(USER, { requestId: DRAFT_ID, answers: ANSWERS, ack: true, itemIds: [FILE.driveItemId] }, CTX);
    expect(r).toEqual({ ok: false, error: "files", step: 3 });
    // The draft is handed back so the partner can fix the list and submit again.
    expect(mockDb.portalSpecialRequest.updateMany).toHaveBeenLastCalledWith({ where: { id: DRAFT_ID, status: "submitting" }, data: { status: "draft" } });
    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it("drops files the partner removed, and deletes them if SharePoint still has them", async () => {
    mockList.mockResolvedValue([FILE, { ...FILE, driveItemId: "01REMOVED0", fileName: "alt.pdf" }]);
    await submitSpecialRequest(USER, { requestId: DRAFT_ID, answers: ANSWERS, ack: true, itemIds: [FILE.driveItemId] }, CTX);
    expect((mockDb.portalSpecialRequest.update.mock.calls[0][0] as any).data.files).toEqual([FILE]);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith("folder-1", "01REMOVED0");
  });

  it("answers a repeated submit with the first result instead of a second Case", async () => {
    mockDb.portalSpecialRequest.updateMany.mockResolvedValue({ count: 0 });
    mockDb.portalSpecialRequest.findFirst.mockResolvedValue({ id: DRAFT_ID, status: "new", sfCaseId: CASE_ID, caseNr: "00001422", sfError: null });
    const r = await submitSpecialRequest(USER, { requestId: DRAFT_ID, answers: ANSWERS, ack: true }, CTX);
    expect(r).toEqual({ ok: true, requestId: DRAFT_ID, caseId: CASE_ID, caseNr: "00001422" });
    expect(mockCreateCase).not.toHaveBeenCalled();
    expect(mockMail).not.toHaveBeenCalled();
  });

  it("does not open a Case the partner could not be put on", async () => {
    mockCreateCase.mockResolvedValue({ ...OK_CASE, linked: false, dropped: ["Case.Partner_Consultant__c (INVALID_FIELD)"] });
    const r = await submitSpecialRequest(USER, { answers: ANSWERS, ack: true }, CTX);
    expect(r).toEqual({ ok: true, requestId: "new-1", caseId: null, caseNr: "00001422" });
    const updates = mockDb.portalSpecialRequest.update.mock.calls;
    expect((updates[updates.length - 1][0] as any).data.sfError).toContain("Partner nicht auf dem Case eingetragen");
    expect((mockMail.mock.calls[0][0] as any).lines.join("\n")).toContain("Bitte von Hand zuordnen");
  });

  it("leaves the notification baseline alone for a partner who has none yet", async () => {
    mockDb.portalCaseSeen.count.mockResolvedValue(0);
    await submitSpecialRequest(USER, { answers: ANSWERS, ack: true }, CTX);
    expect(mockDb.portalCaseSeen.upsert).not.toHaveBeenCalled();
  });

  it("creates no Case and sends no mail in test mode", async () => {
    mockTestMode = true;
    const r = await submitSpecialRequest(USER, { answers: ANSWERS, ack: true }, CTX);
    expect(r).toEqual({ ok: true, requestId: "new-1", caseId: null, caseNr: null });
    expect(mockCreateCase).not.toHaveBeenCalled();
    expect(mockMail).not.toHaveBeenCalled();
  });

  it("refuses files without a draft they could have been uploaded into", async () => {
    const r = await submitSpecialRequest(USER, { answers: ANSWERS, ack: true, itemIds: ["01ABCDEFGH"] }, CTX);
    expect(r).toEqual({ ok: false, error: "files", step: 3 });
  });
});

describe("specialTeamMail", () => {
  it("says when the special record type was not available", () => {
    const m = specialTeamMail({ requestId: DRAFT_ID, answers: ANSWERS, partner: USER, files: [], result: { ...OK_CASE, recordType: "default" } as any, sfError: null });
    expect(m.lines[1]).toBe("Salesforce-Case 00001422 wurde angelegt, mit dem Standard-RecordType (RecordType «Spezialfinanzierung» nicht verfügbar).");
    expect(m.lines.join("\n")).toContain("Keine Dokumente hochgeladen.");
    expect(m.lines[m.lines.length - 1]).toBe("Antwort bitte direkt an d.meier@meier-finanz.ch.");
  });
});
