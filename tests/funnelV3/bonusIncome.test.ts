/**
 * HYPOTEQ Komplett-Test A03 (06.11., again 18.11.2026; DECISIONS V122): A Lohnausweis shows
 * CHF 140'000 Bruttolohn total, of which CHF 15'000 under Ziffer 3 «Antrittsentschädigung + Bonus».
 * The income HYPOTEQ counts is CHF 125'000 — a bonus only as the average of three years' Lohnausweise.
 */
import { describe, it, expect } from "@jest/globals";
import type { FileEntry, V3Analysis } from "@/lib/funnel-v3/files";
import { reqList } from "@/lib/funnel-v3/requirements";
import { crossChecks } from "@/components/funnel-v3/documents/view";
import { prefillFromDocuments } from "@/lib/funnel-v3/prefill";
import { docFacts, type AnalysedFile } from "@/lib/funnel-v3/facts";
import { evaluateAbgleich } from "@/lib/funnel-v3/abgleich/evaluate";
import { creditableBonus, irregularPay, regularGross } from "@/lib/funnel-v3/salary";
import { DEFAULT_ANSWERS, EMPTY_AMOUNTS, EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import { kaufState } from "./v5Fixtures";
import { mkState } from "./helpers";

const NOW = new Date("2026-11-18T10:00:00Z");
let n = 0;

const lohn = (gross: string, bonus: string | null, year = "2025", employer = "Zürcher Muster AG"): V3Analysis => ({
  status: "done",
  docTypeId: "lohnausweise",
  docTypeLabel: "Lohnausweis",
  confidence: 0.95,
  requirementId: "lohnausweise",
  docDate: year,
  fields: {
    Arbeitgeber: { value: employer, confidence: 0.95 },
    Jahr: { value: year, confidence: 0.95 },
    Bruttolohn: { value: gross, confidence: 0.95 },
    ...(bonus ? { "Unregelmässige Leistungen": { value: bonus, confidence: 0.93 } } : {}),
  },
  contentHash: `hash-${++n}`,
});
const SAMPLE = () => lohn("CHF 140'000", "CHF 15'000");
const analysed = (list: V3Analysis[]): AnalysedFile[] => list.map((analysis) => ({ fileId: `f${++n}`, analysis }));
const prefill = (list: V3Analysis[]) =>
  prefillFromDocuments(analysed(list), { ans: { ...DEFAULT_ANSWERS }, txt: { ...EMPTY_TEXTS }, borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" }], touched: {} }, { now: NOW });

describe("the income without Ziffer 3", () => {
  it("reads Ziffer 3 and takes it off the Bruttolohn", () => {
    expect(irregularPay(SAMPLE())).toBe(15000);
    expect(regularGross(SAMPLE(), 140000)).toBe(125000);
    // Not read (an analysis from before 18.11.): the Bruttolohn as before.
    expect(regularGross(lohn("CHF 110'310", null), 110310)).toBe(110310);
  });

  it("the Schnellanmeldung prefills CHF 125'000, not CHF 140'000", () => {
    expect(prefill([SAMPLE()]).values["fin.inc"]).toBe(125000);
  });

  it("with three years of Lohnausweise, each with a bonus: the average is added", () => {
    const r = prefill([SAMPLE(), lohn("CHF 139'000", "CHF 12'000", "2024"), lohn("CHF 136'000", "CHF 9'000", "2023")]);
    expect(r.values["fin.inc"]).toBe(125000 + Math.round((15000 + 12000 + 9000) / 3));
  });

  it("no average without all three years, or without a bonus in the current one", () => {
    expect(creditableBonus([SAMPLE(), lohn("CHF 139'000", "CHF 12'000", "2024")])).toBe(0);
    expect(creditableBonus([lohn("CHF 125'000", null), lohn("CHF 139'000", "CHF 12'000", "2024"), lohn("CHF 136'000", "CHF 9'000", "2023")])).toBe(0);
  });

  it("a printed bonus asks for the two Lohnausweise before (P5)", () => {
    const facts = docFacts(analysed([SAMPLE()]), { others: [] }, NOW);
    expect(facts.bonus).toBe(true);
    const s = mkState({}, {}, {}, undefined, { info: { bonus: true } });
    expect(reqList(s).some((i) => i.id === "lohnausweise_alt")).toBe(true);
    expect(docFacts(analysed([lohn("CHF 110'310", null)]), { others: [] }, NOW).bonus).toBe(false);
  });

  it("the funnel's own check against CHF 125'000 is ok", () => {
    const inst = reqList(mkState()).find((i) => i.id === "lohnausweise")!;
    const file: FileEntry = { id: "g", name: "lohn.pdf", size: 1, uploadState: "uploaded", analysisState: "done", analysis: SAMPLE() };
    expect(crossChecks(inst, [file], { ...EMPTY_AMOUNTS, inc: 125000 }, 1)).toEqual([{ kind: "funnel", field: "Bruttoeinkommen", funnel: 125000, doc: 125000, ok: true }]);
  });

  it("the Abgleich and the Pre-Check JSON compare CHF 125'000", () => {
    const s = kaufState({ fin: { ...kaufState().fin, inc: 125000 } });
    const inst = reqList(s).find((i) => i.id === "lohnausweise" && i.borrowerId === "b1")!.instanceId;
    const f = evaluateAbgleich({ state: s, docs: [{ id: "d1", instanceId: inst, analysis: SAMPLE() }] }).fields.find((x) => x.id === "jahreseinkommen:b1")!;
    expect(f.result).toBe("ok");
    expect(f.extracted[0]).toMatchObject({ value: 125000, field: "Bruttolohn − Unregelmässige Leistungen" });
  });

  it("the customer's CHF 140'000 with the bonus is a difference to choose, with the bonus explanation", () => {
    const s = kaufState({ fin: { ...kaufState().fin, inc: 140000 } });
    const inst = reqList(s).find((i) => i.id === "lohnausweise" && i.borrowerId === "b1")!.instanceId;
    const f = evaluateAbgleich({ state: s, docs: [{ id: "d1", instanceId: inst, analysis: SAMPLE() }] }).fields.find((x) => x.id === "jahreseinkommen:b1")!;
    expect(f.result).not.toBe("ok");
  });
});
