import { describe, it, expect, jest } from "@jest/globals";

/**
 * A Case as the portal summarises it, from a Salesforce record: Portal_Status__c is the
 * badge, Partner_Action_Required__c drives «Aktion erforderlich» (HYPOTEQ 19.10.2026 B18 /
 * B25 / D.3), and Cases without the field keep the derived status. Nothing here reaches
 * Salesforce or the database.
 */

jest.mock("@/components/salesforceApi", () => ({ conn: {}, login: async () => {} }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { summarize, type DocContext } from "@/lib/portal/salesforce";

const CTX: DocContext = { inquiry: null, uploaded: [], uploads: [], special: null };
const FIELDS = { status: "Portal_Status__c", action: "Partner_Action_Required__c" };
const NO_FIELDS = { status: null, action: null };

function rec(p: Record<string, unknown> = {}) {
  return {
    Id: "500AAAAAAAAAAAAAAA",
    CaseNumber: "00001350",
    CreatedDate: "2026-10-01T08:00:00.000+0000",
    LastModifiedDate: "2026-10-18T08:00:00.000+0000",
    Status: "New",
    Stage__c: "Needs Analysis",
    IsClosed: false,
    Account: { Name: "Anna Muster" },
    ...p,
  };
}

describe("summarize", () => {
  it("shows Portal_Status__c as the badge, with its tone and timeline step", () => {
    const c = summarize(rec({ Portal_Status__c: "Bei der Bank in Prüfung" }), CTX, "de", FIELDS);
    expect(c).toMatchObject({ status: "Bei der Bank in Prüfung", tone: "info", step: 4 });
  });

  it("derives the status where the field is empty, onto the same values", () => {
    expect(summarize(rec({ Portal_Status__c: null, Stage__c: "In Bearbeitung" }), CTX, "de", FIELDS).status).toBe("Wir prüfen die Unterlagen");
    expect(summarize(rec({ Stage__c: "Verloren", IsClosed: true }), CTX, "de", NO_FIELDS).status).toBe("Anfrage zurückgezogen");
  });

  it("«Aktion erforderlich» follows a ticked Partner_Action_Required__c", () => {
    const c = summarize(rec({ Portal_Status__c: "Unterlagen fehlen noch", Partner_Action_Required__c: true }), CTX, "de", FIELDS);
    expect(c.actionRequired).toBe(true);
  });

  it("an unticked box on a Case the flows manage means nothing to do, even with HYPOTEQ's list showing", () => {
    const c = summarize(rec({ Portal_Status__c: "Anfrage eingegangen", Partner_Action_Required__c: false }), CTX, "de", FIELDS);
    expect(c.needDocs.length).toBeGreaterThan(0);
    expect(c.actionRequired).toBe(false);
  });

  it("an older Case keeps the document rule (the box was never set by a flow)", () => {
    const c = summarize(rec({ Portal_Status__c: null, Partner_Action_Required__c: false }), CTX, "de", FIELDS);
    expect(c.status).toBe("Anfrage eingegangen");
    expect(c.needDocs.length).toBeGreaterThan(0);
    expect(c.actionRequired).toBe(true);
  });

  it("never asks for action on a Case that has ended", () => {
    const c = summarize(rec({ Portal_Status__c: "Leider abgelehnt", Partner_Action_Required__c: true }), CTX, "de", FIELDS);
    expect(c.actionRequired).toBe(false);
    expect(c.step).toBe(-1);
  });
});
