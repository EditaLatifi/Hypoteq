import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { gerberFiles, gerberState } from "./gerberCase";

jest.mock("@/components/funnel-v3/finish/finish.css", () => ({}));
let pathname = "/de/funnel";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

// A server render only ever sees a zustand store's initial state, so the store is replaced by
// a plain hook over the Gerber state. `withoutSignature` drops the signed Auskunftsermächtigung.
let withoutSignature = false;
jest.mock("@/lib/funnel-v3/store", () => {
  const { gerberFiles: files, gerberState: state } = jest.requireActual("./gerberCase") as typeof import("./gerberCase");
  const base: any = { ...state(), submissionId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", sharepointFolderId: "F", step: 4, visited: 4, reset: () => {} };
  const current = () => ({ ...base, files: files().filter((f: any) => !withoutSignature || f.instanceId !== "vollmacht") });
  const hook: any = (sel: (x: any) => unknown) => sel(current());
  hook.getState = current;
  return { useFunnelV3: hook };
});

import Closing from "@/components/funnel-v3/finish/Closing";

const render = () => renderToStaticMarkup(createElement(Closing));

describe("Closing (server render)", () => {
  it("shows title, KPIs, hints, the check list, the Auskunftsermächtigung block and both actions", () => {
    expect(gerberFiles()).toHaveLength(30);
    expect(gerberState().ans.antrag).toBe("Ablösung");
    const html = render();
    expect(html).toContain("Letzter Blick auf die Anfrage");
    expect(html).toContain(">Abschluss<");
    expect(html).toContain('class="v3-kpi-value">CHF 650&#x27;000<');
    expect(html).toContain('class="v3-kpi-value">20 / 20<');
    expect(html).toContain("Hinweise an die Bank · 4");
    expect((html.match(/class="v3-hintrow"/g) || []).length).toBe(4);
    expect((html.match(/class="v3-checkrow"/g) || []).length).toBe(6);
    // The block of the signature branch (a stub in this branch) sits before the submit.
    expect(html).toContain("HYPOTEQ Auskunftsermächtigung · Pflicht");
    expect(html.indexOf("HYPOTEQ Auskunftsermächtigung · Pflicht")).toBeLessThan(html.indexOf('class="v3-submit"'));
    // Gerber's signed copy is in the folder: the request may be closed.
    expect(html).toContain(">Finanzierungsanfrage abschliessen</button>");
    expect(html).not.toContain("v3-finish-blocked");
    expect(html).toContain(">Fall-Dossier als PDF</button>");
    expect(html).not.toContain("v3-done");
    expect(html).not.toContain("v3-busy");
    expect(html).not.toContain('role="alert"');
  });

  it("is locked until the Auskunftsermächtigung is uploaded or «später» chosen (Handover 6)", () => {
    withoutSignature = true;
    const html = render();
    withoutSignature = false;
    expect(html).toMatch(/<button type="button" class="v3-btn v3-btn--dark" disabled=""[^>]*>Erst Auskunftsermächtigung hochladen<\/button>/);
    expect(html).toContain('id="v3-finish-blocked"');
  });

  it("follows the funnel language", () => {
    pathname = "/fr/funnel";
    const html = render();
    pathname = "/de/funnel";
    expect(html).toContain("Finaliser la demande de financement");
    expect(html).toContain("Dernier coup d’œil sur la demande");
  });
});
