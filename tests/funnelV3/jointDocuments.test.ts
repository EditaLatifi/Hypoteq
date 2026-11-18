/**
 * HYPOTEQ Komplett-Test B02 / Screenshot 6, seen in the data of round 1 (DECISIONS V128): a couple's
 * dossier — his three Lohnausweise 2025 (main job, school, fire brigade), two of hers, her double
 * family name printed only in part, and both IDs scanned into ONE file. Names are fictional; the
 * years, employers' kinds and amounts are those of the case.
 */
import { describe, it, expect } from "@jest/globals";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { toUploadedFiles } from "@/lib/funnel-v3/files";
import { placeAll, withPlacement } from "@/lib/funnel-v3/placeFile";
import { personScore, personsOn, secondPerson } from "@/lib/funnel-v3/persons";
import { reqList } from "@/lib/funnel-v3/requirements";
import { requirementStatus } from "@/lib/funnel-v3/requirementStatus";
import { prefillFromDocuments } from "@/lib/funnel-v3/prefill";
import { evaluateAbgleich } from "@/lib/funnel-v3/abgleich/evaluate";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_EM, EMPTY_TEXTS, type Borrower } from "@/lib/funnel-v3/types";

const NOW = new Date("2026-11-18T10:00:00Z");
let n = 0;
const f = (v: string) => ({ value: v, confidence: 0.99 });
function file(a: Partial<V3Analysis>): FileEntry {
  const analysis = { status: "done", docTypeLabel: a.docTypeId, confidence: 0.99, requirementId: a.docTypeId, fields: {}, contentHash: `h${++n}`, ...a } as V3Analysis;
  return { id: `f${++n}`, name: `${a.docTypeId}.pdf`, size: 1, uploadState: "uploaded", analysisState: "done", analysis };
}
const lohn = (person: string, year: string, employer: string, gross: string) =>
  file({ docTypeId: "lohnausweise", personName: person, docDate: year, fields: { Jahr: f(year), Arbeitgeber: f(employer), Bruttolohn: f(gross) } });
const JOINT_ID = () =>
  file({ docTypeId: "id", personName: "Beispiel Tom Thomas; Beispiel-Muster Anna Ruth", fields: { Name: f("Beispiel; Beispiel-Muster"), Vornamen: f("Tom Thomas; Anna Ruth"), Dokumentart: f("Identitätskarte; Identitätskarte") } });

const files = () => [
  lohn("Beispiel Tom", "2025", "Zweckverband Feuerwehr", "CHF 616"),
  lohn("Beispiel Tom", "2025", "Schulgemeinde", "CHF 13'406.15"),
  lohn("Beispiel Tom", "2024", "Muster Maschinen AG", "CHF 136'288"),
  lohn("Beispiel Tom", "2025", "Muster Maschinen AG", "CHF 137'955"),
  lohn("Beispiel Anna", "2025", "Kirchgemeinde", "CHF 7'500"),
  lohn("Beispiel Anna", "2025", "Gemeinde Dorf", "CHF 1'000"),
  JOINT_ID(),
];
const b = (id: string, vor: string, nach: string): Borrower => ({ id, vor, nach, pkSe: "Nein" });
const couple = () => {
  const borrowers = [b("b1", "Tom Thomas", "Beispiel"), b("b2", "Anna Ruth", "Beispiel-Muster")];
  return { ans: { ...DEFAULT_ANSWERS, antrag: "Neue Hypothek" as const, immo: "Bestehende Immobilie" as const }, borrowers, txt: { ...EMPTY_TEXTS, vor: "Tom Thomas", nach: "Beispiel" }, em: { ...EMPTY_EM }, info: {}, fin: { ...EMPTY_AMOUNTS, kaufpreis: 1000000 } };
};

describe("names", () => {
  it("a double family name fits when one part is printed — and still tells the spouses apart", () => {
    const anna = { kind: "borrower" as const, first: "Anna Ruth", last: "Beispiel-Muster", display: "" };
    const tom = { kind: "borrower" as const, first: "Tom Thomas", last: "Beispiel", display: "" };
    expect(personScore("Beispiel Anna", anna)).toBeGreaterThan(personScore("Beispiel Anna", tom));
    expect(personScore("Beispiel Tom", tom)).toBeGreaterThan(personScore("Beispiel Tom", anna));
    expect(personScore("Muster Hans", anna)).toBeGreaterThan(0);
    expect(personScore("Meier Anna", anna)).toBe(0);
  });

  it("reads the persons of a joint ID from its fields", () => {
    expect(personsOn(JOINT_ID().analysis).map((p) => p.display)).toEqual(["Tom Thomas Beispiel", "Anna Ruth Beispiel-Muster"]);
    expect(personsOn({ personName: "Muster Lea", fields: { Name: f("Muster"), Vornamen: f("Lea") } }).map((p) => p.display)).toEqual(["Lea Muster"]);
  });

  it("«als 2. Kreditnehmer/in erfassen» offers the person who is not the applicant — never the names glued together", () => {
    const a = JOINT_ID().analysis!;
    expect(secondPerson(a, "", { vor: "Tom Thomas", nach: "Beispiel" })).toMatchObject({ vor: "Anna Ruth", nach: "Beispiel-Muster" });
    // The tester's own name on the request: the first person on the ID, as a proper name.
    expect(secondPerson(a, "", { vor: "Max", nach: "Tester" })).toMatchObject({ vor: "Tom Thomas", nach: "Beispiel" });
    expect(secondPerson(undefined, "Anna Beispiel", { vor: "Lea", nach: "Muster" })).toMatchObject({ vor: "Anna", nach: "Beispiel" });
  });
});

describe("the couple's dossier", () => {
  it("his three Lohnausweise 2025 on his row, hers on hers; the joint ID on his row", () => {
    const list = files();
    const map = placeAll(list, couple() as any, { now: NOW });
    expect(list.map((x) => map.get(x.id)?.instanceId ?? `${map.get(x.id)?.extraKind}:${map.get(x.id)?.reason}`)).toEqual([
      "lohnausweise#b1",
      "lohnausweise#b1",
      "surplus:period",
      "lohnausweise#b1",
      "lohnausweise#b2",
      "lohnausweise#b2",
      "id#b1",
    ]);
  });

  it("the joint ID fulfils both ID rows", () => {
    const s = couple() as any;
    const list = files();
    const map = placeAll(list, s, { now: NOW });
    const placed = list.map((x) => withPlacement(x, map.get(x.id)));
    const status = requirementStatus(reqList(s), toUploadedFiles(placed, NOW));
    expect(status.requirements.filter((r) => r.instance.id === "id").map((r) => [r.instance.instanceId, r.state])).toEqual([
      ["id#b1", "ok"],
      ["id#b2", "ok"],
    ]);
  });

  it("the incomes: his CHF 151'977 (not the CHF 616 of round 1), hers CHF 8'500", () => {
    const s = couple();
    const r = prefillFromDocuments(files().map((x) => ({ fileId: x.id, analysis: x.analysis! })), { ans: s.ans, txt: s.txt, borrowers: s.borrowers, touched: {} } as any, { now: NOW });
    expect(Math.round(Number(r.values["fin.inc"]))).toBe(151977);
    expect(r.values["fin.inc2"]).toBe(8500);
  });

  it("the Abgleich: the joint ID is no identity conflict for him", () => {
    const s = { ...couple(), fin: { ...couple().fin, inc: 151977 } } as any;
    const list = files();
    const map = placeAll(list, s, { now: NOW });
    const docs = list.filter((x) => map.get(x.id)?.instanceId).map((x) => ({ id: x.id, instanceId: map.get(x.id)!.instanceId, analysis: x.analysis! }));
    const r = evaluateAbgleich({ state: s, docs });
    expect(r.blocking).toEqual([]);
    expect(r.fields.find((x) => x.id === "jahreseinkommen:b1")?.result).toBe("ok");
  });
});
