/**
 * Retest 20.10.2026 (C2): a recognised partner types no name, so the customer mail read
 * «fisnik.salihu@… hat deine Finanzierungsanfrage erfasst» and «Dein Berater: <address>». The
 * Salesforce Contact now gives name and company. And an optional document reads «Fehlt
 * (optional)», not a bare «Fehlt» that the «fehlen noch» list does not repeat.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { buildClosingMails, closingPartner, type ClosingMail, type ClosingMailsInput } from "@/lib/funnel-v3/mail";
import { EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import { CASE_NO, RETURN_URL, ablState, kaufState, v5Payload } from "./v5Fixtures";

const deps = {
  authorizationPdf: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
  authorizationName: () => `${CASE_NO}_Auskunftsermaechtigung.pdf`,
  log: { log: () => {}, warn: () => {}, error: () => {} },
};
const input = (data: any, over: Partial<ClosingMailsInput> = {}): ClosingMailsInput => ({
  data,
  lang: "de",
  caseNumber: CASE_NO,
  date: new Date(Date.UTC(2026, 9, 20, 10, 0)),
  inquiryId: "inq-1",
  returnUrl: RETURN_URL,
  linkDays: 30,
  salesforce: { caseId: null, url: null, failed: false, testMode: false, dropped: [] },
  ...over,
});
const of = (list: ClosingMail[], audience: string) => list.find((m) => m.audience === audience)!;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");

/** A recognised partner: only the address was typed (no new-partner form). */
const recognised = () => {
  const s = ablState();
  return v5Payload({ ...s, txt: { ...EMPTY_TEXTS, ...s.txt, pvor: "", pnach: "", ptel: "", pfirma: "" } });
};

describe("closing mails: the recognised partner's name", () => {
  it("names the partner and the company in the customer mail", async () => {
    const list = await buildClosingMails(input(recognised(), { partner: { name: "Bea Rater", company: "Partner AG" } }), deps);
    const k = text(of(list, "kunde").html);
    expect(k).toContain("Bea Rater hat deine Finanzierungsanfrage bei HYPOTEQ erfasst");
    expect(k).toMatch(/Dein Berater Bea Rater Partner AG bea\.rater@partner\.ch/);
    expect(k).toContain("Bea Rater · bea.rater@partner.ch");
  });

  it("falls back to the address without a Salesforce answer", async () => {
    const k = text(of(await buildClosingMails(input(recognised()), deps), "kunde").html);
    expect(k).toContain("bea.rater@partner.ch hat deine Finanzierungsanfrage bei HYPOTEQ erfasst");
  });

  it("keeps what a new partner typed over the lookup", async () => {
    const list = await buildClosingMails(input(v5Payload(ablState()), { partner: { name: "Other Name", company: "Other AG" } }), deps);
    const k = text(of(list, "kunde").html);
    expect(k).toContain("Bea Rater hat deine Finanzierungsanfrage");
    expect(k).toContain("Partner AG");
    expect(k).not.toContain("Other");
  });
});

describe("closingPartner", () => {
  const berater = recognised();
  it("takes name and company of a partner Contact, the name of a HYPOTEQ user", async () => {
    expect(await closingPartner(berater, async () => ({ status: "partner", contactId: "003X", accountId: "001X", name: "Bea Rater", firstName: "Bea", lastName: "Rater", company: "Partner AG" }))).toEqual({ name: "Bea Rater", company: "Partner AG" });
    expect(await closingPartner(berater, async () => ({ status: "hypoteq", userId: "005X", name: "Fisnik Salihu" }))).toEqual({ name: "Fisnik Salihu", company: null });
  });

  it("is null for an unknown address, a failed lookup, or a customer's own request", async () => {
    expect(await closingPartner(berater, async () => ({ status: "unknown" }))).toBeNull();
    expect(await closingPartner(berater, async () => { throw new Error("Salesforce down"); })).toBeNull();
    const resolve = jest.fn(async () => ({ status: "unknown" as const }));
    expect(await closingPartner(v5Payload(kaufState()), resolve)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("closing mails: optional documents", () => {
  it("an optional document reads «Fehlt (optional)», a required one «Fehlt»", async () => {
    const summary = of(await buildClosingMails(input(v5Payload(kaufState(), { missing: ["verkaufsdoku", "fotos"] })), deps), "kunde").summary;
    const lines = summary.docs.groups.flatMap((g) => g.lines);
    expect(lines.find((l) => l.label === "Verkaufsdokumentation")).toMatchObject({ state: "missing", stateLabel: "Fehlt (optional)", warn: false });
    expect(lines.find((l) => l.label.startsWith("Fotos der Immobilie"))).toMatchObject({ state: "missing", stateLabel: "Fehlt", warn: true });
    // The «fehlen noch» list asks for the required one only.
    expect(summary.next.missing.some((m) => m.startsWith("Fotos der Immobilie"))).toBe(true);
    expect(summary.next.missing).not.toContain("Verkaufsdokumentation");
  });
});
