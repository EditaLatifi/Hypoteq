import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { gerberFiles, gerberState } from "./gerberCase";

jest.mock("@/components/funnel-v3/finish/finish.css", () => ({}));
let pathname = "/de/funnel";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

// A server render only ever sees a zustand store's initial state, so the store is replaced by
// a plain hook over the Gerber state.
jest.mock("@/lib/funnel-v3/store", () => {
  const { gerberFiles: files, gerberState: state } = jest.requireActual("./gerberCase") as typeof import("./gerberCase");
  const s: any = { ...state(), files: files(), submissionId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", sharepointFolderId: "F", step: 6, visited: 6, reset: () => {} };
  const hook: any = (sel: (x: any) => unknown) => sel(s);
  hook.getState = () => s;
  return { useFunnelV3: hook };
});

import Step6Finish from "@/components/funnel-v3/steps/Step6Finish";

const render = () => renderToStaticMarkup(createElement(Step6Finish));

describe("Step6Finish (server render)", () => {
  it("shows title, KPIs, hints, the check list and both actions", () => {
    expect(gerberFiles()).toHaveLength(30);
    expect(gerberState().ans.antrag).toBe("Ablösung");
    const html = render();
    expect(html).toContain("Letzter Blick auf die Anfrage");
    expect(html).toContain("Thema 6 von 6");
    expect(html).toContain('class="v3-kpi-value">CHF 650&#x27;000<');
    expect(html).toContain('class="v3-kpi-value">23 / 23<');
    expect(html).toContain("Hinweise an die Bank · 4");
    expect((html.match(/class="v3-hintrow"/g) || []).length).toBe(4);
    expect((html.match(/class="v3-checkrow"/g) || []).length).toBe(6);
    expect(html).toContain(">Finanzierungsanfrage abschliessen</button>");
    expect(html).toContain(">Fall-Dossier als PDF</button>");
    expect(html).not.toContain("v3-done");
    expect(html).not.toContain("v3-busy");
    expect(html).not.toContain('role="alert"');
  });

  it("follows the funnel language", () => {
    pathname = "/fr/funnel";
    const html = render();
    pathname = "/de/funnel";
    expect(html).toContain("Finaliser la demande de financement");
    expect(html).toContain("Dernier coup d’œil sur la demande");
  });
});
