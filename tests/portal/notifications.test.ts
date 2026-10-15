import { describe, it, expect, jest } from "@jest/globals";

// The decision what to notify is pure; the database and the mail are not touched here.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/portal/mail", () => ({ sendNotificationMail: jest.fn() }));

import { DICTS } from "@/lib/portal/i18n/dict";
import { changeNotice, notifText, variantFor } from "@/lib/portal/notifications";
import { CASE_STATUSES } from "@/lib/portal/status";

describe("changeNotice", () => {
  it("a new Case is news, except on the very first sync", () => {
    expect(changeNotice(undefined, { status: "Neue Anfrage", missingCount: 0 }, false)).toEqual({ kind: "new_case", variant: "new_case" });
    expect(changeNotice(undefined, { status: "Neue Anfrage", missingCount: 0 }, true)).toBeNull();
  });
  it("a new status is news, worded per status", () => {
    expect(changeNotice({ status: "In Prüfung", missingCount: 0 }, { status: "Bei Kreditgeber", missingCount: 0 }, false)).toEqual({ kind: "lender", variant: "lender_sent" });
    expect(changeNotice({ status: "Rückmeldung erhalten", missingCount: 0 }, { status: "Finanzierung bestätigt", missingCount: 0 }, false)).toEqual({ kind: "lender", variant: "confirmed" });
    expect(changeNotice({ status: "Bei Kreditgeber", missingCount: 0 }, { status: "Nachbearbeitung notwendig", missingCount: 1 }, false)).toEqual({ kind: "docs", variant: "rework" });
    expect(changeNotice({ status: "In Prüfung", missingCount: 0 }, { status: "Storniert", missingCount: 0 }, false)).toEqual({ kind: "status", variant: "cancelled" });
  });
  it("the release renaming statuses sends nothing (no e-mail per Case on release day)", () => {
    expect(changeNotice({ status: "Pausiert", missingCount: 0 }, { status: "In Prüfung", missingCount: 0 }, false)).toBeNull();
    expect(changeNotice({ status: "Nicht weiterverfolgt", missingCount: 0 }, { status: "Storniert", missingCount: 0 }, false)).toBeNull();
    expect(changeNotice({ status: "In Prüfung", missingCount: 0 }, { status: "Dokumente vollständig", missingCount: 0 }, false)).toBeNull();
  });
  it("…but more missing documents behind a renamed status still are news", () => {
    expect(changeNotice({ status: "Pausiert", missingCount: 0 }, { status: "Dokumente ausstehend", missingCount: 2 }, false)).toEqual({ kind: "docs", variant: "docs" });
  });
  it("more missing documents under the same status: a document notice", () => {
    expect(changeNotice({ status: "Dokumente ausstehend", missingCount: 1 }, { status: "Dokumente ausstehend", missingCount: 2 }, false)).toEqual({ kind: "docs", variant: "docs" });
    expect(changeNotice({ status: "Dokumente ausstehend", missingCount: 2 }, { status: "Dokumente ausstehend", missingCount: 1 }, false)).toBeNull();
  });
});

describe("notification texts", () => {
  it("every status has a variant every language words", () => {
    for (const locale of ["de", "en", "fr", "it"] as const) {
      for (const status of CASE_STATUSES) {
        const { variant } = variantFor(status);
        const { title, text } = notifText(DICTS[locale], { variant, caseNr: "HQ-26-10-000001", kunde: "Familie Muster", status });
        expect(title).toContain("Muster");
        expect(text.length).toBeGreaterThan(10);
        expect(DICTS[locale].status[status]).toBeTruthy();
      }
    }
  });
  it("old rows keep their wording", () => {
    expect(notifText(DICTS.de, { variant: "lost", caseNr: "HQ-1", kunde: "Roth", status: "Nicht weiterverfolgt" }).title).toBe("Anfrage nicht weiterverfolgt – Roth");
  });
});
