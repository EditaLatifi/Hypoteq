/**
 * Handover 9, DECISIONS V9: an inquiry stored before v5 (`Inquiry.v3State`, version 1) read
 * into the v5 shape (lib/funnel-v3/legacy.ts), so its Nachreich page still opens and asks for
 * what the customer said they have.
 */
import { describe, it, expect } from "@jest/globals";
import { normaliseFunnelState, FUNNEL_STATE_VERSION } from "@/lib/funnel-v3/legacy";
import { storedV3State, v3InquiryColumns } from "@/lib/funnel-v3/nachreich";
import { v3StateOf } from "@/lib/funnel-v3/completion";
import { reqList } from "@/lib/funnel-v3/requirements";
import { calcForState } from "@/lib/funnel-v3/calc";
import { buildDossierModel } from "@/lib/funnel-v3/dossier";
import { EMPTY_EM } from "@/lib/funnel-v3/types";
import { ANNA, GARY, v3StateFor } from "./nachreichFixtures";

describe("normaliseFunnelState — a v3-shaped stored state", () => {
  const raw = v3StateFor([GARY, ANNA]);
  const s = normaliseFunnelState(raw)!;

  it("keeps every answer v5 still asks, with its value", () => {
    expect(s.role).toBe("kunde");
    expect(s.mode).toBe("begleitet");
    expect(s.ans).toMatchObject({ antrag: "Ablösung", kn: "Natürliche Person", anrede: "Herr", immo: "Bestehende Immobilie", lieg: "Stockwerkeigentum", nutz: "Selbstbewohnt", aufstockung: "Ja", kredite: "Ja", leasing: "Ja", buerge: "Nein", baurecht: "Nein", angebote: "Nein", steuer: "Nein", laufzeit: "3 Jahre" });
    expect(s.txt.vor).toBe("Gary");
    expect(s.txt.kaufdatum).toBe("");
    expect(s.fin).toEqual({ old: 449000, up: 201000, kaufpreis: 0, renoBetrag: 0, val: 1450000, miete: 0, inc: 125000, inc2: 0 });
    expect(s.em).toEqual(EMPTY_EM);
    expect(s.borrowers).toEqual([GARY, ANNA]);
    expect(s.src).toEqual({});
    expect(s.sig).toBeNull();
  });

  it("drops what v5 no longer asks from the answers, carrying its meaning over", () => {
    for (const k of ["kinder", "ab50", "heizung", "s3a", "schenkung", "erbe", "darlehen", "pk"]) expect(s.ans).not.toHaveProperty(k);
    // P11 needed Kinder = Ja and Unterhalt = Ja: the chip.
    expect(s.ans.unterhalt).toBe("Ja");
    expect(normaliseFunnelState({ ...raw, ans: { ...raw.ans, kinder: "Nein", unterhalt: "Ja" } })!.ans.unterhalt).toBe("Nein");
    // «ab 50 = Ja» becomes the fact v5 reads from the ID.
    expect(s.info.ab50).toBeUndefined();
    expect(normaliseFunnelState({ ...raw, ans: { ...raw.ans, ab50: "Ja" } })!.info.ab50).toBe(true);
    // «Unbekannt» says nothing; a real answer is kept as the document fact.
    expect(s.info.heizung).toBeUndefined();
    expect(normaliseFunnelState({ ...raw, ans: { ...raw.ans, heizung: "Wärmepumpe" } })!.info.heizung).toBe("Wärmepumpe");
    // The Eigenmittel yes/no answers, without inventing amounts.
    expect(s.legacyEquity).toEqual({ s3a: "Ja", pk: "Nein", schenkung: "Nein", erbe: "Nein", darlehen: "Nein" });
    expect(s.legacy).toEqual({ kinder: "Ja", ab50: "Nein", heizung: "Unbekannt" });
  });

  it("Ferienobjekt: no Liegenschaft, kept for display", () => {
    const f = normaliseFunnelState({ ...raw, ans: { ...raw.ans, lieg: "Ferienobjekt", nutz: "Zweitwohnsitz" } })!;
    expect(f.ans.lieg).toBeUndefined();
    expect(f.ans.nutz).toBe("Zweitwohnsitz");
    expect(f.legacy!.lieg).toBe("Ferienobjekt");
  });

  it("the v5 rules ask for what the v3 answers mean", () => {
    const ids = reqList(s).map((r) => r.instanceId);
    // The 3a «Ja» still asks for the Bescheinigung and the Police; the Unterhalt chip for P11.
    expect(ids).toEqual(expect.arrayContaining(["s3a", "police", "unterhalt", "produkt", "hyp_zins", "id#b2", "pk#b2"]));
    // What v5 dropped is not asked any more.
    expect(ids).not.toEqual(expect.arrayContaining(["hyp_rahmen"]));
    expect(ids.some((id) => id.startsWith("anstellung") || id.startsWith("steuer#b2"))).toBe(false);
    // The calculation runs on the v5 shape: Ablösung 449'000 + 201'000.
    expect(calcForState(s).need).toBe(650000);
  });

  it("a stored v3 «Pensionskasse = Ja» asks for the PK-Vorbezug confirmation (the old combined document)", () => {
    const p = normaliseFunnelState({ ...raw, ans: { ...raw.ans, antrag: "Neue Hypothek", pk: "Ja", schenkung: "Ja" } })!;
    expect(reqList(p).filter((r) => r.group === "eigenmittel").map((r) => r.id)).toEqual(["vermoegen", "s3a", "police", "pkvorbezug", "schenkung"]);
  });

  it("the dossier of a v3 inquiry still shows its stored answers", () => {
    const m = buildDossierModel({ lang: "de", draft: false, caseNumber: "HQ-26-10-000123", date: new Date("2026-10-15"), state: s, files: [] });
    const rows = Object.fromEntries(m.sections[2].columns!.flat().map((kv) => [kv.label, kv.value]));
    expect(rows["Kinder"]).toBe("Ja");
    expect(m.sections[3].notes!.join(" ")).toMatch(/Säule 3a/);
  });

  it("is null for what is not a funnel state, and reads malformed parts as defaults", () => {
    expect(normaliseFunnelState(null)).toBeNull();
    expect(normaliseFunnelState({ ans: {} })).toBeNull();
    const m = normaliseFunnelState({ ans: { antrag: "Kredit", kn: "x", lieg: 4 }, txt: { vor: 7 }, fin: { old: "12", inc: -5 }, borrowers: [{ vor: "A", job: "Chef" }, "x"] })!;
    expect(m.ans.antrag).toBeUndefined();
    expect(m.ans.kn).toBe("Natürliche Person");
    expect(m.txt.vor).toBe("");
    expect(m.fin.old).toBe(12);
    expect(m.fin.inc).toBe(0);
    expect(m.borrowers).toEqual([{ id: "b1", vor: "A", nach: "", pkSe: "Nein" }]);
  });
});

describe("the v5 shape round-trips", () => {
  it("stored by v3InquiryColumns, read by storedV3State / v3StateOf, legacy marks kept", () => {
    const cols = v3InquiryColumns({ v3: v3StateFor([GARY]) }, "it") as any;
    expect(cols.v3State.version).toBe(FUNNEL_STATE_VERSION);
    expect(cols.v3State.legacyEquity).toEqual({ s3a: "Ja", pk: "Nein", schenkung: "Nein", erbe: "Nein", darlehen: "Nein" });
    const back = storedV3State({ v3State: JSON.parse(JSON.stringify(cols.v3State)) })!;
    expect(back.lang).toBe("it");
    expect(back.legacyEquity!.s3a).toBe("Ja");
    expect(back.ans.unterhalt).toBe("Ja");
    expect(reqList(back).some((r) => r.id === "police")).toBe(true);
    expect(v3StateOf({ v3: cols.v3State })!.legacy).toEqual(cols.v3State.legacy);
  });

  it("a v5 state passes through unchanged", () => {
    const v5 = { version: 2, role: "berater", mode: "schnell", ans: { antrag: "Neue Hypothek", kn: "Natürliche Person", steuer: "Ja" }, txt: { kaufdatum: "1.4.2027" }, fin: { kaufpreis: 900000, renoBetrag: 50000 }, em: { spar: 100000 }, info: { geb: "04.01.1988" }, src: { "fin.kaufpreis": { doc: "Kaufvertrag", unsure: false } }, sig: { choice: "later", at: "2026-10-15T08:00:00Z", method: "upload" }, borrowers: [] };
    const s = normaliseFunnelState(v5)!;
    expect(s).toMatchObject({ role: "berater", mode: "schnell", ans: { steuer: "Ja" }, txt: { kaufdatum: "1.4.2027" }, fin: { kaufpreis: 900000, renoBetrag: 50000 }, em: { spar: 100000 }, info: { geb: "04.01.1988" }, sig: { choice: "later" } });
    expect(s.src["fin.kaufpreis"]).toEqual({ doc: "Kaufvertrag", unsure: false });
    expect(s.legacyEquity).toBeUndefined();
  });
});
