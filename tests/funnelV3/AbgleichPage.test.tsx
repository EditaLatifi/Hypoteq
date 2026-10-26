import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

/**
 * The Abgleich page (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 3; texts 10.3/10.5, German
 * in «du» as HYPOTEQ asked on 26.10.2026).
 */

jest.mock("@/components/funnel-v3/finish/finish.css", () => ({}));
jest.mock("@/components/funnel-v3/documents/documents.css", () => ({}));
let pathname = "/de/funnel";
jest.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: () => {}, push: () => {} }) }));

let withForeignId = true;
let choices: Record<string, unknown> = {};
jest.mock("@/lib/funnel-v3/store", () => {
  const { kaufState } = jest.requireActual("./v5Fixtures") as typeof import("./v5Fixtures");
  const { reqList } = jest.requireActual("@/lib/funnel-v3/requirements") as typeof import("@/lib/funnel-v3/requirements");
  const s = kaufState({ fin: { ...kaufState().fin, inc: 120000 } });
  const inst = (id: string) => reqList(s).find((i) => i.id === id && i.borrowerId === "b1")!.instanceId;
  const file = (id: string, instanceId: string, docTypeId: string, fields: Record<string, { value: string; confidence: number }>) => ({
    id,
    name: `${id}.pdf`,
    size: 1,
    uploadState: "uploaded",
    analysisState: "done",
    instanceId,
    analysis: { status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.95, requirementId: docTypeId, fields },
  });
  const current = () => ({
    ...s,
    submissionId: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
    step: 4,
    visited: 4,
    skipped: [],
    dismissed: [],
    choices,
    chooseAbgleich: () => {},
    files: [
      file("lohn", inst("lohnausweise"), "lohnausweise", { Bruttolohn: { value: "CHF 100'000", confidence: 0.95 } }),
      ...(withForeignId ? [file("pass", inst("id"), "id", { Vornamen: { value: "Anna", confidence: 0.96 }, Name: { value: "Beispiel", confidence: 0.96 } })] : []),
    ],
  });
  const hook: any = (sel: (x: any) => unknown) => sel(current());
  hook.getState = current;
  return { useFunnelV3: hook };
});

import Abgleich from "@/components/funnel-v3/finish/Abgleich";

const render = () => renderToStaticMarkup(createElement(Abgleich));

beforeEach(() => {
  withForeignId = true;
  choices = {};
  pathname = "/de/funnel";
});

describe("Abgleich page (Spezifikation Datenabgleich 3)", () => {
  it("one card per difference, the identity card first; the submit waits for the identity", () => {
    const html = render();
    expect(html).toContain(">Fast geschafft – bitte prüfe deine Angaben</h2>");
    expect(html).toContain("Bei 2 Angaben gibt es Unterschiede – bitte wähle den korrekten Wert.");
    // identity: the text with both names, the two ways out
    expect(html).toContain("Das hochgeladene Dokument lautet auf Anna Beispiel – dein Antrag auf Lea Muster.");
    expect(html).toContain(">Anna Beispiel als 2. Kreditnehmer/in erfassen</button>");
    expect(html).toContain(">Richtiges Dokument hochladen</button>");
    expect(html.indexOf("is-identity")).toBeLessThan(html.indexOf("Deine Eingabe im Formular"));
    // the income: both pills, the funnel's chosen, the document's with its name, the explanation
    expect(html).toMatch(/role="radio" aria-checked="true" class="v3-abg-pill is-selected"><span class="v3-abg-pill-label">Deine Eingabe im Formular<\/span><span class="v3-abg-pill-value">CHF 120&#x27;000<\/span>/);
    expect(html).toMatch(/aria-checked="false" class="v3-abg-pill"><span class="v3-abg-pill-label">Laut Aktueller Lohnausweis<\/span><span class="v3-abg-pill-value">CHF 100&#x27;000<\/span>/);
    expect(html).toContain(">Dokument ansehen →</button>");
    expect(html).toContain("Falls dein Einkommen inkl. Bonus höher ist, wähle deine Eingabe");
    // locked by the identity conflict
    expect(html).toMatch(/<button type="button" class="v3-btn v3-btn--dark v3-btn--lg" disabled=""[^>]*>Angaben bestätigen &amp; absenden<\/button>/);
    expect(html).toContain("Bitte kläre zuerst die markierten Unterschiede, dann kannst du absenden.");
  });

  it("a value difference alone does not lock; a choice made is shown", () => {
    withForeignId = false;
    choices = { "jahreseinkommen:b1": { value: 100000, chosenSource: "document", at: "x", original: 120000 } };
    const html = render();
    expect(html).toContain("Bei 1 Angabe gibt es einen Unterschied");
    expect(html).not.toContain("is-identity");
    expect(html).toMatch(/aria-checked="true" class="v3-abg-pill is-selected"><span class="v3-abg-pill-label">Laut Aktueller Lohnausweis/);
    // the original stays on the funnel pill
    expect(html).toContain('class="v3-abg-pill-value">CHF 120&#x27;000<');
    expect(html).not.toMatch(/disabled=""[^>]*>Angaben bestätigen/);
    expect(html).not.toContain("Bitte kläre zuerst");
  });

  it("in the funnel language", () => {
    pathname = "/fr/funnel";
    const html = render();
    expect(html).toContain("Presque terminé – veuillez vérifier vos données");
    expect(html).toContain("Votre saisie dans le formulaire");
  });
});
