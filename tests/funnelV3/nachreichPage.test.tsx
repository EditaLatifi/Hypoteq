import { describe, it, expect, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { nachreichV3View } from "@/lib/funnel-v3/nachreich";
import { existingRows, inquiryRow, v3StateFor, MAX, ANNA, TOKEN } from "./nachreichFixtures";

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
  completeIntro: "Vous pouvez ajouter ici d’autres documents à tout moment.",
  doneExtras: "Merci – documents supplémentaires reçus.",
};

const render = (view: any) => renderToStaticMarkup(createElement(NachreichV3, { token: TOKEN, view, copy }));

describe("NachreichV3 (server render)", () => {
  it("shows only the missing requirements, grouped, in the funnel look, with one drop zone", () => {
    pathname = "/fr/nachreichen/x";
    const html = render(nachreichV3View(inquiryRow({ v3State: v3StateFor([MAX, ANNA], "fr") }), existingRows()));
    expect(html).toContain('class="hqv3 v3-nachreich"');
    expect(html).toContain(">Transmettre les documents manquants</h1>");
    expect(html).toContain("HQ-26-10-000123");
    expect((html.match(/class="v3-drop[ "]/g) || []).length).toBe(1);
    expect(html).toContain(">Bien immobilier<");
    expect(html).toContain(">Personne · Max Mustermann<");
    expect(html).toContain(">Personne · Anna Muster<");
    expect(html).toContain(">Photos du bien (intérieur et extérieur)<");
    expect(html).toContain(">Certificat de salaire actuel<");
    expect(html).toContain(">Convention de produit actuelle<");
    expect((html.match(/class="v3-docrow /g) || []).length).toBe(7);
    expect(html).not.toContain("registre foncier"); // the Grundbuch is not missing
    expect(html).toMatch(/<button type="button" class="v3-btn v3-btn--primary" disabled="">Envoyer les documents<\/button>/);
  });

  it("a pending Auskunftsermächtigung gets its own slot, not a row (Handover 6)", () => {
    pathname = "/fr/nachreichen/x";
    const rows = existingRows().filter((r) => r.originalFileName !== "01_Auskunftsermaechtigung_Max_Mustermann_unterzeichnet.pdf");
    const view = nachreichV3View(inquiryRow({ v3State: v3StateFor([MAX, ANNA], "fr") }), rows)!;
    expect(view.missing.some((m) => m.instanceId === "vollmacht")).toBe(true);
    const html = render(view);
    expect(html).toContain('data-status="missing"');
    expect(html).toContain("Autorisation de renseignements HYPOTEQ · obligatoire");
    expect(html).toContain("Signer l’autorisation de renseignements");
    expect(html).toContain("Formulaire vierge – le modèle pré-rempli est joint à notre e-mail.");
    expect(html).toContain("Par Max Mustermann – par tous les emprunteurs s’il y en a plusieurs.");
    expect(html).toContain(">Télécharger signé</button>");
    // Not a row of the person group, and no «später» on this page.
    expect((html.match(/class="v3-docrow /g) || []).length).toBe(7);
    expect(html).not.toContain("Remettre plus tard");
    // The slot comes before the drop zone.
    expect(html.indexOf("v3-sig")).toBeLessThan(html.indexOf("v3-drop"));
  });

  it("a complete dossier says so and still offers the drop zone for further documents (D26)", () => {
    const html = render({ ...nachreichV3View(inquiryRow(), existingRows())!, missing: [] });
    expect(html).toContain("Votre dossier est déjà complet.");
    expect(html).toContain("Vous pouvez ajouter ici d’autres documents à tout moment.");
    expect(html).toContain("v3-drop");
    // Nothing to list: no requirement groups.
    expect(html).not.toContain("v3-docgroup-head");
  });
});
