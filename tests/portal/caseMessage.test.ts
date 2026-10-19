import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * «Nachricht senden» on a Case (HYPOTEQ 19.10.2026 B22, DECISIONS P25): the mail to
 * info@hypoteq.ch with Reply-To and the owner in copy, and a completed Task on the Case —
 * a CaseComment only when Salesforce refuses the Task. Salesforce and mail are fakes.
 */

jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {}, withSessionRetry: async (op: () => any) => op() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/portal/mail", () => ({ sendTeamMail: jest.fn() }));

import { caseMessageSubject, caseMessageTask, deliverCaseMessage, firstWords } from "@/lib/portal/caseMessage";
import type { SfConnection } from "@/lib/portal/changeRequests";

const CASE = "500DDDDDDDDDDDDDDD";
const AUTHOR = { name: "Daniel Meier", email: "d.meier@meier-finanz.ch", company: "Meier Finanzberatung GmbH" };
const BODY = "Die Kundin hat den Lohnausweis 2025 nachgereicht. Bitte prüfen Sie auch die neue Steuererklärung, sie kommt morgen.";
const INPUT = { caseId: CASE, nr: "00001350", kunde: "Sarah & Marco Brunner", ownerEmail: "owner@hypoteq.ch", body: BODY, author: AUTHOR, origin: "https://portal.example" };

function fakeSf(result: unknown = { id: "00TEEEEEEEEEEEEEEE", success: true }) {
  const creates: { object: string; record: Record<string, unknown> }[] = [];
  const sf: SfConnection = {
    query: async () => ({ records: [] }),
    sobject: (object) => ({
      create: async (record) => {
        creates.push({ object, record });
        if (result instanceof Error) throw result;
        return result;
      },
    }),
  };
  return { sf, creates };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("texts", () => {
  it("subject «Portal-Nachricht · {Case-Nr} · {Kundenname}»", () => {
    expect(caseMessageSubject("00001350", "Sarah & Marco Brunner")).toBe("Portal-Nachricht · 00001350 · Sarah & Marco Brunner");
  });
  it("the Task's subject takes the first words, cut at a word", () => {
    expect(firstWords("Kurz und gut.")).toBe("Kurz und gut.");
    const w = firstWords(BODY);
    expect(w.length).toBeLessThanOrEqual(82);
    expect(w.endsWith(" …")).toBe(true);
    expect(BODY.startsWith(w.slice(0, -2))).toBe(true);
    expect(firstWords("Zeile eins\n\nZeile   zwei")).toBe("Zeile eins Zeile zwei");
  });
  it("the Task is completed, on the Case, with the full text", () => {
    const t = caseMessageTask({ caseId: CASE, body: BODY, author: AUTHOR, now: new Date("2026-10-19T10:00:00Z") });
    expect(t).toMatchObject({ WhatId: CASE, Status: "Completed", ActivityDate: "2026-10-19" });
    expect(String(t.Subject)).toMatch(/^Portal-Nachricht: Die Kundin hat/);
    expect(String(t.Description)).toContain(BODY);
    expect(String(t.Description)).toContain("Daniel Meier (Meier Finanzberatung GmbH), d.meier@meier-finanz.ch");
  });
});

describe("deliverCaseMessage", () => {
  it("mails info@hypoteq.ch with Reply-To the partner and the owner in copy, and logs a completed Task", async () => {
    const { sf, creates } = fakeSf();
    const mail = jest.fn<any>().mockResolvedValue(undefined);
    const comment = jest.fn<any>();
    const r = await deliverCaseMessage(INPUT, { sf, mail, comment });
    expect(r).toEqual({ taskId: "00TEEEEEEEEEEEEEEE", comment: false, mailed: true });
    expect(creates).toHaveLength(1);
    expect(creates[0].object).toBe("Task");
    expect(comment).not.toHaveBeenCalled();
    const m = mail.mock.calls[0][0] as any;
    expect(m).toMatchObject({ to: "info@hypoteq.ch", cc: ["owner@hypoteq.ch"], replyTo: AUTHOR.email, subject: "Portal-Nachricht · 00001350 · Sarah & Marco Brunner" });
    expect(m.lines).toContain(BODY);
  });

  it("writes a CaseComment only when the Task is refused — never both", async () => {
    const { sf } = fakeSf(Object.assign(new Error("INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST: Status"), { errorCode: "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST" }));
    const comment = jest.fn<any>().mockResolvedValue(undefined);
    const r = await deliverCaseMessage(INPUT, { sf, mail: jest.fn<any>().mockResolvedValue(undefined), comment });
    expect(r).toEqual({ taskId: null, comment: true, mailed: true });
    expect(comment).toHaveBeenCalledWith(CASE, expect.stringContaining(BODY));
  });

  it("still logs the Task when the mail fails, and reports what got through", async () => {
    const { sf } = fakeSf();
    const r = await deliverCaseMessage(INPUT, { sf, mail: jest.fn<any>().mockRejectedValue(new Error("Graph down")), comment: jest.fn<any>() });
    expect(r).toEqual({ taskId: "00TEEEEEEEEEEEEEEE", comment: false, mailed: false });
  });

  it("reports nothing delivered when everything fails, without throwing", async () => {
    const { sf } = fakeSf(new Error("Salesforce down"));
    const r = await deliverCaseMessage(INPUT, { sf, mail: jest.fn<any>().mockRejectedValue(new Error("Graph down")), comment: jest.fn<any>().mockRejectedValue(new Error("down")) });
    expect(r).toEqual({ taskId: null, comment: false, mailed: false });
  });

  it("leaves the owner out of the copy when the Case has none", async () => {
    const { sf } = fakeSf();
    const mail = jest.fn<any>().mockResolvedValue(undefined);
    await deliverCaseMessage({ ...INPUT, ownerEmail: null }, { sf, mail, comment: jest.fn<any>() });
    expect((mail.mock.calls[0][0] as any).cc).toEqual([]);
  });
});
