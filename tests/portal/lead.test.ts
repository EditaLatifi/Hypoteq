/**
 * Partner Fast Lead (DECISIONS P39): the rules shared by the portal form, the server and the
 * funnel — the form check, the status the partner's list shows, «Erneut senden», the link.
 */
import { describe, it, expect } from "@jest/globals";
import {
  LEAD_MAX_MAILS,
  LEAD_TTL_DAYS,
  canResend,
  customerLabel,
  isLeadToken,
  leadExpiry,
  leadFunnelPath,
  leadStatus,
  leadTeamMail,
  partnerLabel,
  reminderDue,
  validateLead,
} from "@/lib/portal/lead";
import { newToken } from "@/lib/portal/crypto";
import { DICTS, LOCALES } from "@/lib/portal/i18n/dict";

const NOW = new Date("2026-11-23T10:00:00.000Z");
const ok = { firstName: "Lea", lastName: "Muster", email: "Lea.Muster@Kunde.ch", phone: "+41 79 111 22 33", locale: "fr", anrede: "Frau", consent: true };

describe("validateLead", () => {
  it("cleans a complete form: e-mail lower case, the language and the Anrede kept", () => {
    expect(validateLead(ok)).toEqual({
      ok: true,
      value: { anrede: "Frau", firstName: "Lea", lastName: "Muster", email: "lea.muster@kunde.ch", phone: "+41 79 111 22 33", locale: "fr" },
    });
  });

  it("needs first name, last name, a valid e-mail and the consent; the phone is optional", () => {
    expect(validateLead({ ...ok, firstName: "  " })).toEqual({ ok: false, error: "firstName" });
    expect(validateLead({ ...ok, lastName: "" })).toEqual({ ok: false, error: "lastName" });
    expect(validateLead({ ...ok, email: "lea@" })).toEqual({ ok: false, error: "email" });
    expect(validateLead({ ...ok, consent: "yes" })).toEqual({ ok: false, error: "consent" });
    expect(validateLead({ ...ok, phone: "abc" })).toEqual({ ok: false, error: "phone" });
    expect(validateLead({ ...ok, phone: "12 34" })).toEqual({ ok: false, error: "phone" });
    const noPhone = validateLead({ ...ok, phone: "" });
    expect(noPhone.ok && noPhone.value.phone).toBeNull();
  });

  it("drops an unknown Anrede or language instead of refusing, and trims control characters", () => {
    const r = validateLead({ ...ok, anrede: "Dr.", locale: "es", firstName: "Lea\n\tMaria" });
    expect(r.ok && r.value).toMatchObject({ anrede: null, locale: "de", firstName: "Lea Maria" });
  });
});

describe("leadStatus", () => {
  const future = new Date(NOW.getTime() + 3600_000);
  const past = new Date(NOW.getTime() - 1000);
  it("invited → opened → submitted; expired from the date, never once submitted", () => {
    expect(leadStatus({ status: "invited", expiresAt: future }, NOW)).toBe("invited");
    expect(leadStatus({ status: "opened", expiresAt: future }, NOW)).toBe("opened");
    expect(leadStatus({ status: "opened", expiresAt: past }, NOW)).toBe("expired");
    expect(leadStatus({ status: "submitted", expiresAt: past }, NOW)).toBe("submitted");
  });

  it("an invitation is valid LEAD_TTL_DAYS days", () => {
    expect(leadExpiry(NOW).getTime() - NOW.getTime()).toBe(LEAD_TTL_DAYS * 24 * 3600_000);
  });
});

describe("canResend", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    status: "invited",
    expiresAt: new Date(NOW.getTime() + 3600_000),
    mailsSent: 1,
    lastMailAt: new Date(NOW.getTime() - 20 * 60_000),
    createdAt: new Date(NOW.getTime() - 20 * 60_000),
    ...over,
  });
  it("allows it after 15 minutes, also for an expired invitation (the resend extends it)", () => {
    expect(canResend(row(), NOW)).toBe("ok");
    expect(canResend(row({ expiresAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe("ok");
  });
  it("refuses after the submit, after LEAD_MAX_MAILS mails and within 15 minutes", () => {
    expect(canResend(row({ status: "submitted" }), NOW)).toBe("submitted");
    expect(canResend(row({ mailsSent: LEAD_MAX_MAILS }), NOW)).toBe("limit");
    expect(canResend(row({ lastMailAt: new Date(NOW.getTime() - 60_000) }), NOW)).toBe("tooSoon");
  });
  it("a first mail that failed may be retried at once", () => {
    expect(canResend(row({ mailsSent: 0, lastMailAt: null, createdAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe("ok");
  });
});

describe("the link", () => {
  it("accepts the portal's tokens only", () => {
    expect(isLeadToken(newToken())).toBe(true);
    expect(isLeadToken("short")).toBe(false);
    expect(isLeadToken("a".repeat(40) + "/../")).toBe(false);
    expect(isLeadToken(undefined)).toBe(false);
  });
  it("opens the funnel in the invitation's language", () => {
    expect(leadFunnelPath("it", "TOKEN_abc-123")).toBe("/it/funnel?lead=TOKEN_abc-123");
    expect(leadFunnelPath("xx", "T")).toBe("/de/funnel?lead=T");
  });
});

describe("labels and the team mail", () => {
  it("names the partner with the company, without repeating it", () => {
    expect(partnerLabel({ partnerName: "Anna Muster", partnerCompany: "Muster AG" })).toBe("Anna Muster (Muster AG)");
    expect(partnerLabel({ partnerName: "Muster AG", partnerCompany: "Muster AG" })).toBe("Muster AG");
    expect(partnerLabel({ partnerName: null, partnerCompany: null, partnerEmail: "anna@muster.ch" })).toBe("anna@muster.ch");
    expect(customerLabel({ firstName: "Lea", lastName: "Muster" })).toBe("Lea Muster");
  });

  const party = {
    partnerName: "Anna Muster",
    partnerCompany: "Muster AG",
    partnerEmail: "anna@muster.ch",
    anrede: "Frau",
    firstName: "Lea",
    lastName: "Beispiel",
    email: "lea@kunde.ch",
    phone: null,
    locale: "fr",
    expiresAt: new Date("2026-12-23T10:00:00.000Z"),
  };

  it("tells HYPOTEQ who invited whom, that the customer agreed, the Case and the reminders", () => {
    const m = leadTeamMail(party, { caseUrl: "https://hypoteq-ch.lightning.force.com/lightning/r/Case/500X/view", failed: false });
    expect(m.subject).toBe("Partner Fast Lead · Lea Beispiel · eingeladen von Anna Muster (Muster AG)");
    const body = m.lines.join("\n");
    expect(body).toContain("Kunde: Frau Lea Beispiel · lea@kunde.ch · Sprache FR");
    expect(body).toContain("einverstanden");
    expect(body).toContain("Der Case ist in Salesforce angelegt und dem Partner zugeordnet (Kundenberater und Sales Partner): https://hypoteq-ch.lightning.force.com/lightning/r/Case/500X/view");
    expect(body).toContain("bis 23.12.2026 gültig; nach 3 und 7 Tagen erinnern wir ihn");
    expect(body).toContain("anna@muster.ch");
  });

  it("asks to assign the partner when Salesforce no longer gives their Contact or Account", () => {
    const body = leadTeamMail(party, { caseUrl: "https://x/500X", failed: false, partnerMissing: true }).lines.join("\n");
    expect(body).toContain("Der Case ist in Salesforce angelegt: https://x/500X, aber ohne Partner");
    expect(body).toContain("bitte den Partner von Hand zuordnen");
  });

  it("says so when Salesforce refused the invitation's Case", () => {
    expect(leadTeamMail(party, { caseUrl: null, failed: true }).lines.join("\n")).toContain("konnte in Salesforce nicht angelegt werden – bitte von Hand anlegen");
  });
});

describe("reminderDue", () => {
  const DAY = 24 * 3600_000;
  const row = (ageDays: number, over: Record<string, unknown> = {}) => ({
    status: "invited",
    createdAt: new Date(NOW.getTime() - ageDays * DAY),
    expiresAt: new Date(NOW.getTime() + 20 * DAY),
    remindersSent: 0,
    lastMailAt: new Date(NOW.getTime() - ageDays * DAY),
    lastReminderAt: null,
    ...over,
  });
  it("the first after 3 days, the second after 7", () => {
    expect(reminderDue(row(2.9), NOW)).toBeNull();
    expect(reminderDue(row(3), NOW)).toBe(1);
    expect(reminderDue(row(6, { remindersSent: 1, lastReminderAt: new Date(NOW.getTime() - 3 * DAY) }), NOW)).toBeNull();
    expect(reminderDue(row(7, { remindersSent: 1, lastReminderAt: new Date(NOW.getTime() - 4 * DAY) }), NOW)).toBe(2);
    expect(reminderDue(row(9, { remindersSent: 2 }), NOW)).toBeNull();
  });
  it("one at a time, never within a day of another mail, never after the submit or the expiry", () => {
    // A missed run sends the first; the second waits a day.
    expect(reminderDue(row(8), NOW)).toBe(1);
    expect(reminderDue(row(8, { remindersSent: 1, lastReminderAt: new Date(NOW.getTime() - 3600_000) }), NOW)).toBeNull();
    // «Erneut senden» an hour ago.
    expect(reminderDue(row(4, { lastMailAt: new Date(NOW.getTime() - 3600_000) }), NOW)).toBeNull();
    expect(reminderDue(row(4, { status: "submitted" }), NOW)).toBeNull();
    expect(reminderDue(row(4, { expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBeNull();
    expect(reminderDue(row(4, { status: "opened" }), NOW)).toBe(1);
  });
});

describe("texts", () => {
  it("every language has the page, the errors and the customer mail («du» in German)", () => {
    for (const l of LOCALES) {
      const t = DICTS[l].lead;
      expect(t.how).toHaveLength(4);
      expect(Object.keys(t.err).sort()).toEqual(Object.keys(DICTS.de.lead.err).sort());
      expect(t.mail.subject("Anna Muster (Muster AG)")).toContain("Anna Muster");
      expect(t.mail.foot(30)).toContain("30");
      expect(t.mail.replies("Anna Muster")).toContain("Anna Muster");
      expect(t.reminder.subject(1)).not.toBe(t.reminder.subject(2));
      expect(t.reminder.foot("23.12.2026")).toContain("23.12.2026");
      expect(DICTS[l].shell.newFinancing.lead).toBeTruthy();
    }
    expect(DICTS.de.lead.mail.body2).toContain("deine");
    // HYPOTEQ 23.11.2026: a welcome that names who the customer came through.
    expect(DICTS.de.lead.mail.heading).toBe("Willkommen bei HYPOTEQ");
    expect(DICTS.de.lead.mail.body("Anna Muster (Muster AG)")).toBe("schön, dass du über Anna Muster (Muster AG) zu uns gefunden hast – wir freuen uns, dich bei deiner Hypothekarfinanzierung zu begleiten.");
    expect(DICTS.de.lead.consent).toContain("Mein Kunde");
  });
});
