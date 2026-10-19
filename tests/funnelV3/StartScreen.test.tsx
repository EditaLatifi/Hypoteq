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

  it("in every language", () => {
    const want: Record<string, string> = { en: "approx. 3 minutes", fr: "env. 3 minutes", it: "ca. 3 minuti" };
    for (const [lang, text] of Object.entries(want)) {
      pathname = `/${lang}/funnel`;
      expect(renderToStaticMarkup(createElement(StartScreen))).toContain(text);
    }
  });
});
