/**
 * HYPOTEQ Komplett-Test 18.11.2026 («Der zweite Kreditnehmer wird nicht von Anfang an erkannt»,
 * DECISIONS V121): the Schnellanmeldung asks «allein oder zu zweit?» in its first step, so the
 * second person's documents go to their own rows from the upload on.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

jest.mock("next/navigation", () => ({ usePathname: () => "/de/funnel", useRouter: () => ({ replace: () => {} }) }));

// The server render reads a store's initial state: the component sees this mock instead.
const mockState: { current: any } = { current: null };
const actions = { addBorrower: jest.fn(), removeBorrower: jest.fn(), updateBorrower: jest.fn(), setTxt: jest.fn(), setAns: jest.fn() };
jest.mock("@/lib/funnel-v3/store", () => {
  const hook: any = (sel: (x: any) => unknown) => sel({ ...mockState.current, ...actions });
  hook.getState = () => ({ ...mockState.current, ...actions });
  return { useFunnelV3: hook };
});

import CoBorrowerStart from "@/components/funnel-v3/steps/CoBorrowerStart";
import ScreenKontakt from "@/components/funnel-v3/steps/ScreenKontakt";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { placeAll } from "@/lib/funnel-v3/placeFile";
import { mkState, MAX } from "./helpers";

const base = () => ({
  role: "kunde",
  mode: "schnell",
  ans: { kn: "Natürliche Person" },
  borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }],
  txt: { mail: "", tel: "", vor: "", nach: "", bmail: "" },
  fin: {},
  em: {},
  info: {},
  src: {},
  touched: {},
  errors: {},
  showErrors: {},
});

beforeEach(() => {
  mockState.current = base();
});

describe("«Finanzierst du allein oder zu zweit?» in the Schnellanmeldung's Kontakt", () => {
  it("is asked on the Kontakt screen, «Allein» until a second person is added", () => {
    const html = renderToStaticMarkup(createElement(ScreenKontakt));
    expect(html).toContain("Finanzierst du allein oder zu zweit?");
    expect(html).toMatch(/aria-checked="true"[^>]*><span>Allein<\/span>/);
    expect(html).not.toContain("Nachname Kreditnehmer/in 2");
  });

  it("«Zu zweit» is Kreditnehmer 2 — with name fields; the partner view asks about the client", () => {
    mockState.current.borrowers = [...mockState.current.borrowers, { id: "b2", vor: "", nach: "", pkSe: "Nein" }];
    let html = renderToStaticMarkup(createElement(CoBorrowerStart));
    expect(html).toMatch(/aria-checked="true"[^>]*><span>Zu zweit<\/span>/);
    expect(html).toContain("Vorname(n) Kreditnehmer/in 2");
    expect(html).toContain("Nachname Kreditnehmer/in 2");
    mockState.current.role = "berater";
    html = renderToStaticMarkup(createElement(CoBorrowerStart));
    expect(html).toContain("Finanziert dein Kunde allein oder zu zweit?");
  });

  it("not for a juristische Person", () => {
    mockState.current.ans = { kn: "Juristische Person" };
    expect(renderToStaticMarkup(createElement(CoBorrowerStart))).toBe("");
  });
});

describe("with Kreditnehmer 2 known before the upload", () => {
  let n = 0;
  const doc = (docTypeId: string, personName: string, docDate?: string): FileEntry => {
    const analysis: V3Analysis = { status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.95, requirementId: docTypeId, personName, docDate: docDate ?? null, fields: {}, contentHash: `h${++n}` };
    return { id: `f${++n}`, name: `${docTypeId}.pdf`, size: 1, uploadState: "uploaded", analysisState: "done", analysis };
  };
  const NOW = new Date("2026-11-18T10:00:00Z");
  const files = () => [doc("id", "Mustermann Max"), doc("id", "Beispiel Anna"), doc("lohnausweise", "Mustermann Max", "2025"), doc("lohnausweise", "Beispiel Anna", "2025")];

  it("named: each document on its person's row from the start", () => {
    const s = mkState({ antrag: "Neue Hypothek" }, {}, {}, [MAX, { id: "b2", vor: "Anna", nach: "Beispiel", pkSe: "Nein" }]);
    const f = files();
    const map = placeAll(f, s, { now: NOW });
    expect(f.map((x) => map.get(x.id)?.instanceId)).toEqual(["id#b1", "id#b2", "lohnausweise#b1", "lohnausweise#b2"]);
  });

  it("only «Zu zweit» tapped, no name yet: the second person's documents still take the empty rows", () => {
    const s = mkState({ antrag: "Neue Hypothek" }, {}, {}, [MAX, { id: "b2", vor: "", nach: "", pkSe: "Nein" }]);
    const f = files();
    const map = placeAll(f, s, { now: NOW });
    expect(f.map((x) => map.get(x.id)?.instanceId)).toEqual(["id#b1", "id#b2", "lohnausweise#b1", "lohnausweise#b2"]);
  });
});
