import { describe, it, expect, jest } from "@jest/globals";

// The decision what to notify is pure; the database and the mail are not touched here.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/portal/mail", () => ({ sendNotificationMail: jest.fn() }));

import { DICTS } from "@/lib/portal/i18n/dict";
import { changeNotice, notifText, variantFor } from "@/lib/portal/notifications";
import { CASE_STATUSES, LEGACY_STATUSES } from "@/lib/portal/status";

describe("changeNotice", () => {
  it("a new Case is news, except on the very first sync", () => {
    expect(changeNotice(undefined, { status: "Anfrage eingegangen", missingCount: 0 }, false)).toEqual({ kind: "new_case", variant: "new_case" });
    expect(changeNotice(undefined, { status: "Anfrage eingegangen", missingCount: 0 }, true)).toBeNull();
  });
  it("a new status is news, worded per status", () => {
    expect(changeNotice({ status: "Wir prüfen die Unterlagen", missingCount: 0 }, { status: "Bei der Bank in Prüfung", missingCount: 0 }, false)).toEqual({ kind: "lender", variant: "lender_sent" });
    expect(changeNotice({ status: "Angebot liegt vor", missingCount: 0 }, { status: "Finanzierung bestätigt", missingCount: 0 }, false)).toEqual({ kind: "lender", variant: "confirmed" });
    expect(changeNotice({ status: "Bei der Bank in Prüfung", missingCount: 0 }, { status: "Kleine Nacharbeit nötig", missingCount: 1 }, false)).toEqual({ kind: "docs", variant: "rework" });
    expect(changeNotice({ status: "Wir prüfen die Unterlagen", missingCount: 0 }, { status: "Anfrage zurückgezogen", missingCount: 0 }, false)).toEqual({ kind: "status", variant: "cancelled" });
    expect(changeNotice({ status: "Bei der Bank in Prüfung", missingCount: 0 }, { status: "Leider abgelehnt", missingCount: 0 }, false)).toEqual({ kind: "status", variant: "declined" });
  });
  it("the switch from the older names sends nothing (no notification per Case on release day)", () => {
    expect(changeNotice({ status: "In Prüfung", missingCount: 0 }, { status: "Wir prüfen die Unterlagen", missingCount: 0 }, false)).toBeNull();
    expect(changeNotice({ status: "Storniert", missingCount: 0 }, { status: "Anfrage zurückgezogen", missingCount: 0 }, false)).toBeNull();
    expect(changeNotice({ status: "Bei Kreditgeber", missingCount: 0 }, { status: "Angebot liegt vor", missingCount: 0 }, false)).toBeNull();
  });
  it("…but more missing documents behind the switch still are news", () => {
    expect(changeNotice({ status: "Neue Anfrage", missingCount: 0 }, { status: "Unterlagen fehlen noch", missingCount: 2 }, false)).toEqual({ kind: "docs", variant: "docs" });
  });
  it("more missing documents under the same status: a document notice", () => {
    expect(changeNotice({ status: "Unterlagen fehlen noch", missingCount: 1 }, { status: "Unterlagen fehlen noch", missingCount: 2 }, false)).toEqual({ kind: "docs", variant: "docs" });
    expect(changeNotice({ status: "Unterlagen fehlen noch", missingCount: 2 }, { status: "Unterlagen fehlen noch", missingCount: 1 }, false)).toBeNull();
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
  it("the badge shows HYPOTEQ's wording in German", () => {
    for (const status of CASE_STATUSES) expect(DICTS.de.status[status]).toBe(status);
  });
  it("older rows are worded with the status that replaced theirs, never «Verloren»", () => {
    for (const locale of ["de", "en", "fr", "it"] as const) {
      for (const [old, now] of Object.entries(LEGACY_STATUSES)) expect(DICTS[locale].status[old]).toBe(DICTS[locale].status[now]);
      expect(Object.values(DICTS[locale].status).join(" ")).not.toMatch(/verloren/i);
    }
    expect(notifText(DICTS.de, { variant: "status", caseNr: "HQ-1", kunde: "Roth", status: "Rückmeldung erhalten" }).text).toBe("Neuer Status für HQ-1: Angebot liegt vor.");
    expect(notifText(DICTS.de, { variant: "lost", caseNr: "HQ-1", kunde: "Roth", status: "Nicht weiterverfolgt" }).title).toBe("Anfrage nicht weiterverfolgt – Roth");
  });
  it("older statuses still pick their variant", () => {
    expect(variantFor("Rückmeldung erhalten")).toEqual({ kind: "lender", variant: "lender_answer" });
    expect(variantFor("Storniert")).toEqual({ kind: "status", variant: "cancelled" });
  });
});
