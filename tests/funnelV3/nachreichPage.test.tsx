import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { nachreichV3View } from "@/lib/funnel-v3/nachreich";
import { existingRows, inquiryRow, v3StateFor, GARY, ANNA, TOKEN } from "./nachreichFixtures";

jest.mock("@/components/funnel-v3/funnel-v3.css", () => ({}));
jest.mock("@/components/funnel-v3/documents/documents.css", () => ({}));
jest.mock("@/components/funnel-v3/nachreich/nachreich.css", () => ({}));
let pathname = "/fr/nachreichen/x";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

import NachreichV3 from "@/components/funnel-v3/nachreich/NachreichV3";

const copy = {
  title: "Transmettre les documents manquants",
  intro: "Vous ne voyez ici que les documents qui nous manquent encore.",
  send: "Envoyer les documents",
  sending: "Envoi en cours …",
  error: "Le téléversement a échoué :",
  doneComplete: "Merci – votre dossier est désormais complet.",
  donePartial: "Merci – il manque encore :",
  alreadyComplete: "Votre dossier est déjà complet.",
};

const render = (view: any) => renderToStaticMarkup(createElement(NachreichV3, { token: TOKEN, view, copy }));

describe("NachreichV3 (server render)", () => {
  it("shows only the missing requirements, grouped, in the funnel look, with one drop zone", () => {
    pathname = "/fr/nachreichen/x";
    const html = render(nachreichV3View(inquiryRow({ v3State: v3StateFor([GARY, ANNA], "fr") }), existingRows()));
    expect(html).toContain('class="hqv3 v3-nachreich"');
    expect(html).toContain(">Transmettre les documents manquants</h1>");
    expect(html).toContain("HQ-26-10-000123");
    expect((html.match(/class="v3-drop[ "]/g) || []).length).toBe(1);
    expect(html).toContain(">Bien immobilier<");
    expect(html).toContain(">Personne · Gary Gerber<");
    expect(html).toContain(">Personne · Anna Muster<");
    expect(html).toContain(">Photos du bien (intérieur et extérieur)<");
    expect(html).toContain(">Certificats de salaire des 3 dernières années<");
    expect((html.match(/class="v3-docrow /g) || []).length).toBe(8);
    expect(html).not.toContain("registre foncier"); // the Grundbuch is not missing
    expect(html).toMatch(/<button type="button" class="v3-btn v3-btn--primary" disabled="">Envoyer les documents<\/button>/);
  });

  it("says so when nothing is missing", () => {
    const html = render({ ...nachreichV3View(inquiryRow(), existingRows())!, missing: [] });
    expect(html).toContain("Votre dossier est déjà complet.");
    expect(html).not.toContain("v3-drop");
  });
});
