import { describe, it, expect } from "@jest/globals";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { placeAll, placeFile, placedFiles, personScore } from "@/lib/funnel-v3/placeFile";
import { reqList } from "@/lib/funnel-v3/requirements";
import { documentsSummary, isSubmitted } from "@/lib/funnel-v3/documentsSummary";
import { GARY, GERBER_ANSWERS, mkState } from "./helpers";

const NOW = new Date("2026-10-05T10:00:00Z");
let n = 0;

function an(docTypeId: string | null, extra: Partial<V3Analysis> = {}): V3Analysis {
  return {
    status: "done",
    docTypeId,
    docTypeLabel: docTypeId,
    confidence: 0.95,
    requirementId: docTypeId,
    fields: {},
    contentHash: `hash-${++n}`,
    ...extra,
  };
}

function file(analysis: V3Analysis | undefined, extra: Partial<FileEntry> = {}): FileEntry {
  return {
    id: `f${++n}`,
    name: `${analysis?.docTypeId ?? "x"}.pdf`,
    size: 10,
    uploadState: "uploaded",
    documentId: `doc-${n}`,
    analysisState: analysis ? "done" : "analysing",
    analysis,
    ...extra,
  };
}

const gerber = () => mkState(GERBER_ANSWERS);

describe("placeFile (single file)", () => {
  const inst = reqList(gerber());

  it("places a recognised requirement on its instance", () => {
    expect(placeFile(an("grundbuch"), inst, [], { now: NOW })).toMatchObject({ instanceId: "grundbuch", reason: "placed" });
    expect(placeFile(an("lohnausweise", { docDate: "2024" }), inst, [], { now: NOW })).toMatchObject({ instanceId: "lohnausweise#b1" });
  });

  it("surplus when the requirement already has `expect` files", () => {
    const existing = [{ id: "a", instanceId: "grundbuch" }];
    expect(placeFile(an("grundbuch"), inst, existing, { now: NOW })).toMatchObject({ instanceId: null, extraKind: "surplus", reason: "full", requirementId: "grundbuch" });
    // Lohnausweise expect 3: the third still fits, the fourth not.
    const two = [{ id: "a", instanceId: "lohnausweise#b1" }, { id: "b", instanceId: "lohnausweise#b1" }];
    expect(placeFile(an("lohnausweise", { docDate: "2023" }), inst, two, { now: NOW }).reason).toBe("placed");
    const three = [...two, { id: "c", instanceId: "lohnausweise#b1" }];
    expect(placeFile(an("lohnausweise", { docDate: "2024" }), inst, three, { now: NOW }).extraKind).toBe("surplus");
  });

  it("surplus when the period is outside the requested years", () => {
    expect(placeFile(an("lohnausweise", { docDate: "2022" }), inst, [], { now: NOW })).toMatchObject({ extraKind: "surplus", reason: "period" });
  });

  it("duplicate when the content hash matches", () => {
    const p = placeFile(an("leasing", { contentHash: "same" }), inst, [{ id: "a", instanceId: "leasing", contentHash: "same" }], { now: NOW });
    expect(p).toMatchObject({ extraKind: "duplicate", reason: "duplicate", duplicateOf: "a" });
  });

  it("notneeded and unknown", () => {
    expect(placeFile(an("nn_steuerrechnung"), inst, [], { now: NOW })).toMatchObject({ extraKind: "notneeded", reason: "notneeded" });
    expect(placeFile(an(null), inst, [], { now: NOW })).toMatchObject({ extraKind: "unknown", reason: "unknown" });
    expect(placeFile(an(null, { status: "failed" }), inst, [], { now: NOW })).toMatchObject({ extraKind: "unknown", reason: "failed" });
    expect(placeFile(undefined, inst, [], { now: NOW })).toMatchObject({ instanceId: null, reason: "pending" });
  });

  it("a requirement type that is not on the list is an extra (and a suggestion)", () => {
    const plain = reqList(mkState());
    expect(placeFile(an("kredit"), plain, [], { now: NOW })).toMatchObject({ extraKind: "surplus", reason: "offList", requirementId: "kredit" });
    expect(placeFile(an("kredit"), plain, [], { now: NOW, fileId: "x", dismissed: ["x"] }).reason).toBe("dismissed");
  });
});

describe("placeAll", () => {
  it("fills slots with the newest documents first (a current extract replaces an old one)", () => {
    const old = file(an("grundbuch", { docDate: "2026-01-15", outdated: true }));
    const cur = file(an("grundbuch", { docDate: "2026-09-01" }));
    const map = placeAll([old, cur], gerber(), { now: NOW });
    expect(map.get(cur.id)).toMatchObject({ instanceId: "grundbuch" });
    expect(map.get(old.id)).toMatchObject({ extraKind: "surplus", reason: "full" });
  });

  it("Gerber: four Lohnausweise, two Steuererklärungen, a duplicate leasing contract", () => {
    const lohn = ["2022", "2023", "2024", "2025"].map((y) => file(an("lohnausweise", { docDate: y, personName: "Gerber Gary" })));
    const st24 = file(an("steuer", { docDate: "2024" }));
    const st25 = file(an("steuer", { docDate: "2025" }));
    const lease1 = file(an("leasing", { contentHash: "L" }));
    const lease2 = file(an("leasing", { contentHash: "L" }));
    const nn = file(an("nn_nebenkosten"));
    const map = placeAll([...lohn, st24, st25, lease1, lease2, nn], gerber(), { now: NOW });
    expect(lohn.map((f) => map.get(f.id)!.reason)).toEqual(["period", "placed", "placed", "placed"]);
    expect(map.get(st25.id)!.instanceId).toBe("steuer#b1");
    expect(map.get(st24.id)).toMatchObject({ extraKind: "surplus", reason: "full" });
    expect(map.get(lease1.id)!.instanceId).toBe("leasing");
    expect(map.get(lease2.id)).toMatchObject({ extraKind: "duplicate", duplicateOf: lease1.id });
    expect(map.get(nn.id)!.extraKind).toBe("notneeded");
  });

  it("moves a file from the extras onto the list after an answer change", () => {
    const kredit = file(an("kredit"));
    const before = mkState({ ...GERBER_ANSWERS, kredite: "Nein" });
    expect(placeAll([kredit], before, { now: NOW }).get(kredit.id)!.reason).toBe("offList");
    const after = mkState({ ...GERBER_ANSWERS, kredite: "Ja" });
    expect(placeAll([kredit], after, { now: NOW }).get(kredit.id)).toMatchObject({ instanceId: "kredit", reason: "placed" });
    // and back
    const [f] = placedFiles([kredit], after, { now: NOW });
    expect(f.instanceId).toBe("kredit");
    const [g] = placedFiles([f], before, { now: NOW });
    expect(g.instanceId).toBeNull();
    expect(g.analysis!.extraKind).toBe("surplus");
  });

  it("places per-borrower documents by the printed name", () => {
    const anna = { id: "b2", vor: "Anna", nach: "Muster", job: "Angestellt" as const, pkSe: "Nein" as const };
    const state = mkState({}, {}, {}, [GARY, anna]);
    const a = file(an("id", { personName: "MUSTER Anna Maria" }));
    const g = file(an("id", { personName: "Gerber Gary Samuel" }));
    const x = file(an("id", { personName: "Somebody Else" }));
    const map = placeAll([a, g, x], state, { now: NOW });
    expect(map.get(a.id)!.instanceId).toBe("id#b2");
    expect(map.get(g.id)!.instanceId).toBe("id#b1");
    expect(map.get(x.id)).toMatchObject({ extraKind: "unknown", reason: "person", requirementId: "id" });
  });

  it("tells spouses with one family name apart by the given name", () => {
    const eva = { id: "b2", vor: "Eva", nach: "Gerber", job: "Angestellt" as const, pkSe: "Nein" as const };
    const state = mkState({}, {}, {}, [GARY, eva]);
    const e = file(an("lohnausweise", { docDate: "2024", personName: "Gerber Eva" }));
    expect(placeAll([e], state, { now: NOW }).get(e.id)!.instanceId).toBe("lohnausweise#b2");
    expect(personScore("Gerber Eva", { kind: "borrower", first: "Gary", last: "Gerber", display: "" })).toBe(2);
    expect(personScore("Gerber Eva", { kind: "borrower", first: "Eva", last: "Gerber", display: "" })).toBe(3);
  });

  it("places a passport on the guarantor or the signatory by person", () => {
    const state = mkState({ buerge: "Ja" }, {}, { buergeName: "Hans Bürgi" });
    const p = file(an("id", { personName: "Buergi Hans" }));
    const q = file(an("id", { personName: "Bürgi Hans" }));
    const g = file(an("id", { personName: "Gerber Gary" }));
    const map = placeAll([p, g, q], state, { now: NOW });
    expect(map.get(p.id)!.instanceId).toBe("b_id");
    expect(map.get(g.id)!.instanceId).toBe("id#b1");
    // «Bürgi» and «BUERGI» are one name: the second passport is one too many.
    expect(map.get(q.id)!.reason).toBe("full");

    const jp = mkState({ kn: "Juristische Person" }, {}, { firma: "Muster AG", zeichner: "Max Muster" });
    const pass = file(an("id", { personName: "Muster Max" }));
    expect(placeAll([pass], jp, { now: NOW }).get(pass.id)!.instanceId).toBe("wb");
  });

  it("keeps a manual assignment while its requirement is on the list", () => {
    const u = file(an(null), { instanceId: "fotos", assignedByUser: true });
    const map = placeAll([u], gerber(), { now: NOW });
    expect(map.get(u.id)).toMatchObject({ instanceId: "fotos", reason: "manual" });
    const proj = mkState({ immo: "Bauprojekt" });
    expect(placeAll([u], proj, { now: NOW }).get(u.id)!.reason).toBe("unknown");
  });

  it("leaves files that are still being read unplaced", () => {
    const f = file(undefined);
    expect(placeAll([f], gerber(), { now: NOW }).get(f.id)!.reason).toBe("pending");
  });
});

describe("documentsSummary", () => {
  it("states, suggestions, hints and the submitted documents", () => {
    const state = mkState({ ...GERBER_ANSWERS, kredite: "Nein" });
    const gb = file(an("grundbuch", { docDate: "2026-01-15", outdated: true, outdatedReason: "alt" }));
    const kredit = file(an("kredit", { note: "Wird mit der Erhöhung abgelöst." }));
    const nn = file(an("nn_steuerrechnung"));
    const kept = file(an("nn_betriebskosten"), { keep: true });
    const s = documentsSummary({ ...state, files: [gb, kredit, nn, kept], skipped: ["verkaufsdoku"], dismissed: [] }, { now: NOW });
    const st = (id: string) => s.status.requirements.find((r) => r.instance.instanceId === id)!.state;
    expect(st("grundbuch")).toBe("outdated");
    expect(st("verkaufsdoku")).toBe("skipped");
    expect(s.suggestions.map((x) => x.key)).toEqual(["loan"]);
    expect(s.suggestions[0].fileIds).toEqual([kredit.id]);
    expect(s.hints.map((h) => h.kind)).toEqual(["outdated"]);
    const sub = s.submittedDocuments();
    expect(sub.map((d) => d.documentId)).toEqual([gb.documentId, kredit.documentId, kept.documentId]);
    expect(sub[0]).toMatchObject({ instanceId: "grundbuch", requirementId: "grundbuch" });
    expect(sub[1]).toMatchObject({ instanceId: null, requirementId: "kredit", extraKind: "surplus" });
    expect(sub[2]).toMatchObject({ keep: true, extraKind: "notneeded" });
    expect(isSubmitted(s.files.find((f) => f.id === nn.id)!)).toBe(false);

    // Accepting the suggestion: the Kreditvertrag counts and becomes a bank hint.
    const after = documentsSummary({ ...mkState(GERBER_ANSWERS), files: [gb, kredit], skipped: [], dismissed: [] }, { now: NOW });
    expect(after.suggestions).toEqual([]);
    expect(after.hints.find((h) => h.kind === "kredit")!.text).toBe("Wird mit der Erhöhung abgelöst.");

    // Dismissed: no suggestion any more.
    const dis = documentsSummary({ ...state, files: [kredit], skipped: [], dismissed: [kredit.id] }, { now: NOW });
    expect(dis.suggestions).toEqual([]);
    expect(dis.placements.get(kredit.id)!.reason).toBe("dismissed");
  });

  it("sends the customer's corrections and choices", () => {
    const f = file(an("grundbuch", { outdated: true }), { outdatedOverride: true, humanEdits: { Eigentümer: "Gerber Gary" }, confirmed: true, nameOverride: "X.pdf" });
    const s = documentsSummary({ ...gerber(), files: [f], skipped: [], dismissed: [] }, { now: NOW });
    expect(s.submittedDocuments()[0]).toEqual({
      documentId: f.documentId,
      instanceId: "grundbuch",
      requirementId: "grundbuch",
      outdatedOverride: true,
      humanEdits: { Eigentümer: "Gerber Gary" },
      confirmed: true,
      storedName: "X.pdf",
    });
    expect(s.status.requirements.find((r) => r.instance.id === "grundbuch")!.state).toBe("ok");
  });
});
