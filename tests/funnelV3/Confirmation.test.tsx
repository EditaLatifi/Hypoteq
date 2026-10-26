import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { mustermannFiles, mustermannState } from "./mustermannCase";

/**
 * The confirmation page after the closing (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 2.5,
 * texts 10.4): a page of its own instead of a way off to the homepage.
 */

let pathname = "/de/funnel";
jest.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: () => {}, push: () => {} }) }));

let role = "kunde";
let dropTax = false;
jest.mock("@/lib/funnel-v3/store", () => {
  const { mustermannFiles: files, mustermannState: state } = jest.requireActual("./mustermannCase") as typeof import("./mustermannCase");
  const current = () => ({
    ...state(),
    role,
    submissionId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
    step: 4,
    visited: 4,
    reset: () => {},
    files: files().filter((f: any) => !dropTax || f.instanceId !== "steuer#b1"),
  });
  const hook: any = (sel: (x: any) => unknown) => sel(current());
  hook.getState = current;
  return { useFunnelV3: hook };
});

import Confirmation from "@/components/funnel-v3/finish/Confirmation";
import type { DoneInfo } from "@/components/funnel-v3/finish/doneState";

const DONE: DoneInfo = { submissionId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", inquiryId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f", caseNumber: "HQ-26-10-000123", name: "Max Mustermann", email: "max@example.ch" };
const render = (done = DONE) => renderToStaticMarkup(createElement(Confirmation, { done }));

beforeEach(() => {
  pathname = "/de/funnel";
  role = "kunde";
  dropTax = false;
});

describe("confirmation page (Spezifikation Datenabgleich 2.5)", () => {
  it("thanks with the case number, the three next steps, the dossier and the homepage", () => {
    expect(mustermannFiles()).toHaveLength(30);
    expect(mustermannState().txt.vor).toBe("Max");
    const html = render();
    expect(html).toContain(">Anfrage eingereicht – vielen Dank!</h1>");
    expect(html).toContain("Dein Fall HQ-26-10-000123 ist bei HYPOTEQ eingegangen.");
    expect(html).toContain("Fall-Durchsicht durch HYPOTEQ – bei Rückfragen melden wir uns innert 1 Arbeitstag.");
    expect(html).toContain("Bankanfrage bei den passenden Finanzierungspartnern.");
    expect(html).toContain("Fehlende Unterlagen nachreichen – der Link in der E-Mail führt jederzeit hierher zurück.");
    // Mustermann's folder is complete: no count on the third step.
    expect(html).not.toContain("v3-confirm-count");
    expect(html).toMatch(/<a class="v3-btn v3-btn--primary v3-btn--lg" href="\/api\/dossier\/6f1c2b9e-[^"]+" download="">Fall-Dossier herunterladen \(PDF\)<\/a>/);
    expect(html).toContain('href="https://hypoteq.ch">Zur HYPOTEQ-Startseite</a>');
    expect(html).toContain(">Neuen Antrag stellen</button>");
  });

  it("counts what is still missing on the third step", () => {
    dropTax = true;
    expect(render()).toContain('class="v3-tag v3-tone--lime v3-confirm-count">1 fehlend<');
  });

  it("without a case number; a Berater goes back to the Partnerportal; in the funnel language", () => {
    expect(render({ ...DONE, caseNumber: null })).toContain("Dein Fall ist bei HYPOTEQ eingegangen.");
    role = "berater";
    const berater = render();
    expect(berater).not.toContain("Zur HYPOTEQ-Startseite");
    expect(berater).toContain('href="/portal');
    role = "kunde";
    pathname = "/fr/funnel";
    const fr = render();
    expect(fr).toContain("Demande envoyée – merci !");
    expect(fr).toContain("Votre dossier HQ-26-10-000123 a bien été reçu par HYPOTEQ.");
  });
});
