/**
 * Document findings of HYPOTEQ's Komplett-Test, second round (18.11.2026):
 *  - A02: the Rahmenvertrag at an Ablösung was «nicht benötigt» (V119);
 *  - the Eigenmittelnachweis was «nicht benötigt – nur bei einem Kauf» (V119);
 *  - the Steuererklärung of the second Kreditnehmer was «überzählig» (V119);
 *  - a foreigner's passport and Aufenthaltsbewilligung C: one of them «überzählig» (V120);
 *  - the Schnellanmeldung reads the files before the Kreditantrag is asked (V119 prefill).
 */
import { describe, it, expect } from "@jest/globals";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { isResidencePermit, OTHER_PERSON_DE, placeAll } from "@/lib/funnel-v3/placeFile";
import { prefillFromDocuments } from "@/lib/funnel-v3/prefill";
import { isRelevantExtra } from "@/components/funnel-v3/documents/view";
import type { Borrower } from "@/lib/funnel-v3/types";
import { MAX, mkState } from "./helpers";

const NOW = new Date("2026-11-18T10:00:00Z");
let n = 0;

function file(docTypeId: string, personName: string | null, fields: Record<string, string> = {}, extra: Partial<V3Analysis> = {}): FileEntry {
  const analysis: V3Analysis = {
    status: "done",
    docTypeId,
    docTypeLabel: docTypeId,
    confidence: 0.95,
    requirementId: docTypeId,
    personName,
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.95 }])),
    contentHash: `hash-${++n}`,
    ...extra,
  };
  return { id: `f${++n}`, name: `${docTypeId}.pdf`, size: 1, uploadState: "uploaded", analysisState: "done", analysis };
}

const where = (state: ReturnType<typeof mkState>, files: FileEntry[]) => {
  const map = placeAll(files, state, { now: NOW });
  return files.map((f) => {
    const p = map.get(f.id)!;
    return p.instanceId ?? `${p.extraKind}:${p.reason}`;
  });
};

const anna: Borrower = { id: "b2", vor: "Anna", nach: "Beispiel", job: "Angestellt", pkSe: "Nein" };

describe("A02: the Rahmenvertrag of the current mortgage", () => {
  it("is «Fallrelevant» at an Ablösung and while the Kreditantrag is open, «nicht benötigt» at a Kauf", () => {
    const rahmen = () => file("hyp_rahmen", null, {}, { requirementId: null });
    expect(where(mkState({ antrag: "Ablösung" }), [rahmen()])).toEqual(["relevant:relevant"]);
    expect(where(mkState({ antrag: undefined }), [rahmen()])).toEqual(["relevant:relevant"]);
    expect(where(mkState({ antrag: "Neue Hypothek" }), [rahmen()])).toEqual(["notneeded:notneeded"]);
  });

  it("shows in «Weitere fallrelevante Unterlagen»", () => {
    const f = file("hyp_rahmen", null, {}, { requirementId: null });
    const p = placeAll([f], mkState({ antrag: "Ablösung" }), { now: NOW }).get(f.id);
    expect(isRelevantExtra(p)).toBe(true);
  });
});

describe("the Eigenmittelnachweis off the list", () => {
  it("is «Fallrelevant» at an Ablösung and with the Kreditantrag open — on the list at a Kauf", () => {
    const vm = () => file("vermoegen", null, {}, { docDate: "2026-10-31" });
    const open = placeAll([vm()], mkState({ antrag: undefined }), { now: NOW });
    expect([...open.values()].map((p) => [p.extraKind, p.reason, isRelevantExtra(p)])).toEqual([["surplus", "offList", true]]);
    expect(where(mkState({ antrag: "Ablösung" }), [vm()])).toEqual(["surplus:offList"]);
    expect(where(mkState({ antrag: "Neue Hypothek" }), [vm()])).toEqual(["vermoegen"]);
  });
});

describe("the second Kreditnehmer's Steuererklärung (P17 asks it of Kreditnehmer 1 only)", () => {
  it("is «Fallrelevant» with the person, not «überzählig – bereits vollständig»", () => {
    const s = mkState({ antrag: "Neue Hypothek" }, {}, {}, [MAX, anna]);
    const files = [file("steuer", "Mustermann Max", {}, { docDate: "2025" }), file("steuer", "Beispiel Anna", {}, { docDate: "2024" })];
    const map = placeAll(files, s, { now: NOW });
    expect(map.get(files[0].id)?.instanceId).toBe("steuer#b1");
    expect(map.get(files[1].id)).toMatchObject({ extraKind: "relevant", reason: "relevant", requirementId: "steuer", extraReason: OTHER_PERSON_DE });
    expect(isRelevantExtra(map.get(files[1].id))).toBe(true);
  });

  it("also before the second person is entered", () => {
    const files = [file("steuer", "Mustermann Max", {}, { docDate: "2025" }), file("steuer", "Beispiel Anna", {}, { docDate: "2024" })];
    expect(where(mkState({ antrag: "Neue Hypothek" }), files)).toEqual(["steuer#b1", "relevant:relevant"]);
  });

  it("a second copy of the same person's Steuererklärung stays «überzählig»", () => {
    const files = [file("steuer", "Mustermann Max", {}, { docDate: "2025" }), file("steuer", "MUSTERMANN MAX", {}, { docDate: "2025" })];
    expect(where(mkState({ antrag: "Neue Hypothek" }), files)).toEqual(["steuer#b1", "surplus:full"]);
  });
});

describe("V120: a foreigner's passport and residence permit", () => {
  const joao: Borrower = { id: "b1", vor: "Joao Pedro", nach: "Silva Costa", job: "Angestellt", pkSe: "Nein" };

  it("knows a permit by its Dokumentart", () => {
    expect(isResidencePermit(file("id", "x", { Dokumentart: "Ausländerausweis C" }).analysis!)).toBe(true);
    expect(isResidencePermit(file("id", "x", { Dokumentart: "Aufenthaltsbewilligung B" }).analysis!)).toBe(true);
    expect(isResidencePermit(file("id", "x", { Dokumentart: "Permis C" }).analysis!)).toBe(true);
    expect(isResidencePermit(file("id", "x", { Dokumentart: "Pass" }).analysis!)).toBe(false);
    expect(isResidencePermit(file("id", "x", { Dokumentart: "Identitätskarte" }).analysis!)).toBe(false);
  });

  it("both go on the person's ID row, in either order", () => {
    const s = mkState({ antrag: "Neue Hypothek" }, {}, { vor: "Joao Pedro", nach: "Silva Costa" }, [joao]);
    const pass = () => file("id", "SILVA COSTA Joao Pedro", { Dokumentart: "Pass", "Nationalität": "Portugal" });
    const permit = () => file("id", "Silva Costa Joao Pedro", { Dokumentart: "Ausländerausweis C" });
    expect(where(s, [pass(), permit()])).toEqual(["id#b1", "id#b1"]);
    expect(where(s, [permit(), pass()])).toEqual(["id#b1", "id#b1"]);
  });

  it("two passports of the same person: the second stays «überzählig»; another person's permit does not join", () => {
    const s = mkState({ antrag: "Neue Hypothek" }, {}, { vor: "Joao Pedro", nach: "Silva Costa" }, [joao]);
    const pass = () => file("id", "Silva Costa Joao Pedro", { Dokumentart: "Pass" });
    expect(where(s, [pass(), pass()])).toEqual(["id#b1", "surplus:full"]);
    const other = file("id", "Ferreira Ana", { Dokumentart: "Ausländerausweis B" });
    expect(where(s, [pass(), other])[1]).not.toBe("id#b1");
  });
});

describe("the Kreditantrag from the documents (Schnellanmeldung, V119)", () => {
  const prefill = (files: FileEntry[]) =>
    prefillFromDocuments(
      files.map((f) => ({ fileId: f.id, analysis: f.analysis! })),
      { ans: { kn: "Natürliche Person" } as any, txt: { vor: "", nach: "" } as any, borrowers: [] },
      { now: NOW }
    );

  it("a Reservationsvertrag → Neue Hypothek, a Rahmenvertrag or a Produktvereinbarung → Ablösung, marked «bitte prüfen»", () => {
    const r = prefill([file("reservation", null, { Kaufpreis: "CHF 980'000" })]);
    expect(r.values["ans.antrag"]).toBe("Neue Hypothek");
    expect(r.src["ans.antrag"]?.unsure).toBe(true);
    expect(prefill([file("hyp_rahmen", null, {}, { requirementId: null })]).values["ans.antrag"]).toBe("Ablösung");
    expect(prefill([file("produkt", null)]).values["ans.antrag"]).toBe("Ablösung");
  });

  it("documents that disagree leave it open", () => {
    expect(prefill([file("kaufvertrag", null, { Kaufpreis: "CHF 1'000'000" }), file("hyp_rahmen", null, {}, { requirementId: null })]).values["ans.antrag"]).toBeUndefined();
  });
});

describe("V123: a reopened request reads old «nicht erkannt» verdicts again", () => {
  // Loaded lazily: upload.ts pulls in the store.
  const { staleAnalysis } = require("@/lib/funnel-v3/upload") as typeof import("@/lib/funnel-v3/upload");
  const { PROMPT_VERSION } = require("@/components/documentIntelligence/v3/prompt") as typeof import("@/components/documentIntelligence/v3/prompt");
  const entry = (a: Partial<V3Analysis>, over: Partial<FileEntry> = {}): FileEntry => ({ ...file("x", null), analysis: { ...file("x", null).analysis!, ...a }, ...over });

  it("a Mietvertrag left unrecognised by the catalogue of 06.11. is read again", () => {
    expect(staleAnalysis(entry({ docTypeId: null, promptVersion: undefined }))).toBe(true);
    expect(staleAnalysis(entry({ docTypeId: null, promptVersion: "2026-11-05.1" }))).toBe(true);
  });

  it("a Lohnausweis read before Ziffer 3 is read again; other recognised files keep their verdict", () => {
    expect(staleAnalysis(entry({ docTypeId: "lohnausweise", promptVersion: "2026-11-11.1" }))).toBe(true);
    expect(staleAnalysis(entry({ docTypeId: "grundbuch", promptVersion: "2026-11-11.1" }))).toBe(false);
  });

  it("not when read under today's catalogue, not a failed reading, not a file placed by hand", () => {
    expect(staleAnalysis(entry({ docTypeId: null, promptVersion: PROMPT_VERSION }))).toBe(false);
    expect(staleAnalysis(entry({ docTypeId: null, status: "failed" }))).toBe(false);
    expect(staleAnalysis(entry({ docTypeId: null }, { assignedByUser: true }))).toBe(false);
  });
});

describe("V125: an unsure identity never blocks once left to HYPOTEQ", () => {
  const { evaluateAbgleich } = require("@/lib/funnel-v3/abgleich/evaluate") as typeof import("@/lib/funnel-v3/abgleich/evaluate");
  const { kaufState } = require("./v5Fixtures") as typeof import("./v5Fixtures");
  const { reqList } = require("@/lib/funnel-v3/requirements") as typeof import("@/lib/funnel-v3/requirements");

  it("identity conflict → blocking; «HYPOTEQ prüft es von Hand» → to_check, nothing blocks, the choice is the evidence", () => {
    const s = kaufState();
    const inst = reqList(s).find((i) => i.id === "id" && i.borrowerId === "b1")!.instanceId;
    const docs = [{ id: "d1", instanceId: inst, analysis: file("id", "Beispiel Anna", { Vornamen: "Anna", Name: "Beispiel", Dokumentart: "Pass" }).analysis! }];
    const before = evaluateAbgleich({ state: s, docs });
    expect(before.blocking.map((f) => f.id)).toEqual(["name_kreditnehmer:b1"]);
    const after = evaluateAbgleich({ state: s, docs, choices: { "name_kreditnehmer:b1": { value: "Lea Muster", chosenSource: "funnel", at: "2026-11-18T10:00:00Z" } } });
    expect(after.blocking).toEqual([]);
    const f = after.fields.find((x) => x.id === "name_kreditnehmer:b1")!;
    expect(f.result).toBe("to_check");
    expect(f.customerChoice?.chosenSource).toBe("funnel");
    expect(f.nameOnDocument).toBe("Anna Beispiel");
    expect(after.summary.toCheck).toBeGreaterThanOrEqual(1);
  });
});
