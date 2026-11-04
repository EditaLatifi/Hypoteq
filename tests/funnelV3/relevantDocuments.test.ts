/**
 * HYPOTEQ 03.11.2026 Befund 2 (DECISIONS V103): a document of a type the answers do not ask for
 * is «Fallrelevant», not «Überzählig»; a Schenkungsvertrag, Erbvorbezug or Darlehensvertrag
 * without its Eigenmittel amount is suggested (Begleitete Anmeldung) or prefilled
 * (Schnellanmeldung), so its document is then asked for. Pure.
 */
import { describe, it, expect } from "@jest/globals";
import { answerCorrections } from "@/lib/funnel-v3/requirementStatus";
import { correctionValues, prefillFromDocuments } from "@/lib/funnel-v3/prefill";
import type { AnalysedFile } from "@/lib/funnel-v3/facts";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { Placement } from "@/lib/funnel-v3/placeFile";
import { DEFAULT_ANSWERS, EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import { EXTRA_GROUP_LABEL, STATE_LOOK, groupExtras, isRelevantExtra } from "@/components/funnel-v3/documents/view";
import { LANGS, hasKey } from "@/lib/funnel-v3/i18n";
import { mkState } from "./helpers";

const place = (extraKind: Placement["extraKind"], reason: Placement["reason"], requirementId: string | null = null): Placement => ({ instanceId: null, requirementId, extraKind, reason });

describe("«Fallrelevant» instead of «Überzählig»", () => {
  it("a type the answers do not ask for and a further Auskunftsermächtigung; not a further copy or an old year", () => {
    expect(isRelevantExtra(place("surplus", "offList", "leasing"))).toBe(true);
    expect(isRelevantExtra(place("surplus", "full", "vollmacht"))).toBe(true);
    expect(isRelevantExtra(place("surplus", "full", "lohnausweise#b1"))).toBe(false);
    expect(isRelevantExtra(place("surplus", "period", "lohnausweise#b1"))).toBe(false);
    expect(isRelevantExtra(place("notneeded", "dismissed", "leasing"))).toBe(false);
    expect(isRelevantExtra(undefined)).toBe(false);
  });

  it("its own group, before «Überzählig», in every language", () => {
    const f = (id: string): FileEntry => ({ id, name: `${id}.pdf`, size: 1, uploadState: "uploaded", analysisState: "done" } as FileEntry);
    const placements = new Map<string, Placement>([
      ["a", place("surplus", "offList", "leasing")],
      ["b", place("surplus", "full", "id")],
    ]);
    expect(groupExtras([f("a"), f("b")], placements).map((g) => [g.key, g.files.map((x) => x.id)])).toEqual([
      ["relevant", ["a"]],
      ["surplus", ["b"]],
    ]);
    for (const l of LANGS) {
      for (const k of [EXTRA_GROUP_LABEL.relevant, STATE_LOOK.relevant.labelKey, "docs.x.relevantCopy", "docs.x.offList"]) expect([l, k, hasKey(l, k)]).toEqual([l, k, true]);
    }
  });
});

describe("Schenkung, Erbvorbezug, Darlehen: the amount brings the document onto the list", () => {
  const kauf = mkState({ antrag: "Neue Hypothek", immo: "Bestehende Immobilie", lieg: "Einfamilienhaus" });

  it("Begleitete Anmeldung: suggests the amount read, or entering it by hand", () => {
    expect(answerCorrections(kauf, ["schenkung"], { schenk: 50000 })).toEqual([
      { key: "schenk", titleKey: "sug.schenk.title", textKey: "sug.schenk.amountText", params: { amount: 50000 }, patch: { em: { schenk: 50000 } }, requirementIds: ["schenkung"] },
    ]);
    expect(answerCorrections(kauf, ["erbe"])[0]).toMatchObject({ key: "erbe", textKey: "sug.erbe.enterText", patch: {}, focus: "em.erbe", requirementIds: ["erbe"] });
    expect(answerCorrections(kauf, ["darlehen"], { darl: 30000 })[0]).toMatchObject({ key: "darl", patch: { em: { darl: 30000 } } });
    for (const l of LANGS) for (const k of ["schenk", "erbe", "darl"]) for (const s of ["title", "amountText", "enterText"]) expect([l, hasKey(l, `sug.${k}.${s}`)]).toEqual([l, true]);
  });

  it("not at an Ablösung (no such Eigenmittel row), not when the amount is already there", () => {
    const abl = mkState({ antrag: "Ablösung", immo: "Bestehende Immobilie", lieg: "Einfamilienhaus" });
    expect(answerCorrections(abl, ["schenkung"], { schenk: 50000 })).toEqual([]);
    const withAmount = mkState({ antrag: "Neue Hypothek", immo: "Bestehende Immobilie", lieg: "Einfamilienhaus" }, {}, {}, undefined, { em: { spar: 0, s3a: 0, pkVor: 0, pkVerp: 0, schenk: 50000, erbe: 0, darl: 0 } });
    expect(answerCorrections(withAmount, ["schenkung"], { schenk: 50000 })).toEqual([]);
  });

  const file = (docTypeId: string, betrag: string): AnalysedFile => ({
    fileId: `f-${docTypeId}-${betrag}`,
    analysis: { status: "done", docTypeId, docTypeLabel: docTypeId, confidence: 0.95, requirementId: docTypeId, fields: { Betrag: { value: betrag, confidence: 0.93 } } },
  } as AnalysedFile);

  it("the amounts a suggestion carries: several contracts of one kind add up", () => {
    expect(correctionValues([file("schenkung", "CHF 50'000"), file("schenkung", "CHF 20'000"), file("darlehen", "CHF 30'000")])).toEqual({ schenk: 70000, darl: 30000 });
  });

  it("Schnellanmeldung: the contract's amount is prefilled at a Kauf, never at an Ablösung", () => {
    const st = (antrag: string) => ({ ans: { ...DEFAULT_ANSWERS, antrag }, txt: { ...EMPTY_TEXTS }, borrowers: [{ id: "b1", vor: "", nach: "", pkSe: "Nein" as const }], touched: {} }) as any;
    const r = prefillFromDocuments([file("schenkung", "CHF 50'000")], st("Neue Hypothek"));
    expect(r.values["em.schenk"]).toBe(50000);
    expect(r.src["em.schenk"]).toMatchObject({ unsure: false });
    expect(prefillFromDocuments([file("schenkung", "CHF 50'000")], st("Ablösung")).values["em.schenk"]).toBeUndefined();
  });
});
