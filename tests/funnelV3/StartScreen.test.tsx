/**
 * HYPOTEQ 19.10. B7: the Schnellanmeldung card says «ca. 3 Minuten», as in the Handover (DECISIONS
 * V52) — not the «ca. 1 Minute + Upload» of the delivered i18n. Server render of the start screen.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

let pathname = "/de/funnel";
jest.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: () => {} }) }));

const mockState: { current: any } = { current: { role: null, step: 0 } };
jest.mock("@/lib/funnel-v3/store", () => {
  const hook: any = (sel: (x: any) => unknown) => sel(mockState.current);
  hook.getState = () => mockState.current;
  return { useFunnelV3: hook };
});

import StartScreen from "@/components/funnel-v3/StartScreen";

beforeEach(() => {
  pathname = "/de/funnel";
});

describe("start screen (Handover 1)", () => {
  it("Schnellanmeldung: the Handover text and «ca. 3 Minuten»", () => {
    const html = renderToStaticMarkup(createElement(StartScreen));
    expect(html).toContain("Schnellanmeldung");
    expect(html).toContain("Ich habe die Unterlagen schon. Erst hochladen – danach ist die Anfrage grösstenteils ausgefüllt.");
    expect(html).toContain("ca. 3 Minuten · vieles vorausgefüllt");
    expect(html).not.toContain("ca. 1 Minute + Upload");
  });

  it("«Empfohlen» on the Schnellanmeldung, also for the customer (Komplett-Test A01, V117)", () => {
    for (const role of ["kunde", "berater"]) {
      mockState.current = { role, step: 0 };
      const html = renderToStaticMarkup(createElement(StartScreen));
      const cards = html.split("<button").filter((c) => c.includes("v3-start-card-title"));
      const marked = cards.filter((c) => c.includes("v3-start-card-rec")).map((c) => c.match(/v3-start-card-title">([^<]+)</)?.[1]);
      expect([role, marked]).toEqual([role, ["Schnellanmeldung"]]);
      expect(html.match(/v3-start-card-rec/g)).toHaveLength(1);
    }
    mockState.current = { role: null, step: 0 };
  });

  it("a partner's invitation: who invited, no role switch, «Empfohlen» and lime on the Begleitete Anmeldung (HYPOTEQ 23.11.2026)", () => {
    mockState.current = { role: "kunde", step: 0, lead: { token: "T".repeat(43), partnerName: "Anna Muster", partnerCompany: "Muster AG" } };
    const html = renderToStaticMarkup(createElement(StartScreen));
    expect(html).toContain("Anna Muster · Muster AG hat dich bei HYPOTEQ angemeldet.");
    expect(html).not.toContain("v3-roleswitch");
    const cards = html.split("<button").filter((c) => c.includes("v3-start-card-title"));
    const title = (c: string) => c.match(/v3-start-card-title">([^<]+)</)?.[1];
    expect(cards.filter((c) => c.includes("v3-start-card-rec")).map(title)).toEqual(["Begleitete Anmeldung"]);
    expect(cards.filter((c) => c.includes("v3-start-card--accent")).map(title)).toEqual(["Begleitete Anmeldung"]);
    mockState.current = { role: null, step: 0 };
  });

  it("in every language", () => {
    const want: Record<string, string> = { en: "approx. 3 minutes", fr: "env. 3 minutes", it: "ca. 3 minuti" };
    for (const [lang, text] of Object.entries(want)) {
      pathname = `/${lang}/funnel`;
      expect(renderToStaticMarkup(createElement(StartScreen))).toContain(text);
    }
  });
});
