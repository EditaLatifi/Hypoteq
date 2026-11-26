import { describe, it, expect } from "@jest/globals";
import { checkFormSpam, isRandomWord, HONEYPOT_FIELD, MIN_FILL_MS } from "@/lib/form-spam";

const CONTACT_FIELDS = ["firstName", "lastName", "company", "message"];

// What the bot sent on 26.11.2026 (random letters, nobody's real data).
const botContact = {
  firstName: "Zarj",
  lastName: "Qafhhictg",
  company: "nVhXMZIVmcaPYNcUqAFUmWR",
  email: "ct.js.m.it@gmail.com",
  phone: "5511176378",
  inquiryType: "general",
  message: "cqKjjZLNdXfGOdsCF",
};

// Fictional people writing the way customers do.
const realContacts = [
  {
    firstName: "Anna", lastName: "Muster", company: "", email: "anna.muster@example.ch",
    phone: "+41 79 123 45 67", inquiryType: "financing",
    message: "Guten Tag\nWir möchten eine Wohnung in Winterthur kaufen (Kaufpreis CHF 980'000). Können Sie uns zurückrufen?",
  },
  {
    firstName: "Jean-Luc", lastName: "Dupont-Müller", company: "Dupont Immobilien GmbH",
    email: "jl@example.ch", phone: "044 123 45 67", inquiryType: "partnership",
    message: "Bonjour, nous sommes une fiduciaire à Lausanne et souhaitons collaborer avec HYPOTEQ.",
  },
  {
    firstName: "Maria", lastName: "McDonald", company: "McDonaldsAG ImmoScout24 PostFinance SwissLife",
    email: "m@example.com", phone: "0791234567", inquiryType: "general",
    message: "Hi, my HQ-26-11-093160 renewal: see https://maps.app.goo.gl/XyZaBcDeFgHiJk and www.ImmoScout24.ch/AbCdEfGhIjKl",
  },
  {
    firstName: "Giulia", lastName: "Rossi", company: "UBS AG",
    email: "g.rossi@example.it", phone: "+39 333 1234567", inquiryType: "general",
    message: "Buongiorno, vorrei informazioni sul rinnovo dell'ipoteca. Grazie!\n\n— Website: /it/contatto",
  },
  {
    firstName: "Max", lastName: "Hypothekarfinanzierungsberatung", company: "iPhoneXsMax eBayAndAmazon",
    email: "max@example.ch", phone: "079 000 00 00", inquiryType: "general",
    message: "Rückruf bitte",
  },
];

describe("isRandomWord", () => {
  it.each(["cqKjjZLNdXfGOdsCF", "nVhXMZIVmcaPYNcUqAFUmWR", "AbCdEfGhIjKl"])("flags %s", (w: string) => {
    expect(isRandomWord(w)).toBe(true);
  });

  it.each([
    "Qafhhictg", "McDonaldsAG", "ImmoScoutAG", "PostFinance", "iPhoneXsMax", "eBayAndAmazon",
    "HYPOTEQ", "Hypothekarfinanzierungsberatung", "Grundbuchamt", "SwissLifeSelect", "JavaScript",
  ])("leaves %s alone", (w: string) => {
    expect(isRandomWord(w)).toBe(false);
  });
});

describe("checkFormSpam", () => {
  it("drops the bot's contact submission even without timing", () => {
    expect(checkFormSpam(botContact, CONTACT_FIELDS)).toEqual({ spam: true, reason: "random letters in company" });
  });

  it("drops a submission sent faster than a person can fill the form", () => {
    const v = checkFormSpam({ ...realContacts[0], elapsedMs: 1200 }, CONTACT_FIELDS);
    expect(v.spam).toBe(true);
  });

  it("drops a submission whose hidden field was filled", () => {
    const v = checkFormSpam({ ...realContacts[0], [HONEYPOT_FIELD]: "x", elapsedMs: 60000 }, CONTACT_FIELDS);
    expect(v).toEqual({ spam: true, reason: "hidden field filled" });
  });

  it.each(realContacts.map((c) => [c.firstName, c] as const))("lets %s through", (_name, c) => {
    expect(checkFormSpam({ ...c, [HONEYPOT_FIELD]: "", elapsedMs: 45000 }, CONTACT_FIELDS)).toEqual({ spam: false });
    // Older clients send neither field.
    expect(checkFormSpam(c, CONTACT_FIELDS)).toEqual({ spam: false });
  });

  it("accepts a form sent right at the minimum time", () => {
    expect(checkFormSpam({ ...realContacts[0], elapsedMs: MIN_FILL_MS }, CONTACT_FIELDS)).toEqual({ spam: false });
  });

  it("ignores a timing value that is not a number", () => {
    expect(checkFormSpam({ ...realContacts[0], elapsedMs: "5" }, CONTACT_FIELDS)).toEqual({ spam: false });
  });
});
